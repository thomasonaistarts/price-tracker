import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import ReportsClient from '@/components/reports/ReportsClient'

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
      />
    </div>
  )
}
