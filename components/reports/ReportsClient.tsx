'use client'

import { useState, useMemo } from 'react'
import PlatformLogo from '@/components/ui/PlatformLogo'

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface Source {
  site: string
  price: number
  confidence?: 'exact' | 'high' | 'medium' | 'low'
}

export interface ReportRow {
  id: string
  product_id: string
  run_at: string
  alert: string
  alert_reason: string | null
  price_diff_percent: number | null
  market_mean: number | null
  min_price: number | null
  max_price: number | null
  sources_count: number
  sources: Source[] | null
  products: {
    sku: string
    product_name: string
    our_price: number
    brand: string | null
    category: string | null
  } | null
}

interface HistoryItem {
  run_at: string
  alert: string
  product_id: string
}

interface Props {
  analyses: ReportRow[]
  history: HistoryItem[]
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() + diff)
  mon.setUTCHours(0, 0, 0, 0)
  return mon.toISOString().split('T')[0]
}

function weekLabel(weekStart: string) {
  return new Date(weekStart).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function ReportsClient({ analyses, history }: Props) {
  const [tab, setTab] = useState<'summary' | 'category' | 'trend' | 'platform'>('summary')

  const valid = useMemo(() => analyses.filter(a => a.products != null), [analyses])

  return (
    <div>
      {/* Tab navigasyon */}
      <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-slate-700 p-1 rounded-xl w-fit">
        {([
          { key: 'summary',  label: '📊 Özet & Aksiyon' },
          { key: 'category', label: '🗂 Kategori' },
          { key: 'trend',    label: '📈 Trend' },
          { key: 'platform', label: '🏪 Platform' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-slate-100 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary'  && <SummaryTab  rows={valid} />}
      {tab === 'category' && <CategoryTab rows={valid} />}
      {tab === 'trend'    && <TrendTab    history={history} />}
      {tab === 'platform' && <PlatformTab rows={valid} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKME 1 — ÖZET & AKSİYON
// ══════════════════════════════════════════════════════════════════════════════

function SummaryTab({ rows }: { rows: ReportRow[] }) {
  const above  = rows.filter(r => r.alert === 'above_market')
  const below  = rows.filter(r => r.alert === 'below_market')
  const normal = rows.filter(r => r.alert === 'no_alert')
  const insuff = rows.filter(r => r.alert === 'insufficient_data')

  const avgAbove = above.length
    ? above.reduce((s, r) => s + (r.price_diff_percent ?? 0), 0) / above.length
    : 0
  const avgBelow = below.length
    ? below.reduce((s, r) => s + (r.price_diff_percent ?? 0), 0) / below.length
    : 0

  const total = rows.length || 1

  const topAbove = [...above]
    .sort((a, b) => (b.price_diff_percent ?? 0) - (a.price_diff_percent ?? 0))
    .slice(0, 15)

  const topBelow = [...below]
    .sort((a, b) => (a.price_diff_percent ?? 0) - (b.price_diff_percent ?? 0))
    .slice(0, 15)

  return (
    <div className="space-y-5">
      {/* KPI kartları */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Toplam ürün" value={rows.length} color="text-gray-900 dark:text-slate-100" />
        <KpiCard
          label="Piyasa üstü"
          value={above.length}
          sub={above.length ? `ort. +${avgAbove.toFixed(1)}%` : undefined}
          color="text-red-600"
        />
        <KpiCard
          label="Piyasa altı"
          value={below.length}
          sub={below.length ? `ort. ${avgBelow.toFixed(1)}%` : undefined}
          color="text-green-600"
        />
        <KpiCard label="Normal" value={normal.length} color="text-gray-500 dark:text-slate-400" />
        <KpiCard label="Veri yetersiz" value={insuff.length} color="text-yellow-600" />
      </div>

      {/* Dağılım çubuğu */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex text-xs text-gray-500 dark:text-slate-400 mb-2 gap-4 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Piyasa üstü {((above.length / total) * 100).toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Piyasa altı {((below.length / total) * 100).toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-slate-500 inline-block" /> Normal {((normal.length / total) * 100).toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-300 inline-block" /> Veri yetersiz {((insuff.length / total) * 100).toFixed(0)}%</span>
        </div>
        <div className="flex h-5 rounded-full overflow-hidden w-full">
          <div style={{ width: `${(above.length / total) * 100}%` }} className="bg-red-400" />
          <div style={{ width: `${(below.length / total) * 100}%` }} className="bg-green-400" />
          <div style={{ width: `${(normal.length / total) * 100}%` }} className="bg-gray-200 dark:bg-slate-500" />
          <div style={{ width: `${(insuff.length / total) * 100}%` }} className="bg-yellow-300" />
        </div>
      </div>

      {/* Aksiyon tabloları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fiyat indirmesi gerekli */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-100 dark:border-red-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-50 dark:border-red-900/30 flex items-center gap-2">
            <span className="text-sm font-semibold text-red-700 dark:text-red-400">↑ Fiyat İndirmesi Önerilen</span>
            <span className="text-xs text-red-400 dark:text-red-500 ml-auto">{above.length} ürün</span>
          </div>
          {topAbove.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8">Piyasa üstü ürün yok</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-red-50 dark:bg-red-900/20">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Ürün</th>
                  <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Bizim</th>
                  <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Piyasa</th>
                  <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Fark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {topAbove.map(r => (
                  <tr key={r.id} className="hover:bg-red-50/50 dark:hover:bg-red-900/10">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800 dark:text-slate-200 truncate max-w-[160px]">{r.products!.product_name}</div>
                      <div className="text-gray-400 dark:text-slate-500 font-mono">{r.products!.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-slate-300">{fmt(r.products!.our_price)}</td>
                    <td className="px-3 py-2 text-right text-gray-500 dark:text-slate-400">{r.market_mean != null ? fmt(r.market_mean) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">
                      +{r.price_diff_percent?.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Fiyat artırma fırsatı */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-green-100 dark:border-green-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-green-50 dark:border-green-900/30 flex items-center gap-2">
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">↓ Fiyat Artırma Fırsatı</span>
            <span className="text-xs text-green-400 dark:text-green-500 ml-auto">{below.length} ürün</span>
          </div>
          {topBelow.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8">Piyasa altı ürün yok</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-green-50 dark:bg-green-900/20">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Ürün</th>
                  <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Bizim</th>
                  <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Piyasa</th>
                  <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Fark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {topBelow.map(r => (
                  <tr key={r.id} className="hover:bg-green-50/50 dark:hover:bg-green-900/10">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800 dark:text-slate-200 truncate max-w-[160px]">{r.products!.product_name}</div>
                      <div className="text-gray-400 dark:text-slate-500 font-mono">{r.products!.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-slate-300">{fmt(r.products!.our_price)}</td>
                    <td className="px-3 py-2 text-right text-gray-500 dark:text-slate-400">{r.market_mean != null ? fmt(r.market_mean) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-600">
                      {r.price_diff_percent?.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKME 2 — KATEGORİ
// ══════════════════════════════════════════════════════════════════════════════

function CategoryTab({ rows }: { rows: ReportRow[] }) {
  const [sort, setSort] = useState<'above' | 'below' | 'total' | 'avg'>('above')

  const cats = useMemo(() => {
    const map = new Map<string, ReportRow[]>()
    for (const r of rows) {
      const cat = r.products?.category || '(Kategori yok)'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(r)
    }
    return Array.from(map.entries()).map(([name, items]) => {
      const above  = items.filter(r => r.alert === 'above_market').length
      const below  = items.filter(r => r.alert === 'below_market').length
      const normal = items.filter(r => r.alert === 'no_alert').length
      const insuff = items.filter(r => r.alert === 'insufficient_data').length
      const withDiff = items.filter(r => r.price_diff_percent != null)
      const avg = withDiff.length
        ? withDiff.reduce((s, r) => s + r.price_diff_percent!, 0) / withDiff.length
        : 0
      return { name, total: items.length, above, below, normal, insuff, avg }
    })
  }, [rows])

  const sorted = useMemo(() => {
    return [...cats].sort((a, b) => {
      if (sort === 'above') return b.above - a.above
      if (sort === 'below') return b.below - a.below
      if (sort === 'total') return b.total - a.total
      return b.avg - a.avg
    })
  }, [cats, sort])

  const th = (key: typeof sort, label: string) => (
    <th
      onClick={() => setSort(key)}
      className={`text-right px-4 py-3 text-xs font-medium uppercase cursor-pointer select-none transition-colors ${
        sort === key ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
      }`}
    >
      {label} {sort === key && '↓'}
    </th>
  )

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400">
        {sorted.length} kategori · Sütun başlıklarına tıklayarak sıralayın
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Kategori</th>
              {th('total',  'Toplam')}
              {th('above',  '↑ Pahalı')}
              {th('below',  '↓ Ucuz')}
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Normal</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Veri yok</th>
              {th('avg', 'Ort. Fark')}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-32">Dağılım</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {sorted.map(c => (
              <tr key={c.name} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100 max-w-[180px] truncate">{c.name}</td>
                <td className="px-4 py-3 text-right text-gray-600 dark:text-slate-400">{c.total}</td>
                <td className="px-4 py-3 text-right">
                  {c.above > 0
                    ? <span className="text-red-600 font-medium">{c.above}</span>
                    : <span className="text-gray-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.below > 0
                    ? <span className="text-green-600 font-medium">{c.below}</span>
                    : <span className="text-gray-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 dark:text-slate-500">{c.normal}</td>
                <td className="px-4 py-3 text-right text-yellow-500">{c.insuff || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  <span className={c.avg > 0 ? 'text-red-600' : c.avg < 0 ? 'text-green-600' : 'text-gray-400 dark:text-slate-500'}>
                    {c.avg !== 0 ? `${c.avg > 0 ? '+' : ''}${c.avg.toFixed(1)}%` : '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <MiniBar above={c.above} below={c.below} normal={c.normal} insuff={c.insuff} total={c.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKME 3 — TREND
// ══════════════════════════════════════════════════════════════════════════════

function TrendTab({ history }: { history: HistoryItem[] }) {
  const weeks = useMemo(() => {
    const weekProductMap = new Map<string, Map<string, string>>()
    for (const h of history) {
      const ws = getWeekStart(h.run_at)
      if (!weekProductMap.has(ws)) weekProductMap.set(ws, new Map())
      const prod = weekProductMap.get(ws)!
      if (!prod.has(h.product_id)) prod.set(h.product_id, h.alert)
    }

    return Array.from(weekProductMap.entries())
      .map(([weekStart, products]) => {
        const alerts = Array.from(products.values())
        const above  = alerts.filter(a => a === 'above_market').length
        const below  = alerts.filter(a => a === 'below_market').length
        const normal = alerts.filter(a => a === 'no_alert').length
        const insuff = alerts.filter(a => a === 'insufficient_data').length
        const total  = alerts.length || 1
        return { weekStart, above, below, normal, insuff, total }
      })
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .slice(-12)
  }, [history])

  if (weeks.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center text-sm text-gray-400 dark:text-slate-500">
        Trend verisi için en az 1 hafta geçmesi gerekiyor
      </div>
    )
  }

  const maxTotal = Math.max(...weeks.map(w => w.total))

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400 mb-5 flex-wrap">
        <span className="font-medium text-gray-700 dark:text-slate-200 mr-2">Haftalık ürün dağılımı</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Piyasa üstü</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Piyasa altı</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-200 dark:bg-slate-500 inline-block" /> Normal</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-300 inline-block" /> Veri yetersiz</span>
      </div>

      <div className="space-y-2.5">
        {weeks.map(w => (
          <div key={w.weekStart} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-slate-500 w-16 shrink-0 text-right">{weekLabel(w.weekStart)}</span>
            <div className="flex-1 flex items-center gap-1">
              <div
                className="flex h-6 rounded overflow-hidden"
                style={{ width: `${Math.max(8, (w.total / maxTotal) * 100)}%` }}
              >
                <div style={{ width: `${(w.above  / w.total) * 100}%` }} className="bg-red-400"    title={`Piyasa üstü: ${w.above}`} />
                <div style={{ width: `${(w.below  / w.total) * 100}%` }} className="bg-green-400"  title={`Piyasa altı: ${w.below}`} />
                <div style={{ width: `${(w.normal / w.total) * 100}%` }} className="bg-gray-200 dark:bg-slate-500" title={`Normal: ${w.normal}`} />
                <div style={{ width: `${(w.insuff / w.total) * 100}%` }} className="bg-yellow-300" title={`Veri yetersiz: ${w.insuff}`} />
              </div>
            </div>
            <div className="flex gap-3 text-xs w-36 shrink-0">
              <span className="text-red-500 w-8 text-right">{w.above || '—'}</span>
              <span className="text-green-500 w-8 text-right">{w.below || '—'}</span>
              <span className="text-gray-400 dark:text-slate-500 w-8 text-right">{w.total}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 text-xs text-gray-400 dark:text-slate-500 mt-4 justify-end pr-0 w-full">
        <span className="w-36 shrink-0 flex gap-3 justify-end">
          <span className="text-red-400 w-8 text-right">Pahalı</span>
          <span className="text-green-400 w-8 text-right">Ucuz</span>
          <span className="w-8 text-right">Toplam</span>
        </span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKME 4 — PLATFORM KARŞILAŞTIRMASI
// ══════════════════════════════════════════════════════════════════════════════

function PlatformTab({ rows }: { rows: ReportRow[] }) {
  const stats = useMemo(() => {
    const map = new Map<string, {
      appearances: number
      cheapest: number
      totalDiffFromMean: number
      diffCount: number
      exact: number; high: number; medium: number; low: number
    }>()

    for (const row of rows) {
      const sources = row.sources ?? []
      if (sources.length === 0) continue

      const minPrice = row.min_price
      const marketMean = row.market_mean

      for (const s of sources) {
        if (!map.has(s.site)) {
          map.set(s.site, { appearances: 0, cheapest: 0, totalDiffFromMean: 0, diffCount: 0, exact: 0, high: 0, medium: 0, low: 0 })
        }
        const entry = map.get(s.site)!
        entry.appearances++

        if (minPrice != null && Math.abs(s.price - minPrice) < 0.01) entry.cheapest++

        if (marketMean != null && marketMean > 0) {
          entry.totalDiffFromMean += ((s.price - marketMean) / marketMean) * 100
          entry.diffCount++
        }

        const conf = s.confidence ?? 'high'
        if (conf === 'exact')  entry.exact++
        else if (conf === 'high')   entry.high++
        else if (conf === 'medium') entry.medium++
        else if (conf === 'low')    entry.low++
      }
    }

    return Array.from(map.entries())
      .map(([site, d]) => ({
        site,
        appearances: d.appearances,
        cheapest: d.cheapest,
        cheapestPct: d.appearances > 0 ? (d.cheapest / rows.filter(r => (r.sources ?? []).some(s => s.site === site)).length) * 100 : 0,
        avgDiff: d.diffCount > 0 ? d.totalDiffFromMean / d.diffCount : null,
        exact: d.exact, high: d.high, medium: d.medium, low: d.low,
      }))
      .sort((a, b) => b.appearances - a.appearances)
  }, [rows])

  if (stats.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center text-sm text-gray-400 dark:text-slate-500">
        Platform verisi bulunamadı
      </div>
    )
  }

  const maxAppearances = Math.max(...stats.map(s => s.appearances))

  return (
    <div className="space-y-4">
      {/* Platform kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map(s => (
          <div key={s.site} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PlatformLogo name={s.site} size={18} />
                <span className="font-semibold text-gray-900 dark:text-slate-100 text-sm">{s.site}</span>
              </div>
              {s.avgDiff != null && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  s.avgDiff > 5 ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                  : s.avgDiff < -5 ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                  : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                }`}>
                  {s.avgDiff > 0 ? '+' : ''}{s.avgDiff.toFixed(1)}% piyasa vs.
                </span>
              )}
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mb-1">
                <span>Görünürlük</span>
                <span>{s.appearances} ürün</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full"
                  style={{ width: `${(s.appearances / maxAppearances) * 100}%` }}
                />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mb-1">
                <span>En ucuz olduğu ürünler</span>
                <span className="font-medium text-gray-700 dark:text-slate-200">{s.cheapest}</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full"
                  style={{ width: s.appearances > 0 ? `${(s.cheapest / s.appearances) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">Eşleşme kalitesi</div>
              <div className="flex gap-1.5 flex-wrap">
                {s.exact > 0  && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">⭐{s.exact}</span>}
                {s.high > 0   && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">✓{s.high}</span>}
                {s.medium > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">⚠{s.medium}</span>}
                {s.low > 0    && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">↓{s.low}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Karşılaştırma tablosu */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400 font-medium">Detaylı Karşılaştırma</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Platform</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Toplam görünüm</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">En ucuz</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Piyasa vs. ort.</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Eşleşme dağılımı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
              {stats.map(s => (
                <tr key={s.site} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <PlatformLogo name={s.site} size={16} />
                      <span className="font-medium text-gray-900 dark:text-slate-100">{s.site}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-slate-400">{s.appearances}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-600 font-medium">{s.cheapest}</span>
                    <span className="text-gray-400 dark:text-slate-500 text-xs ml-1">
                      ({s.appearances > 0 ? ((s.cheapest / s.appearances) * 100).toFixed(0) : 0}%)
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {s.avgDiff != null
                      ? <span className={s.avgDiff > 0 ? 'text-red-600' : 'text-green-600'}>
                          {s.avgDiff > 0 ? '+' : ''}{s.avgDiff.toFixed(1)}%
                        </span>
                      : <span className="text-gray-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {s.exact > 0  && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">⭐{s.exact}</span>}
                      {s.high > 0   && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">✓{s.high}</span>}
                      {s.medium > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">⚠{s.medium}</span>}
                      {s.low > 0    && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">↓{s.low}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// KÜÇÜK YARDIMCI BİLEŞENLER
// ══════════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, sub, color }: {
  label: string
  value: number
  sub?: string
  color: string
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value.toLocaleString('tr-TR')}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function MiniBar({ above, below, normal, insuff, total }: {
  above: number; below: number; normal: number; insuff: number; total: number
}) {
  const t = total || 1
  return (
    <div className="flex h-3 rounded overflow-hidden w-full min-w-[60px]">
      <div style={{ width: `${(above  / t) * 100}%` }} className="bg-red-400"    title={`Pahalı: ${above}`} />
      <div style={{ width: `${(below  / t) * 100}%` }} className="bg-green-400"  title={`Ucuz: ${below}`} />
      <div style={{ width: `${(normal / t) * 100}%` }} className="bg-gray-200 dark:bg-slate-500" title={`Normal: ${normal}`} />
      <div style={{ width: `${(insuff / t) * 100}%` }} className="bg-yellow-300" title={`Yetersiz: ${insuff}`} />
    </div>
  )
}
