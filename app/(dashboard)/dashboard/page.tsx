import { requireAuth, getUserProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { AlertType } from '@/types/database'

// ── Tipler ────────────────────────────────────────────────────────────────────

interface AnalysisRow {
  product_id: string
  alert: AlertType
  price_diff_percent: number | null
  sources_count: number
  run_at: string
  products: { product_name: string; category: string | null; our_price: number } | null
}

interface DashboardData {
  totalProducts: number
  analyzedCount: number
  alertCounts: Record<AlertType, number>
  topAbove: AnalysisRow[]
  topBelow: AnalysisRow[]
  categoryBreakdown: { cat: string; above: number; below: number; normal: number; insufficient: number; total: number }[]
  lastRun: string | null
  avgDiff: number | null
}

// ── Veri çekme ────────────────────────────────────────────────────────────────

async function getDashboardData(userId: string): Promise<DashboardData> {
  const supabase = createAdminClient() as any
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const [productsRes, analysesRes] = await Promise.all([
    supabase
      .from('products')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase
      .from('price_analyses')
      .select('product_id, alert, price_diff_percent, sources_count, run_at, products(product_name, category, our_price)')
      .eq('user_id', userId)
      .gte('run_at', thirtyDaysAgo)
      .order('run_at', { ascending: false })
      .limit(1000),
  ])

  const allAnalyses = (analysesRes.data ?? []) as AnalysisRow[]

  const latestMap = new Map<string, AnalysisRow>()
  for (const a of allAnalyses) {
    if (!latestMap.has(a.product_id)) latestMap.set(a.product_id, a)
  }
  const latest = Array.from(latestMap.values())

  const alertCounts: Record<AlertType, number> = {
    above_market: 0, below_market: 0, no_alert: 0, insufficient_data: 0,
  }
  for (const a of latest) alertCounts[a.alert]++

  const topAbove = latest
    .filter(a => a.alert === 'above_market' && a.price_diff_percent !== null)
    .sort((a, b) => (b.price_diff_percent ?? 0) - (a.price_diff_percent ?? 0))
    .slice(0, 7)

  const topBelow = latest
    .filter(a => a.alert === 'below_market' && a.price_diff_percent !== null)
    .sort((a, b) => (a.price_diff_percent ?? 0) - (b.price_diff_percent ?? 0))
    .slice(0, 7)

  const catMap = new Map<string, { above: number; below: number; normal: number; insufficient: number }>()
  for (const a of latest) {
    const cat = a.products?.category ?? 'Kategorisiz'
    if (!catMap.has(cat)) catMap.set(cat, { above: 0, below: 0, normal: 0, insufficient: 0 })
    const e = catMap.get(cat)!
    if (a.alert === 'above_market') e.above++
    else if (a.alert === 'below_market') e.below++
    else if (a.alert === 'no_alert') e.normal++
    else e.insufficient++
  }
  const categoryBreakdown = Array.from(catMap.entries())
    .map(([cat, c]) => ({ cat, ...c, total: c.above + c.below + c.normal + c.insufficient }))
    .sort((a, b) => (b.above + b.below) - (a.above + a.below) || b.total - a.total)
    .slice(0, 6)

  const diffs = latest
    .filter(a => a.price_diff_percent !== null && a.alert !== 'insufficient_data')
    .map(a => a.price_diff_percent!)
  const avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null

  return {
    totalProducts: productsRes.count ?? 0,
    analyzedCount: latest.length,
    alertCounts,
    topAbove,
    topBelow,
    categoryBreakdown,
    lastRun: allAnalyses[0]?.run_at ?? null,
    avgDiff,
  }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Az önce'
  if (mins < 60) return `${mins} dk önce`
  if (hours < 24) return `${hours} saat önce`
  if (days < 7) return `${days} gün önce`
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

// ── Sayfa ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const authUser = await requireAuth()
  const [profile, data] = await Promise.all([
    getUserProfile(authUser.id),
    getDashboardData(authUser.id),
  ])

  const { totalProducts, analyzedCount, alertCounts, topAbove, topBelow, categoryBreakdown, lastRun, avgDiff } = data
  const totalAnalyzed = alertCounts.above_market + alertCounts.below_market + alertCounts.no_alert + alertCounts.insufficient_data
  const barTotal = totalAnalyzed || 1

  const bars = [
    { key: 'above_market',      label: 'Piyasa üstü',   count: alertCounts.above_market,      color: 'bg-red-500'    },
    { key: 'below_market',      label: 'Piyasa altı',   count: alertCounts.below_market,      color: 'bg-emerald-500' },
    { key: 'no_alert',          label: 'Normal',         count: alertCounts.no_alert,          color: 'bg-gray-300 dark:bg-slate-600' },
    { key: 'insufficient_data', label: 'Yetersiz veri',  count: alertCounts.insufficient_data, color: 'bg-amber-400'  },
  ].filter(b => b.count > 0)

  return (
    <div className="space-y-6">

      {/* ── Başlık ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
            Merhaba, {profile?.full_name?.split(' ')[0] ?? 'Kullanıcı'} 👋
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {lastRun ? `Son analiz ${relativeTime(lastRun)}` : 'Henüz analiz yapılmadı'}
            {totalProducts > 0 && analyzedCount > 0 && (
              <span className="ml-2 text-gray-400 dark:text-slate-600">·</span>
            )}
            {analyzedCount > 0 && (
              <span className="ml-2">{analyzedCount} / {totalProducts} ürün analiz edildi (son 30 gün)</span>
            )}
          </p>
        </div>
        <Link
          href="/dashboard/analyze"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          Yeni analiz
        </Link>
      </div>

      {/* ── KPI Kartları ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

        {/* Aktif ürünler */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Aktif ürünler</span>
            <div className="w-7 h-7 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{totalProducts}</div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">toplam katalog</div>
        </div>

        {/* Piyasa üstü */}
        <div className={`bg-white dark:bg-slate-800 rounded-xl border p-4 col-span-1 ${alertCounts.above_market > 0 ? 'border-red-200 dark:border-red-900/50 border-l-4 border-l-red-500' : 'border-gray-200 dark:border-slate-700'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Piyasa üstü</span>
            <div className="w-7 h-7 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className={`text-2xl font-bold ${alertCounts.above_market > 0 ? 'text-red-600' : 'text-gray-900 dark:text-slate-100'}`}>
            {alertCounts.above_market}
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">dikkat gerekiyor</div>
        </div>

        {/* Piyasa altı */}
        <div className={`bg-white dark:bg-slate-800 rounded-xl border p-4 col-span-1 ${alertCounts.below_market > 0 ? 'border-emerald-200 dark:border-emerald-900/50 border-l-4 border-l-emerald-500' : 'border-gray-200 dark:border-slate-700'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Piyasa altı</span>
            <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 17H5m0 0V9m0 8l8-8 4 4 6-6" />
              </svg>
            </div>
          </div>
          <div className={`text-2xl font-bold ${alertCounts.below_market > 0 ? 'text-emerald-600' : 'text-gray-900 dark:text-slate-100'}`}>
            {alertCounts.below_market}
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">fiyat fırsatı</div>
        </div>

        {/* Yetersiz veri */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Yetersiz veri</span>
            <div className="w-7 h-7 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{alertCounts.insufficient_data}</div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">kaynak bulunamadı</div>
        </div>

        {/* Ort. piyasa farkı */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Ort. piyasa farkı</span>
            <div className="w-7 h-7 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2h-2a2 2 0 0 0-2-2z" />
              </svg>
            </div>
          </div>
          <div className={`text-2xl font-bold ${avgDiff === null ? 'text-gray-400 dark:text-slate-600' : avgDiff > 0 ? 'text-red-500' : avgDiff < 0 ? 'text-emerald-600' : 'text-gray-900 dark:text-slate-100'}`}>
            {avgDiff !== null ? fmtPct(avgDiff) : '—'}
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">analiz edilen ürünler</div>
        </div>
      </div>

      {/* ── Alert dağılımı ── */}
      {totalAnalyzed > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Fiyat durumu dağılımı</h2>
            <span className="text-xs text-gray-400 dark:text-slate-500">{totalAnalyzed} ürün analiz edildi</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px bg-gray-100 dark:bg-slate-700">
            {bars.map(b => (
              <div
                key={b.key}
                className={`${b.color} transition-all`}
                style={{ width: `${(b.count / barTotal) * 100}%` }}
                title={`${b.label}: ${b.count} ürün (%${((b.count / barTotal) * 100).toFixed(0)})`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {bars.map(b => (
              <div key={b.key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${b.color}`} />
                <span>{b.label}</span>
                <span className="font-semibold text-gray-800 dark:text-slate-200">{b.count}</span>
                <span className="text-gray-400 dark:text-slate-500">(%{((b.count / barTotal) * 100).toFixed(0)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── İki Kolon: Dikkat & Fırsatlar ── */}
      {(topAbove.length > 0 || topBelow.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Dikkat gerektiren ürünler */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Dikkat gerektiren ürünler</h2>
              </div>
              <span className="text-xs text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full border border-red-100 dark:border-red-900/50">
                {alertCounts.above_market} piyasa üstü
              </span>
            </div>
            {topAbove.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-slate-500">Piyasa üstü ürün yok 🎉</div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-700">
                {topAbove.map((a, i) => (
                  <div key={a.product_id} className="px-5 py-3 flex items-center gap-3 hover:bg-red-50/30 dark:hover:bg-red-900/10 transition-colors">
                    <span className="text-xs text-gray-300 dark:text-slate-600 font-mono w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate" title={a.products?.product_name}>
                        {a.products?.product_name ?? '—'}
                      </p>
                      {a.products?.category && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-500">{a.products.category}</span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-red-600">{fmtPct(a.price_diff_percent)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-5 py-2.5 border-t border-gray-100 dark:border-slate-700">
              <Link href="/dashboard/products?alert=above_market" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                Tümünü gör →
              </Link>
            </div>
          </div>

          {/* Fiyat fırsatları */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Fiyat artırma fırsatları</h2>
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/50">
                {alertCounts.below_market} piyasa altı
              </span>
            </div>
            {topBelow.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-slate-500">Piyasa altı ürün yok</div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-700">
                {topBelow.map((a, i) => (
                  <div key={a.product_id} className="px-5 py-3 flex items-center gap-3 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors">
                    <span className="text-xs text-gray-300 dark:text-slate-600 font-mono w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate" title={a.products?.product_name}>
                        {a.products?.product_name ?? '—'}
                      </p>
                      {a.products?.category && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-500">{a.products.category}</span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-600">{fmtPct(a.price_diff_percent)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-5 py-2.5 border-t border-gray-100 dark:border-slate-700">
              <Link href="/dashboard/products?alert=below_market" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                Tümünü gör →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Kategori Dağılımı ── */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Kategori bazlı durum</h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Son 30 günde analiz edilen ürünlerin kategorilere göre dağılımı</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-700">
            {categoryBreakdown.map(c => {
              const maxCount = Math.max(...categoryBreakdown.map(x => x.total), 1)
              return (
                <div key={c.cat} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-32 flex-shrink-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate block" title={c.cat}>{c.cat}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{c.total} ürün</span>
                  </div>
                  <div className="flex-1 flex h-5 rounded overflow-hidden bg-gray-100 dark:bg-slate-700 gap-px">
                    {c.above > 0 && (
                      <div className="bg-red-400 flex items-center justify-center" style={{ width: `${(c.above / c.total) * 100}%` }}>
                        {c.above / c.total > 0.1 && (
                          <span className="text-[9px] text-white font-bold">{c.above}</span>
                        )}
                      </div>
                    )}
                    {c.below > 0 && (
                      <div className="bg-emerald-400 flex items-center justify-center" style={{ width: `${(c.below / c.total) * 100}%` }}>
                        {c.below / c.total > 0.1 && (
                          <span className="text-[9px] text-white font-bold">{c.below}</span>
                        )}
                      </div>
                    )}
                    {c.normal > 0 && (
                      <div className="bg-gray-300 dark:bg-slate-500" style={{ width: `${(c.normal / c.total) * 100}%` }} />
                    )}
                    {c.insufficient > 0 && (
                      <div className="bg-amber-300" style={{ width: `${(c.insufficient / c.total) * 100}%` }} />
                    )}
                  </div>
                  <div className="flex gap-3 flex-shrink-0 text-xs">
                    {c.above > 0 && <span className="text-red-600 font-medium">↑{c.above}</span>}
                    {c.below > 0 && <span className="text-emerald-600 font-medium">↓{c.below}</span>}
                    {c.normal > 0 && <span className="text-gray-400 dark:text-slate-500">✓{c.normal}</span>}
                    {c.insufficient > 0 && <span className="text-amber-500">⚠{c.insufficient}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Analiz kapsamı ── */}
      {totalProducts > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Analiz kapsamı</h2>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {analyzedCount} / {totalProducts} ürün · son 30 gün
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${totalProducts > 0 ? (analyzedCount / totalProducts) * 100 : 0}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-gray-400 dark:text-slate-500">
            <span>%{totalProducts > 0 ? ((analyzedCount / totalProducts) * 100).toFixed(0) : 0} kapsam</span>
            {totalProducts - analyzedCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{totalProducts - analyzedCount} ürün hiç analiz edilmedi</span>
            )}
          </div>
        </div>
      )}

      {/* ── Hızlı işlemler ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Hızlı işlemler</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              href: '/dashboard/analyze',
              icon: (
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              ),
              iconBg: 'bg-blue-50 dark:bg-blue-900/30',
              title: 'Fiyat analizi yap',
              desc: 'CSV/XLSX yükleyerek piyasa analizi başlatın',
            },
            {
              href: '/dashboard/products',
              icon: (
                <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
              ),
              iconBg: 'bg-violet-50 dark:bg-violet-900/30',
              title: 'Ürünleri yönet',
              desc: `${totalProducts} aktif ürün — ekle, düzenle veya sil`,
            },
            {
              href: '/dashboard/reports',
              icon: (
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 0-2 2h-2a2 2 0 0 0-2-2z" />
                </svg>
              ),
              iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
              title: 'Raporlar',
              desc: 'Geçmiş analizleri ve trend grafikleri görün',
            },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-3 p-4 rounded-lg border border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group"
            >
              <div className={`p-2 rounded-lg ${item.iconBg} flex-shrink-0`}>
                {item.icon}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-slate-200 group-hover:text-gray-900 dark:group-hover:text-slate-100">{item.title}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
