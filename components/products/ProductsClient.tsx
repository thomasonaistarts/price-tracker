'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Product } from '@/types/database'
import PlatformLogo from '@/components/ui/PlatformLogo'
import { downloadExcel } from '@/lib/exportExcel'

interface Source {
  site: string
  price: number
  url: string
  confidence?: 'exact' | 'high' | 'medium' | 'low'
  unitPrice?: number
  unitPriceLabel?: string
  quantityRatio?: number
}
interface LatestAnalysis {
  product_id: string
  run_at: string
  alert: string
  alert_reason: string | null
  price_diff_percent: number | null
  market_mean: number | null
  min_price: number | null
  max_price: number | null
  sources_count: number
  sources: Source[]
}

const CONF_GROUPS = [
  { key: 'exact'  as const, label: '⭐ Tam eşleşme',    badge: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',    border: 'border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600'   },
  { key: 'high'   as const, label: '✓ Yüksek eşleşme', badge: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',    border: 'border-green-100 hover:border-green-300 dark:border-green-900 dark:hover:border-green-700'   },
  { key: 'medium' as const, label: '⚠ Orta eşleşme',   badge: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700', border: 'border-yellow-100 hover:border-yellow-300 dark:border-yellow-900 dark:hover:border-yellow-700' },
  { key: 'low'    as const, label: '↓ Düşük eşleşme',  badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700', border: 'border-orange-100 hover:border-orange-300 dark:border-orange-900 dark:hover:border-orange-700' },
]

function ConfidenceDots({ sources }: { sources: Source[] }) {
  const exact  = sources.filter(s => s.confidence === 'exact').length
  const high   = sources.filter(s => (s.confidence ?? 'high') === 'high').length
  const medium = sources.filter(s => s.confidence === 'medium').length
  const low    = sources.filter(s => s.confidence === 'low').length
  return (
    <div className="inline-flex items-center gap-1.5">
      {exact > 0 && (
        <span title={`${exact} tam eşleşme`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
          ⭐{exact}
        </span>
      )}
      {high > 0 && (
        <span title={`${high} yüksek eşleşme`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
          ✓{high}
        </span>
      )}
      {medium > 0 && (
        <span title={`${medium} orta eşleşme`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">
          ⚠{medium}
        </span>
      )}
      {low > 0 && (
        <span title={`${low} düşük eşleşme`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">
          ↓{low}
        </span>
      )}
    </div>
  )
}

function ProductSourceGroups({ sources, fmt }: { sources: Source[]; fmt: (n: number) => string }) {
  const groups = CONF_GROUPS.map(g => ({
    ...g,
    items: sources.filter(s => (s.confidence ?? 'high') === g.key),
  })).filter(g => g.items.length > 0)

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.key}>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border mb-2 ${g.badge}`}>
            {g.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-700 border rounded-lg text-xs transition-colors ${g.border}`}>
                <PlatformLogo name={s.site} size={14} />
                <span className="font-medium text-gray-700 dark:text-slate-200">{s.site}</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{fmt(s.price)}</span>
                {s.unitPrice != null && s.unitPriceLabel && (
                  <span className="text-gray-400 dark:text-slate-500" title={`Oran: ${s.quantityRatio?.toFixed(2)}x`}>
                    ≈{s.unitPrice.toFixed(1)}&nbsp;{s.unitPriceLabel}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface Props {
  products: Product[]
  latestAnalyses: LatestAnalysis[]
}

function alertBadge(alert: string) {
  if (alert === 'above_market') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">Piyasa üstü ↑</span>
  if (alert === 'below_market') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">Piyasa altı ↓</span>
  if (alert === 'insufficient_data') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">Veri yetersiz</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">Normal</span>
}

type DiffOp = '' | 'lt' | 'lte' | 'eq' | 'gte' | 'gt'
type AlertKey = 'above_market' | 'below_market' | 'no_alert' | 'insufficient_data'
type ConfKey = 'exact' | 'high' | 'medium' | 'low'

export default function ProductsClient({ products, latestAnalyses }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [localProducts, setLocalProducts] = useState<Product[]>(products)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [alertFilter, setAlertFilter] = useState<AlertKey[]>([])
  const [confidenceFilter, setConfidenceFilter] = useState<ConfKey[]>([])
  const [diffOp, setDiffOp] = useState<DiffOp>('')
  const [diffVal, setDiffVal] = useState('')

  const analysisMap = Object.fromEntries(latestAnalyses.map(a => [a.product_id, a]))

  const categories = Array.from(
    new Set(localProducts.map(p => p.category).filter(Boolean) as string[])
  ).sort()

  function toggleAlert(key: AlertKey) {
    setAlertFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }
  function toggleConf(key: ConfKey) {
    setConfidenceFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const hasActiveFilters = categoryFilter !== 'all' || alertFilter.length > 0 ||
    confidenceFilter.length > 0 || (diffOp !== '' && diffVal !== '')

  function resetFilters() {
    setCategoryFilter('all'); setAlertFilter([]); setConfidenceFilter([])
    setDiffOp(''); setDiffVal('')
  }

  const filtered = localProducts.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = !q || p.product_name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q)
    const matchesStatus = status === 'all' || (status === 'active' ? p.is_active : !p.is_active)
    const matchesCategory = categoryFilter === 'all' || (p.category ?? '') === categoryFilter

    const analysis = analysisMap[p.id]
    const matchesAlert = alertFilter.length === 0 ||
      (analysis != null && alertFilter.includes(analysis.alert as AlertKey))

    const sources: Source[] = Array.isArray(analysis?.sources) ? analysis.sources : []
    const matchesConf = confidenceFilter.length === 0 ||
      confidenceFilter.some(cf => sources.some(s => (s.confidence ?? 'high') === cf))

    let matchesDiff = true
    if (diffOp && diffVal !== '') {
      const v = parseFloat(diffVal)
      const diff = analysis?.price_diff_percent
      if (!isNaN(v) && diff != null) {
        if (diffOp === 'lt')  matchesDiff = diff < v
        if (diffOp === 'lte') matchesDiff = diff <= v
        if (diffOp === 'eq')  matchesDiff = Math.abs(diff - v) < 0.05
        if (diffOp === 'gte') matchesDiff = diff >= v
        if (diffOp === 'gt')  matchesDiff = diff > v
      } else {
        matchesDiff = false
      }
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesAlert && matchesConf && matchesDiff
  })

  async function handleDelete(id: string) {
    if (!confirm('Bu ürün ve tüm analiz geçmişi silinecek. Emin misiniz?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setLocalProducts(prev => prev.filter(p => p.id !== id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSavePrice(id: string) {
    const price = parseFloat(editPrice)
    if (isNaN(price) || price <= 0) return
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ our_price: price }),
    })
    setLocalProducts(prev => prev.map(p => p.id === id ? { ...p, our_price: price } : p))
    setEditingId(null)
  }

  async function handleReanalyze(id: string) {
    setAnalyzingId(id)
    try {
      await fetch(`/api/products/${id}/analyze`, { method: 'POST' })
      router.refresh()
    } finally {
      setAnalyzingId(null)
    }
  }

  function handleExport() {
    const alertLabel = (a: string) =>
      a === 'above_market' ? 'Piyasa üstü' : a === 'below_market' ? 'Piyasa altı' : a === 'no_alert' ? 'Normal' : 'Veri yetersiz'

    const rows = filtered.map(p => {
      const an = analysisMap[p.id]
      return {
        'SKU':            p.sku,
        'Ürün Adı':       p.product_name,
        'Marka':          p.brand ?? '',
        'Kategori':       p.category ?? '',
        'Bizim Fiyat':    p.our_price,
        'Piyasa Ort.':    an?.market_mean ?? '',
        'Min Fiyat':      an?.min_price ?? '',
        'Maks Fiyat':     an?.max_price ?? '',
        'Fark %':         an?.price_diff_percent != null ? `${an.price_diff_percent > 0 ? '+' : ''}${an.price_diff_percent.toFixed(1)}%` : '',
        'Durum':          an ? alertLabel(an.alert) : '',
        'Kaynak Sayısı':  an?.sources_count ?? '',
        'Son Analiz':     an?.run_at ? new Date(an.run_at).toLocaleString('tr-TR') : '',
      }
    })
    const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')
    downloadExcel(rows, `fiyatlaa-urunler-${date}`, 'Ürünler')
  }

  const inputCls = 'border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const selectCls = `px-2 py-1 ${inputCls}`

  if (localProducts.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
        <div className="text-4xl mb-3">📦</div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Henüz ürün yok</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">Fiyat analizi yaparak ürünlerinizi sisteme ekleyin.</p>
        <a href="/dashboard/analyze" className="inline-flex items-center mt-4 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
          Fiyat analizi yap →
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Arama + aktif/pasif */}
      <div className="flex gap-3 mb-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SKU, ürün adı veya marka ara..."
          className={`flex-1 px-3 py-2 ${inputCls}`}
        />
        <select
          value={status}
          onChange={e => setStatus(e.target.value as typeof status)}
          className={`px-3 py-2 ${inputCls} text-gray-700 dark:text-slate-200`}
        >
          <option value="all">Tüm durumlar</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>
      </div>

      {/* Gelişmiş filtreler */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 px-1">

        {categories.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-slate-500 font-medium whitespace-nowrap">Kategori</span>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className={selectCls}
            >
              <option value="all">Tümü</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {/* Durum */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 dark:text-slate-500 font-medium whitespace-nowrap">Durum</span>
          <div className="flex gap-1">
            {([
              { key: 'above_market',    label: 'Piyasa üstü',  on: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'    },
              { key: 'below_market',    label: 'Piyasa altı',  on: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700' },
              { key: 'no_alert',        label: 'Normal',        on: 'bg-gray-100 text-gray-700 border-gray-400 dark:bg-slate-600 dark:text-slate-200 dark:border-slate-500'  },
              { key: 'insufficient_data', label: 'Veri yetersiz', on: 'bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700' },
            ] as { key: AlertKey; label: string; on: string }[]).map(({ key, label, on }) => (
              <button key={key}
                onClick={() => toggleAlert(key)}
                className={`px-2 py-0.5 rounded-md text-xs border font-medium transition-colors ${
                  alertFilter.includes(key) ? on : 'bg-white dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Kaynak güven seviyesi */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 dark:text-slate-500 font-medium whitespace-nowrap">Kaynak</span>
          <div className="flex gap-1">
            {([
              { key: 'exact',  label: '⭐ Tam',    on: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'    },
              { key: 'high',   label: '✓ Yüksek', on: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700'    },
              { key: 'medium', label: '⚠ Orta',   on: 'bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700' },
              { key: 'low',    label: '↓ Düşük',  on: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700' },
            ] as { key: ConfKey; label: string; on: string }[]).map(({ key, label, on }) => (
              <button key={key}
                onClick={() => toggleConf(key)}
                className={`px-2 py-0.5 rounded-md text-xs border font-medium transition-colors ${
                  confidenceFilter.includes(key) ? on : 'bg-white dark:bg-slate-700 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Fark % */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 dark:text-slate-500 font-medium whitespace-nowrap">Fark %</span>
          <select
            value={diffOp}
            onChange={e => setDiffOp(e.target.value as DiffOp)}
            className={selectCls}
          >
            <option value="">—</option>
            <option value="lt">{'<'}</option>
            <option value="lte">{'<='}</option>
            <option value="eq">{'='}</option>
            <option value="gte">{'>='}</option>
            <option value="gt">{'>'}</option>
          </select>
          {diffOp && (
            <input
              type="number"
              value={diffVal}
              onChange={e => setDiffVal(e.target.value)}
              placeholder="0"
              className={`w-16 px-2 py-1 ${inputCls} text-gray-700 dark:text-slate-200`}
            />
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
          >
            Filtreleri temizle ×
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-8 text-center text-sm text-gray-500 dark:text-slate-400">
          Aramanızla eşleşen ürün bulunamadı.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-slate-400">{filtered.length} / {localProducts.length} ürün</span>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Excel indir
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Ürün adı</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Bizim fiyat</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Piyasa ort.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Min / Maks</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Fark</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Durum</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Kaynak</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Son analiz</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {filtered.map((p) => {
                  const analysis = analysisMap[p.id]
                  const fmt = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })
                  const isExpanded = expandedRow === p.id
                  const sources: Source[] = Array.isArray(analysis?.sources) ? analysis.sources : []
                  return (
                    <>
                      <tr key={p.id}
                        className={`border-b border-gray-50 dark:border-slate-700 cursor-pointer ${isExpanded ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'}`}
                        onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{p.sku}</td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="font-medium text-gray-900 dark:text-slate-100 truncate" title={p.product_name}>{p.product_name}</div>
                          {p.category && (
                            <span className="inline-block mt-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
                              {p.category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-slate-100" onClick={e => e.stopPropagation()}>
                          {editingId === p.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={editPrice}
                                onChange={e => setEditPrice(e.target.value)}
                                className="w-24 px-2 py-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded text-sm text-right"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleSavePrice(p.id)}
                              />
                              <button onClick={() => handleSavePrice(p.id)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">Kaydet</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600">İptal</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingId(p.id); setEditPrice(String(p.our_price)) }}
                              className="hover:underline"
                            >
                              {fmt(p.our_price)}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400 text-sm">
                          {analysis?.market_mean != null ? fmt(analysis.market_mean) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400 dark:text-slate-500">
                          {analysis?.min_price != null && analysis?.max_price != null
                            ? `${fmt(analysis.min_price)} / ${fmt(analysis.max_price)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {analysis?.price_diff_percent != null ? (
                            <span className={analysis.price_diff_percent > 0 ? 'text-red-600' : 'text-green-600'}>
                              {analysis.price_diff_percent > 0 ? '+' : ''}{analysis.price_diff_percent.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {analysis ? alertBadge(analysis.alert) : (
                            <span className="text-xs text-gray-400 dark:text-slate-500">Analiz yok</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {analysis?.sources_count > 0 ? (
                            <ConfidenceDots sources={sources} />
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400 dark:text-slate-500">
                          {analysis ? (
                            <span>
                              {new Date(analysis.run_at).toLocaleDateString('tr-TR')}{' '}
                              <span className="text-gray-300 dark:text-slate-600">{new Date(analysis.run_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleReanalyze(p.id)}
                              disabled={analyzingId === p.id}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-40"
                            >
                              {analyzingId === p.id ? 'Taranıyor...' : 'Yenile'}
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deletingId === p.id}
                              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                            >
                              Sil
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && sources.length > 0 && (
                        <tr key={`${p.id}-detail`} className="bg-blue-50 dark:bg-blue-900/20">
                          <td colSpan={10} className="px-6 py-4">
                            <ProductSourceGroups sources={sources} fmt={fmt} />
                            {analysis?.alert_reason && (
                              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{analysis.alert_reason}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
