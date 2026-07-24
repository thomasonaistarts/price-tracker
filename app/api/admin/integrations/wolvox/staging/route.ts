import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  createWolvoxMatchPreview,
  prepareWolvoxCatalog,
  summarizeWolvoxMatches,
  type ExistingCatalogProduct,
  type WolvoxCatalogInput,
  type WolvoxStagingProduct,
} from '@/lib/integrations/wolvox-catalog'
import {
  sanitizeWolvoxStagingDecisions,
  summarizeWolvoxStagingDecisions,
} from '@/lib/integrations/wolvox-staging-decisions'
import { buildWolvoxProductDrafts } from '@/lib/integrations/wolvox-product-draft'
import { assessWolvoxCatalogQuality } from '@/lib/integrations/wolvox-data-quality'

const PAGE_SIZE = 1000
const MAX_CATALOG_ROWS = 10000
const MAX_CHUNK_ROWS = 500

type StagingRequest = {
  action?: unknown
  connection_id?: unknown
  sync_run_id?: unknown
  expected_count?: unknown
  row_offset?: unknown
  products?: unknown
  decisions?: unknown
  expected_delete_count?: unknown
  expected_insert_count?: unknown
  confirmation_code?: unknown
}

async function requireConnection(supabase: any, connectionId: string | null) {
  let query = supabase
    .from('integration_connections')
    .select('id, owner_user_id, display_name, status')
    .eq('provider', 'wolvox')

  query = connectionId ? query.eq('id', connectionId) : query.order('created_at', { ascending: false }).limit(1)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

async function readAllStaging(supabase: any, connectionId: string, syncRunId?: string) {
  const rows: WolvoxStagingProduct[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('wolvox_product_staging')
      .select('external_id, sku, barcode, product_name, brand, category, sales_price, purchase_cost, vat_rate, stock_quantity, unit_name, is_active, validation_errors, raw_data')
      .eq('connection_id', connectionId)
      .order('external_id')
      .range(from, from + PAGE_SIZE - 1)
    if (syncRunId) query = query.eq('sync_run_id', syncRunId)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

async function readAllProducts(supabase: any, ownerUserId: string) {
  const rows: ExistingCatalogProduct[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, product_name')
      .eq('user_id', ownerUserId)
      .order('sku')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Yönetici yetkisi gerekli' }, { status: 403 })
  }

  const supabase = createAdminClient() as any
  try {
    const connection = await requireConnection(supabase, req.nextUrl.searchParams.get('connection_id'))
    if (!connection) return NextResponse.json({
      connection: null,
      total: 0,
      summary: emptySummary(),
      preview: [],
      issues: [],
      resolution: emptyResolution(),
      latest_run: null,
    })

    const [staging, products, latestRunResult, globalProductCountResult, latestArchiveResult] = await Promise.all([
      readAllStaging(supabase, connection.id),
      readAllProducts(supabase, connection.owner_user_id),
      supabase
        .from('integration_sync_runs')
        .select('*')
        .eq('connection_id', connection.id)
        .eq('entity_type', 'catalog')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase
        .from('data_archive_batches')
        .select('id, status, source_counts, archive_counts, verified_at')
        .eq('status', 'verified')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (latestRunResult.error) throw latestRunResult.error
    if (globalProductCountResult.error) throw globalProductCountResult.error
    if (latestArchiveResult.error) throw latestArchiveResult.error

    const preview = createWolvoxMatchPreview(staging, products)
    const decisions = readSavedDecisions(latestRunResult.data)
    const issues = preview
      .filter(item => item.status === 'invalid' || item.status === 'conflict')
      .map(item => ({
        ...item,
        status: item.status as 'invalid' | 'conflict',
        decision: decisions[item.external_id] ?? null,
      }))
    const resolution = summarizeWolvoxStagingDecisions(issues, decisions)
    const drafts = buildWolvoxProductDrafts(staging, connection.owner_user_id, { decisions })
    const archiveVerified = archiveCountsEqual(
      latestArchiveResult.data?.source_counts,
      latestArchiveResult.data?.archive_counts,
    )
    const deleteCount = globalProductCountResult.count ?? 0
    const cutoverPlan = {
      ready: latestRunResult.data?.status === 'succeeded'
        && archiveVerified
        && resolution.unresolvedInvalid === 0
        && resolution.unresolvedConflict === 0
        && drafts.rejected.length === 0
        && drafts.drafts.length > 0,
      archive_batch_id: latestArchiveResult.data?.id ?? null,
      archive_verified: archiveVerified,
      delete_count: deleteCount,
      insert_count: drafts.drafts.length,
      excluded_count: drafts.excluded.length,
      rejected_count: drafts.rejected.length,
      cleared_barcode_count: drafts.clearedBarcodeCount,
      owner_user_id: connection.owner_user_id,
      confirmation_code: `WOLVOX-${drafts.drafts.length}-${deleteCount}`,
    }
    return NextResponse.json({
      connection,
      total: preview.length,
      summary: summarizeWolvoxMatches(preview),
      data_quality: assessWolvoxCatalogQuality(staging),
      preview: preview.slice(0, 50),
      issues: issues.slice(0, 200),
      resolution,
      cutover_plan: cutoverPlan,
      latest_run: latestRunResult.data ?? null,
      live_product_count: products.length,
    })
  } catch {
    return NextResponse.json({ error: 'Wolvox staging önizlemesi okunamadı' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Yönetici yetkisi gerekli' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as StagingRequest | null
  if (!body || typeof body.connection_id !== 'string') {
    return NextResponse.json({ error: 'connection_id gerekli' }, { status: 400 })
  }

  const supabase = createAdminClient() as any
  const connection = await requireConnection(supabase, body.connection_id).catch(() => null)
  if (!connection) return NextResponse.json({ error: 'Wolvox bağlantısı bulunamadı' }, { status: 404 })

  try {
    if (body.action === 'execute_cutover') {
      if (
        typeof body.sync_run_id !== 'string'
        || !Number.isInteger(body.expected_delete_count)
        || !Number.isInteger(body.expected_insert_count)
        || typeof body.confirmation_code !== 'string'
      ) {
        return NextResponse.json({ error: 'Geçiş sayımları, sync_run_id ve onay kodu gerekli' }, { status: 400 })
      }

      const { data, error } = await supabase.rpc('execute_wolvox_catalog_cutover', {
        p_connection_id: connection.id,
        p_sync_run_id: body.sync_run_id,
        p_expected_delete_count: body.expected_delete_count,
        p_expected_insert_count: body.expected_insert_count,
        p_confirmation_code: body.confirmation_code,
      })
      if (error) {
        const safeMessage = typeof error.message === 'string' ? error.message.slice(0, 300) : 'Bilinmeyen veritabanı hatası'
        return NextResponse.json({ error: `Canlı geçiş uygulanamadı: ${safeMessage}` }, { status: 409 })
      }
      return NextResponse.json({ success: true, action: 'execute_cutover', result: data })
    }

    if (body.action === 'save_decisions') {
      if (typeof body.sync_run_id !== 'string') {
        return NextResponse.json({ error: 'sync_run_id gerekli' }, { status: 400 })
      }

      const { data: run, error: runError } = await supabase
        .from('integration_sync_runs')
        .select('id, status, details')
        .eq('id', body.sync_run_id)
        .eq('connection_id', connection.id)
        .eq('entity_type', 'catalog')
        .maybeSingle()
      if (runError) throw runError
      if (!run || run.status !== 'succeeded') {
        return NextResponse.json({ error: 'Kararlar yalnızca başarılı staging çalışmasına kaydedilebilir' }, { status: 409 })
      }

      const [staging, products] = await Promise.all([
        readAllStaging(supabase, connection.id, run.id),
        readAllProducts(supabase, connection.owner_user_id),
      ])
      const issues = createWolvoxMatchPreview(staging, products)
        .filter(item => item.status === 'invalid' || item.status === 'conflict')
        .map(item => ({ ...item, status: item.status as 'invalid' | 'conflict' }))
      const issueById = new Map(issues.map(issue => [issue.external_id, issue]))
      const requestedDecisions = sanitizeWolvoxStagingDecisions(body.decisions)
      const acceptedDecisions = Object.fromEntries(Object.entries(requestedDecisions).filter(([externalId, decision]) => {
        const issue = issueById.get(externalId)
        if (!issue) return false
        return issue.status === 'conflict' || decision === 'exclude'
      }))
      const resolution = summarizeWolvoxStagingDecisions(issues, acceptedDecisions)

      const { error: updateError } = await supabase
        .from('integration_sync_runs')
        .update({
          details: {
            ...(run.details && typeof run.details === 'object' ? run.details : {}),
            record_decisions: acceptedDecisions,
            decision_summary: resolution,
          },
        })
        .eq('id', run.id)
      if (updateError) throw updateError

      return NextResponse.json({
        success: true,
        action: 'save_decisions',
        decisions: acceptedDecisions,
        resolution,
      })
    }

    if (body.action === 'start') {
      const expectedCount = Number(body.expected_count)
      if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > MAX_CATALOG_ROWS) {
        return NextResponse.json({ error: `expected_count 1-${MAX_CATALOG_ROWS} arasında olmalı` }, { status: 400 })
      }

      const { data: run, error: runError } = await supabase
        .from('integration_sync_runs')
        .insert({
          connection_id: connection.id,
          direction: 'inbound',
          entity_type: 'catalog',
          status: 'running',
          received_count: expectedCount,
          valid_count: 0,
          invalid_count: 0,
          details: {
            source: 'admin_xml_upload',
            expected_count: expectedCount,
            uploaded_count: 0,
          },
        })
        .select()
        .single()
      if (runError || !run) throw runError ?? new Error('sync_run_create_failed')

      return NextResponse.json({
        success: true,
        action: 'start',
        sync_run_id: run.id,
        expected_count: expectedCount,
        max_chunk_rows: MAX_CHUNK_ROWS,
      })
    }

    if (body.action === 'append') {
      if (typeof body.sync_run_id !== 'string' || !Array.isArray(body.products)) {
        return NextResponse.json({ error: 'sync_run_id ve products dizisi gerekli' }, { status: 400 })
      }
      if (body.products.length < 1 || body.products.length > MAX_CHUNK_ROWS) {
        return NextResponse.json({ error: `Her parça 1-${MAX_CHUNK_ROWS} ürün içermeli` }, { status: 400 })
      }
      const rowOffset = Number(body.row_offset ?? 0)
      if (!Number.isInteger(rowOffset) || rowOffset < 0 || rowOffset >= MAX_CATALOG_ROWS) {
        return NextResponse.json({ error: 'row_offset geçersiz' }, { status: 400 })
      }

      const run = await requireRunningSync(supabase, connection.id, body.sync_run_id)
      if (!run) return NextResponse.json({ error: 'Aktif staging çalışması bulunamadı' }, { status: 409 })

      const expectedCount = readExpectedCount(run)
      const preparation = prepareWolvoxCatalog(body.products as WolvoxCatalogInput[], rowOffset)
      const chunk = preparation.records.map(record => ({
        ...record,
        connection_id: connection.id,
        sync_run_id: run.id,
      }))
      const { error } = await supabase
        .from('wolvox_product_staging')
        .upsert(chunk, { onConflict: 'connection_id,external_id' })
      if (error) throw error

      const { count, error: countError } = await supabase
        .from('wolvox_product_staging')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', connection.id)
        .eq('sync_run_id', run.id)
      if (countError) throw countError

      const uploadedCount = count ?? 0
      if (uploadedCount > expectedCount) {
        await failSync(supabase, run.id, 'uploaded_count_exceeds_expected')
        return NextResponse.json({ error: 'Yüklenen ürün sayısı beklenen toplamı aştı' }, { status: 409 })
      }

      const { error: updateError } = await supabase
        .from('integration_sync_runs')
        .update({
          details: {
            ...(run.details && typeof run.details === 'object' ? run.details : {}),
            expected_count: expectedCount,
            uploaded_count: uploadedCount,
          },
        })
        .eq('id', run.id)
      if (updateError) throw updateError

      return NextResponse.json({
        success: true,
        action: 'append',
        sync_run_id: run.id,
        accepted_count: preparation.receivedCount,
        uploaded_count: uploadedCount,
        expected_count: expectedCount,
      })
    }

    if (body.action === 'finalize') {
      if (typeof body.sync_run_id !== 'string') {
        return NextResponse.json({ error: 'sync_run_id gerekli' }, { status: 400 })
      }

      const run = await requireRunningSync(supabase, connection.id, body.sync_run_id)
      if (!run) return NextResponse.json({ error: 'Aktif staging çalışması bulunamadı' }, { status: 409 })
      const expectedCount = readExpectedCount(run)
      const staging = await readAllStaging(supabase, connection.id, run.id)

      if (staging.length !== expectedCount) {
        const reason = `staged_count_mismatch:${staging.length}/${expectedCount}`
        await failSync(supabase, run.id, reason)
        return NextResponse.json({
          error: `Staging doğrulaması başarısız: ${expectedCount} ürün bekleniyordu, ${staging.length} benzersiz ürün yüklendi`,
        }, { status: 409 })
      }

      const invalidCount = staging.filter(record => record.validation_errors.length > 0).length
      const validCount = staging.length - invalidCount
      const { error: cleanupError } = await supabase
        .from('wolvox_product_staging')
        .delete()
        .eq('connection_id', connection.id)
        .or(`sync_run_id.is.null,sync_run_id.neq.${run.id}`)
      if (cleanupError) throw cleanupError

      const { error: finishError } = await supabase
        .from('integration_sync_runs')
        .update({
          status: 'succeeded',
          valid_count: validCount,
          invalid_count: invalidCount,
          details: {
            ...(run.details && typeof run.details === 'object' ? run.details : {}),
            expected_count: expectedCount,
            uploaded_count: staging.length,
            finalized_count: staging.length,
          },
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
      if (finishError) throw finishError

      return NextResponse.json({
        success: true,
        action: 'finalize',
        sync_run_id: run.id,
        received_count: expectedCount,
        staged_count: staging.length,
        valid_count: validCount,
        invalid_count: invalidCount,
      })
    }

    return NextResponse.json({ error: 'Geçersiz staging işlemi' }, { status: 400 })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 500) : 'Bilinmeyen staging hatası'
    if (typeof body.sync_run_id === 'string') await failSync(supabase, body.sync_run_id, message)
    return NextResponse.json({ error: 'Wolvox kataloğu staging alanına alınamadı' }, { status: 500 })
  }
}

async function requireRunningSync(supabase: any, connectionId: string, syncRunId: string) {
  const { data, error } = await supabase
    .from('integration_sync_runs')
    .select('id, status, details')
    .eq('id', syncRunId)
    .eq('connection_id', connectionId)
    .eq('entity_type', 'catalog')
    .maybeSingle()
  if (error) throw error
  return data?.status === 'running' ? data : null
}

function readExpectedCount(run: { details?: unknown }) {
  const details = run.details && typeof run.details === 'object'
    ? run.details as Record<string, unknown>
    : {}
  const expectedCount = Number(details.expected_count)
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > MAX_CATALOG_ROWS) {
    throw new Error('invalid_expected_count')
  }
  return expectedCount
}

async function failSync(supabase: any, syncRunId: string, message: string) {
  await supabase
    .from('integration_sync_runs')
    .update({
      status: 'failed',
      error_message: message.slice(0, 500),
      finished_at: new Date().toISOString(),
    })
    .eq('id', syncRunId)
    .eq('status', 'running')
}

function readSavedDecisions(run: { details?: unknown } | null) {
  const details = run?.details && typeof run.details === 'object'
    ? run.details as Record<string, unknown>
    : {}
  return sanitizeWolvoxStagingDecisions(details.record_decisions)
}

function archiveCountsEqual(source: unknown, archive: unknown) {
  if (!source || !archive || typeof source !== 'object' || typeof archive !== 'object') return false
  const sourceCounts = source as Record<string, unknown>
  const archiveCounts = archive as Record<string, unknown>
  const keys = Object.keys(sourceCounts)
  return keys.length > 0 && keys.every(key => Number(sourceCounts[key]) === Number(archiveCounts[key]))
}

function emptySummary() {
  return { matched: 0, new: 0, conflict: 0, invalid: 0 }
}

function emptyResolution() {
  return {
    invalid: 0,
    conflict: 0,
    excluded: 0,
    useSku: 0,
    unresolvedInvalid: 0,
    unresolvedConflict: 0,
  }
}
