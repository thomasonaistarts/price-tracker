import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const inventoryRowSchema = z.object({
  external_product_id: z.string().min(1).max(100),
  depot_code: z.string().max(100).default(''),
  depot_name: z.string().max(200).nullable().optional(),
  snapshot_at: z.string().datetime(),
  period_started_at: z.string().datetime().nullable().optional(),
  quantity_in: z.number().finite(),
  quantity_out: z.number().finite(),
  quantity_remaining: z.number().finite(),
  quantity_available: z.number().finite(),
  quantity_blocked: z.number().finite(),
  unit_cost: z.number().finite().nonnegative().nullable().optional(),
  inventory_value: z.number().finite(),
  source_hash: z.string().min(8).max(128),
}).strict()

const financialRowSchema = z.object({
  summary_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  analysis_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).nullable(),
  purchase_total: z.number().finite(),
  purchase_return_total: z.number().finite(),
  net_purchase_total: z.number().finite(),
  sales_total: z.number().finite(),
  sales_return_total: z.number().finite(),
  net_sales_total: z.number().finite(),
  source_hash: z.string().min(8).max(128),
}).strict()

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    connection_id: z.string().uuid(),
    entity_type: z.enum(['inventory', 'financial_summary']),
  }).strict(),
  z.object({
    action: z.literal('inventory_batch'),
    connection_id: z.string().uuid(),
    run_id: z.string().uuid(),
    rows: z.array(inventoryRowSchema).min(1).max(250),
  }).strict(),
  z.object({
    action: z.literal('financial_batch'),
    connection_id: z.string().uuid(),
    run_id: z.string().uuid(),
    rows: z.array(financialRowSchema).min(1).max(250),
  }).strict(),
  z.object({
    action: z.literal('finish'),
    connection_id: z.string().uuid(),
    run_id: z.string().uuid(),
    received_count: z.number().int().nonnegative(),
    valid_count: z.number().int().nonnegative(),
    invalid_count: z.number().int().nonnegative(),
  }).strict(),
])

function isAuthorized(request: NextRequest) {
  const secret = process.env.WOLVOX_BRIDGE_SECRET
  if (!secret || secret.length < 24) return false
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function POST(request: NextRequest) {
  if (!process.env.WOLVOX_BRIDGE_SECRET) {
    return NextResponse.json({ error: 'Köprü yapılandırılmamış' }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veya çok büyük veri paketi' }, { status: 400 })
  }

  const body = parsed.data
  const supabase = createAdminClient() as any
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id, status')
    .eq('id', body.connection_id)
    .eq('provider', 'wolvox')
    .maybeSingle()
  if (!connection) return NextResponse.json({ error: 'Bağlantı bulunamadı' }, { status: 404 })

  if (body.action === 'start') {
    const { data, error } = await supabase
      .from('integration_sync_runs')
      .insert({
        connection_id: body.connection_id,
        direction: 'inbound',
        entity_type: body.entity_type === 'financial_summary' ? 'financial_summary' : 'inventory',
        status: 'running',
        details: { transport: 'wolvox_bridge_v1', read_only_source: true },
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: 'Senkron başlatılamadı' }, { status: 500 })
    return NextResponse.json({ run_id: data.id })
  }

  const { data: run } = await supabase
    .from('integration_sync_runs')
    .select('id, status')
    .eq('id', body.run_id)
    .eq('connection_id', body.connection_id)
    .eq('direction', 'inbound')
    .maybeSingle()
  if (!run || run.status !== 'running') {
    return NextResponse.json({ error: 'Aktif senkron çalışması bulunamadı' }, { status: 409 })
  }

  if (body.action === 'inventory_batch') {
    const rows = body.rows.map(row => ({
      ...row,
      connection_id: body.connection_id,
      sync_run_id: body.run_id,
    }))
    const { error } = await supabase
      .from('wolvox_inventory_snapshots')
      .upsert(rows, { onConflict: 'connection_id,external_product_id,depot_code,snapshot_at' })
    if (error) return NextResponse.json({ error: 'Stok paketi kaydedilemedi' }, { status: 500 })
    return NextResponse.json({ accepted: rows.length })
  }

  if (body.action === 'financial_batch') {
    const rows = body.rows.map(row => ({
      ...row,
      connection_id: body.connection_id,
      sync_run_id: body.run_id,
    }))
    const { error } = await supabase
      .from('wolvox_daily_financial_summaries')
      .upsert(rows, { onConflict: 'connection_id,summary_date,analysis_time' })
    if (error) return NextResponse.json({ error: 'Finans paketi kaydedilemedi' }, { status: 500 })
    return NextResponse.json({ accepted: rows.length })
  }

  if (body.valid_count + body.invalid_count !== body.received_count) {
    return NextResponse.json({ error: 'Senkron sayımları tutarsız' }, { status: 409 })
  }
  const { error } = await supabase
    .from('integration_sync_runs')
    .update({
      status: 'succeeded',
      received_count: body.received_count,
      valid_count: body.valid_count,
      invalid_count: body.invalid_count,
      finished_at: new Date().toISOString(),
    })
    .eq('id', body.run_id)
    .eq('connection_id', body.connection_id)
    .eq('status', 'running')
  if (error) return NextResponse.json({ error: 'Senkron tamamlanamadı' }, { status: 500 })
  return NextResponse.json({ success: true })
}
