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

const PAGE_SIZE = 1000
const MAX_CATALOG_ROWS = 5000

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

async function readAllStaging(supabase: any, connectionId: string) {
  const rows: WolvoxStagingProduct[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('wolvox_product_staging')
      .select('external_id, sku, barcode, product_name, brand, category, sales_price, purchase_cost, vat_rate, stock_quantity, unit_name, is_active, validation_errors, raw_data')
      .eq('connection_id', connectionId)
      .order('external_id')
      .range(from, from + PAGE_SIZE - 1)
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
    if (!connection) return NextResponse.json({ connection: null, total: 0, summary: emptySummary(), preview: [], latest_run: null })

    const [staging, products, latestRunResult] = await Promise.all([
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
    ])
    if (latestRunResult.error) throw latestRunResult.error

    const preview = createWolvoxMatchPreview(staging, products)
    return NextResponse.json({
      connection,
      total: preview.length,
      summary: summarizeWolvoxMatches(preview),
      preview: preview.slice(0, 50),
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

  const body = await req.json().catch(() => null) as { connection_id?: unknown; products?: unknown } | null
  if (!body || typeof body.connection_id !== 'string' || !Array.isArray(body.products)) {
    return NextResponse.json({ error: 'connection_id ve products dizisi gerekli' }, { status: 400 })
  }
  if (body.products.length === 0) {
    return NextResponse.json({ error: 'Boş katalog staging alanına alınamaz' }, { status: 400 })
  }
  if (body.products.length > MAX_CATALOG_ROWS) {
    return NextResponse.json({ error: `Tek aktarımda en fazla ${MAX_CATALOG_ROWS} ürün kabul edilir` }, { status: 413 })
  }

  const supabase = createAdminClient() as any
  const connection = await requireConnection(supabase, body.connection_id).catch(() => null)
  if (!connection) return NextResponse.json({ error: 'Wolvox bağlantısı bulunamadı' }, { status: 404 })

  const preparation = prepareWolvoxCatalog(body.products as WolvoxCatalogInput[])
  const { data: run, error: runError } = await supabase
    .from('integration_sync_runs')
    .insert({
      connection_id: connection.id,
      direction: 'inbound',
      entity_type: 'catalog',
      status: 'running',
      received_count: preparation.receivedCount,
      valid_count: preparation.validCount,
      invalid_count: preparation.invalidCount,
      details: { source: 'admin_staging_contract', duplicate_external_ids: preparation.duplicateExternalIds },
    })
    .select()
    .single()
  if (runError || !run) return NextResponse.json({ error: 'Staging senkronizasyon kaydı başlatılamadı' }, { status: 500 })

  try {
    for (let index = 0; index < preparation.records.length; index += 500) {
      const chunk = preparation.records.slice(index, index + 500).map(record => ({
        ...record,
        connection_id: connection.id,
        sync_run_id: run.id,
      }))
      const { error } = await supabase
        .from('wolvox_product_staging')
        .upsert(chunk, { onConflict: 'connection_id,external_id' })
      if (error) throw error
    }

    const { error: cleanupError } = await supabase
      .from('wolvox_product_staging')
      .delete()
      .eq('connection_id', connection.id)
      .or(`sync_run_id.is.null,sync_run_id.neq.${run.id}`)
    if (cleanupError) throw cleanupError

    const { error: finishError } = await supabase
      .from('integration_sync_runs')
      .update({ status: 'succeeded', finished_at: new Date().toISOString() })
      .eq('id', run.id)
    if (finishError) throw finishError

    return NextResponse.json({
      success: true,
      sync_run_id: run.id,
      received_count: preparation.receivedCount,
      staged_count: preparation.records.length,
      valid_count: preparation.validCount,
      invalid_count: preparation.invalidCount,
      duplicate_external_ids: preparation.duplicateExternalIds,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 500) : 'Bilinmeyen staging hatası'
    await supabase
      .from('integration_sync_runs')
      .update({ status: 'failed', error_message: message, finished_at: new Date().toISOString() })
      .eq('id', run.id)
    return NextResponse.json({ error: 'Wolvox kataloğu staging alanına alınamadı' }, { status: 500 })
  }
}

function emptySummary() {
  return { matched: 0, new: 0, conflict: 0, invalid: 0 }
}
