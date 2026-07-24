import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import ReportsClient from '@/components/reports/ReportsClient'
import {
  buildInventoryIntelligence,
  detectInventoryCostChanges,
  summarizeFinancials,
  summarizeSalesChannels,
} from '@/lib/integrations/wolvox-business-intelligence'

export default async function ReportsPage() {
  const user = await requireAuth()
  const supabase = (await createClient()) as any

  // Tüm analizleri çek (son 5000 kayıt), sonra JS tarafında dedup
  const { data: rawAnalyses } = await supabase
    .from('price_analyses')
    .select(`
      id, run_at, alert, alert_reason, price_diff_percent,
      market_mean, min_price, max_price, sources_count, sources, product_id,
      products(sku, product_name, our_price, brand, category)
    `)
    .eq('user_id', user.id)
    .order('run_at', { ascending: false })
    .limit(5000)

  // Ürün başına sadece en son analizi al
  const seen = new Set<string>()
  const latestAnalyses = (rawAnalyses ?? []).filter((a: any) => {
    if (seen.has(a.product_id)) return false
    seen.add(a.product_id)
    return true
  })

  // Trend için son 90 günün ham verileri (haftalık gruplama client'ta yapılacak)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: historyRaw } = await supabase
    .from('price_analyses')
    .select('run_at, alert, product_id')
    .eq('user_id', user.id)
    .gte('run_at', since)
    .order('run_at', { ascending: false })
    .limit(20000)

  // BI migration/senkron henüz kurulmamışsa klasik fiyat raporları çalışmaya
  // devam eder. İlk başarılı WOLVOX hareket senkronundan sonra bu alan dolar.
  let inventoryIntelligence: ReturnType<typeof buildInventoryIntelligence> = []
  let financialSummary: ReturnType<typeof summarizeFinancials> | null = null
  let costChanges: ReturnType<typeof detectInventoryCostChanges> = []
  let channelSummary: ReturnType<typeof summarizeSalesChannels> = []
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('provider', 'wolvox')
    .maybeSingle()

  if (connection?.id) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const [
      { data: snapshots },
      { data: mappings },
      { data: financialRows },
      { data: documents },
    ] = await Promise.all([
      supabase
        .from('wolvox_inventory_snapshots')
        .select('external_product_id, snapshot_at, period_started_at, quantity_out, quantity_available, unit_cost')
        .eq('connection_id', connection.id)
        .order('snapshot_at', { ascending: false })
        .limit(10000),
      supabase
        .from('external_product_mappings')
        .select('external_id, product_id')
        .eq('connection_id', connection.id)
        .eq('status', 'active'),
      supabase
        .from('wolvox_daily_financial_summaries')
        .select('summary_date, analysis_time, purchase_total, purchase_return_total, sales_total, sales_return_total')
        .eq('connection_id', connection.id)
        .gte('summary_date', ninetyDaysAgo.slice(0, 10))
        .order('summary_date', { ascending: false })
        .order('analysis_time', { ascending: false })
        .limit(500),
      supabase
        .from('wolvox_documents')
        .select('channel, document_type, net_total, document_at')
        .eq('connection_id', connection.id)
        .gte('document_at', ninetyDaysAgo)
        .order('document_at', { ascending: false })
        .limit(10000),
    ])

    const productIds = Array.from(new Set((mappings ?? []).map((row: any) => row.product_id)))
    const { data: mappedProducts } = productIds.length
      ? await supabase
          .from('products')
          .select('id, product_name, category')
          .eq('user_id', user.id)
          .in('id', productIds)
      : { data: [] }
    const productById = new Map<string, { product_name: string; category: string | null }>(
      (mappedProducts ?? []).map((product: any) => [product.id, product]),
    )
    const productIdByExternal = new Map<string, string>(
      (mappings ?? []).map((row: any) => [row.external_id, row.product_id]),
    )
    const latestTimestampByProduct = new Map<string, string>()
    const aggregates = new Map<string, {
      quantityOut: number
      quantityAvailable: number
      snapshotAt: string
      periodStartedAt: string | null
    }>()

    for (const row of snapshots ?? []) {
      const latest = latestTimestampByProduct.get(row.external_product_id)
      if (latest && latest !== row.snapshot_at) continue
      latestTimestampByProduct.set(row.external_product_id, row.snapshot_at)
      const aggregate = aggregates.get(row.external_product_id) ?? {
        quantityOut: 0,
        quantityAvailable: 0,
        snapshotAt: row.snapshot_at,
        periodStartedAt: row.period_started_at,
      }
      aggregate.quantityOut += Number(row.quantity_out ?? 0)
      aggregate.quantityAvailable += Number(row.quantity_available ?? 0)
      aggregates.set(row.external_product_id, aggregate)
    }

    inventoryIntelligence = buildInventoryIntelligence(
      Array.from(aggregates, ([externalProductId, aggregate]) => {
        const mappedProductId = productIdByExternal.get(externalProductId)
        const product = mappedProductId ? productById.get(mappedProductId) : undefined
        const periodDays = aggregate.periodStartedAt
          ? Math.max(0, (new Date(aggregate.snapshotAt).getTime() - new Date(aggregate.periodStartedAt).getTime()) / 86_400_000)
          : 0
        return {
          externalProductId,
          productName: product?.product_name ?? externalProductId,
          category: product?.category ?? null,
          stockAvailable: aggregate.quantityAvailable,
          quantityOut: aggregate.quantityOut,
          periodDays,
        }
      }),
    )

    if ((financialRows ?? []).length > 0) {
      financialSummary = summarizeFinancials((financialRows ?? []).map((row: any) => ({
        summaryDate: row.summary_date,
        purchaseTotal: Number(row.purchase_total ?? 0),
        purchaseReturnTotal: Number(row.purchase_return_total ?? 0),
        salesTotal: Number(row.sales_total ?? 0),
        salesReturnTotal: Number(row.sales_return_total ?? 0),
      })))
    }

    costChanges = detectInventoryCostChanges((snapshots ?? []).map((row: any) => {
      const mappedProductId = productIdByExternal.get(row.external_product_id)
      const product = mappedProductId ? productById.get(mappedProductId) : undefined
      return {
        externalProductId: row.external_product_id,
        productName: product?.product_name ?? row.external_product_id,
        snapshotAt: row.snapshot_at,
        unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
      }
    }))

    channelSummary = summarizeSalesChannels((documents ?? []).map((row: any) => ({
      channel: row.channel,
      documentType: row.document_type,
      netTotal: Number(row.net_total ?? 0),
    })))
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Raporlar</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          {latestAnalyses.length} ürünün anlık durumu · Son 90 günlük trend
        </p>
      </div>
      <ReportsClient
        analyses={latestAnalyses as any}
        history={(historyRaw ?? []) as any}
        inventoryIntelligence={inventoryIntelligence}
        financialSummary={financialSummary}
        costChanges={costChanges}
        channelSummary={channelSummary}
      />
    </div>
  )
}
