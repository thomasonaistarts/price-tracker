'use client'
import { useState, useEffect, useRef } from 'react'

// ── Tipler ────────────────────────────────────────────────────────────────────

interface Source {
  site: string; price: number; url: string
  confidence?: 'exact' | 'high' | 'medium' | 'low'
  unitPrice?: number; unitPriceLabel?: string; quantityRatio?: number; matchReasons?: string[]
}
interface AnalysisResult {
  sku: string; product_name: string; our_price: number; category?: string
  market_mean: number | null; market_median: number | null
  min_price: number | null; max_price: number | null
  price_diff_percent: number | null; alert: string; alert_reason: string
  sources_count: number; sources: Source[]; confidence: number; notes: string[]
}
interface DupInfo { existing: string[]; new_skus: string[] }
interface RawProduct {
  sku: string; product_name: string; our_price: string | number
  category?: string; brand?: string; currency?: string
}
interface PasteRow extends RawProduct { valid: boolean; error?: string }

type InputMode = 'file' | 'single' | 'paste'

// ── Yardımcı bileşenler ───────────────────────────────────────────────────────

function alertColor(a: string) {
  if (a === 'above_market')    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
  if (a === 'below_market')    return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
  if (a === 'insufficient_data') return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800'
  return 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
}
function alertLabel(a: string) {
  if (a === 'above_market')    return 'Piyasa üstü ↑'
  if (a === 'below_market')    return 'Piyasa altı ↓'
  if (a === 'insufficient_data') return 'Veri yetersiz'
  return 'Normal'
}

const CONF_GROUPS = [
  { key: 'exact'  as const, label: '⭐ Tam',    badge: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',   border: 'border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600' },
  { key: 'high'   as const, label: '✓ Yüksek',  badge: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',   border: 'border-green-100 hover:border-green-300 dark:border-green-900 dark:hover:border-green-700'  },
  { key: 'medium' as const, label: '⚠ Orta',    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700', border: 'border-yellow-100 hover:border-yellow-300 dark:border-yellow-900 dark:hover:border-yellow-700' },
  { key: 'low'    as const, label: '↓ Düşük',   badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700', border: 'border-orange-100 hover:border-orange-300 dark:border-orange-900 dark:hover:border-orange-700' },
]

function ConfidenceDots({ sources }: { sources: Source[] }) {
  const counts = {
    exact:  sources.filter(s => s.confidence === 'exact').length,
    high:   sources.filter(s => (s.confidence ?? 'high') === 'high').length,
    medium: sources.filter(s => s.confidence === 'medium').length,
    low:    sources.filter(s => s.confidence === 'low').length,
  }
  return (
    <div className="inline-flex items-center gap-1.5">
      {CONF_GROUPS.filter(g => counts[g.key] > 0).map(g => (
        <span key={g.key} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${g.badge}`}>
          {g.label}{counts[g.key]}
        </span>
      ))}
    </div>
  )
}

function SourceGroups({ sources, fmt }: { sources: Source[]; fmt: (n: number) => string }) {
  return (
    <div className="space-y-3">
      {CONF_GROUPS.map(g => {
        const items = sources.filter(s => (s.confidence ?? 'high') === g.key)
        if (!items.length) return null
        return (
          <div key={g.key}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border mb-2 ${g.badge}`}>{g.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {items.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-700 border rounded-lg text-xs transition-colors ${g.border}`}
                  title={s.matchReasons?.join(' | ')}>
                  <span className="font-medium text-gray-700 dark:text-slate-200">{s.site}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{fmt(s.price)}</span>
                  {s.unitPrice != null && s.unitPriceLabel && (
                    <span className="text-gray-400 dark:text-slate-500">≈{s.unitPrice.toFixed(1)}&nbsp;{s.unitPriceLabel}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Toplu yapıştır ayrıştırıcı ────────────────────────────────────────────────

function parsePasteText(text: string): PasteRow[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      // Ayraç önceliği: tab > noktalı virgül > virgül
      const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
      const [sku = '', product_name = '', our_price = '', category = '', brand = ''] =
        line.split(sep).map(p => p.trim())
      const price = parseFloat(our_price.replace(',', '.').replace(/[^\d.]/g, ''))
      const valid = sku.length > 0 && product_name.length > 0 && !isNaN(price) && price > 0
      return {
        sku, product_name, our_price: our_price || '',
        category: category || undefined, brand: brand || undefined,
        currency: 'TRY', valid,
        error: !valid
          ? (!sku ? 'SKU boş' : !product_name ? 'Ürün adı boş' : 'Geçersiz fiyat')
          : undefined,
      }
    })
}

// ── Sayfa ─────────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function AnalyzePage() {
  const [loading, setLoading]           = useState(false)
  const [loadingMsg, setLoadingMsg]     = useState('')
  const [results, setResults]           = useState<AnalysisResult[]>([])
  const [error, setError]               = useState('')
  const [threshold, setThreshold]       = useState(10)
  const [expandedRow, setExpandedRow]   = useState<string | null>(null)
  const [dupInfo, setDupInfo]           = useState<DupInfo | null>(null)
  const [pendingProducts, setPendingProducts] = useState<unknown[]>([])

  // Giriş modu
  const [mode, setMode] = useState<InputMode>('file')

  // Tek ürün formu
  const [single, setSingle] = useState({ sku: '', product_name: '', our_price: '', category: '', brand: '' })
  const [singleErrors, setSingleErrors] = useState<Partial<typeof single>>({})

  // Toplu yapıştır
  const [pasteText, setPasteText]       = useState('')
  const [pasteRows, setPasteRows]       = useState<PasteRow[]>([])
  const [pastePreviewed, setPastePreviewed] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 1. Tarayıcı kapatma / yenileme uyarısı ──────────────────────────────────
  useEffect(() => {
    if (!loading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Analiz devam ediyor — sayfadan ayrılmak istediğinizden emin misiniz?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [loading])

  // ── Analiz fonksiyonları ─────────────────────────────────────────────────────

  async function runAnalysis(products: unknown[]) {
    setLoading(true); setDupInfo(null)
    try {
      setLoadingMsg(
        `${products.length} ürün için 5 platform taranıyor... (~${Math.max(10, Math.round(products.length * 12))}s)`
      )
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, threshold_percent: threshold, min_sources: 2 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.results)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analiz sırasında hata oluştu.')
    } finally {
      setLoading(false); setLoadingMsg('')
    }
  }

  async function runWithDupCheck(normalized: RawProduct[]) {
    setError(''); setResults([]); setDupInfo(null); setPendingProducts([])
    setLoading(true); setLoadingMsg('SKU kontrolü yapılıyor...')
    try {
      const skus = normalized.map(p => String(p.sku ?? '')).filter(Boolean)
      const checkRes = await fetch('/api/products/check-skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus }),
      })
      const { existing, new_skus } = await checkRes.json() as DupInfo
      if (existing.length > 0) {
        setPendingProducts(normalized)
        setDupInfo({ existing, new_skus })
        setLoading(false); setLoadingMsg('')
        return
      }
      await runAnalysis(normalized)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.')
      setLoading(false); setLoadingMsg('')
    }
  }

  // ── Dosya yükleme ────────────────────────────────────────────────────────────

  async function parseFile(file: File): Promise<unknown[]> {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    }
    const Papa = (await import('papaparse')).default
    return new Promise((resolve, reject) => {
      Papa.parse<unknown>(file, {
        header: true, skipEmptyLines: true,
        complete: p => resolve(p.data),
        error: () => reject(new Error('Dosya okunamadı.')),
      })
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setResults([]); setDupInfo(null); setPendingProducts([])
    try {
      setLoading(true); setLoadingMsg('Dosya okunuyor...')
      const products = await parseFile(file)
      if (!products.length) throw new Error('Dosyada ürün bulunamadı.')
      const normalizeRow = (p: any): RawProduct => ({
        sku:          p.sku          ?? p.SKU          ?? p.Sku          ?? '',
        product_name: p.product_name ?? p.ProductName  ?? p.product_Name ?? p['Ürün Adı'] ?? p['urun_adi'] ?? '',
        brand:        p.brand        ?? p.Brand        ?? p['Marka']     ?? undefined,
        category:     p.category     ?? p.Category     ?? p['Kategori']  ?? undefined,
        our_price:    p.our_price    ?? p.OurPrice     ?? p.our_Price    ?? p['Fiyat']    ?? p['fiyat'] ?? p['Price'] ?? '',
        currency:     p.currency     ?? p.Currency     ?? 'TRY',
      })
      await runWithDupCheck(products.map(normalizeRow))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dosya işlenirken hata oluştu.')
      setLoading(false); setLoadingMsg('')
    }
  }

  // ── Tek ürün ─────────────────────────────────────────────────────────────────

  function validateSingle() {
    const errs: Partial<typeof single> = {}
    if (!single.sku.trim())          errs.sku = 'SKU zorunludur'
    if (!single.product_name.trim()) errs.product_name = 'Ürün adı zorunludur'
    const price = parseFloat(single.our_price.replace(',', '.'))
    if (!single.our_price || isNaN(price) || price <= 0) errs.our_price = 'Geçerli fiyat giriniz'
    return errs
  }

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateSingle()
    if (Object.keys(errs).length) { setSingleErrors(errs); return }
    setSingleErrors({})
    const product: RawProduct = {
      sku: single.sku.trim(),
      product_name: single.product_name.trim(),
      our_price: parseFloat(single.our_price.replace(',', '.')),
      category: single.category.trim() || undefined,
      brand: single.brand.trim() || undefined,
      currency: 'TRY',
    }
    await runWithDupCheck([product])
  }

  // ── Toplu yapıştır ───────────────────────────────────────────────────────────

  function handlePastePreview() {
    const rows = parsePasteText(pasteText)
    setPasteRows(rows)
    setPastePreviewed(true)
  }

  async function handlePasteSubmit() {
    const valid = pasteRows.filter(r => r.valid)
    if (!valid.length) { setError('Geçerli ürün satırı bulunamadı.'); return }
    await runWithDupCheck(valid)
  }

  // ── Dup handlers ────────────────────────────────────────────────────────────

  function handleRunAll() { runAnalysis(pendingProducts) }
  function handleRunOnlyNew() {
    const existing = new Set(dupInfo?.existing ?? [])
    const filtered = pendingProducts.filter((p: any) => !existing.has(String(p.sku ?? '')))
    if (!filtered.length) { setError('Eklenecek yeni ürün yok.'); setDupInfo(null); return }
    runAnalysis(filtered)
  }

  const fmt = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

  const validPasteCount = pasteRows.filter(r => r.valid).length
  const invalidPasteCount = pasteRows.filter(r => !r.valid).length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Analiz uyarı banner'ı ── */}
      {loading && (
        <div className="fixed top-0 left-0 lg:left-56 right-0 z-50 bg-amber-500 dark:bg-amber-600 text-white text-center text-xs py-2 px-4 flex items-center justify-center gap-2 shadow-md">
          <svg className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          Analiz devam ediyor — tarayıcıyı kapatmayın veya başka sayfaya geçmeyin, analiz yarıda kalır.
        </div>
      )}

      <div className={loading ? 'pt-9' : ''}>
        <div className="mb-6">
          <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Fiyat analizi</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Hepsiburada, N11, PTTAvm, İdefix ve Trendyol'daki rakip fiyatları otomatik tarar
          </p>
        </div>

        {/* ── Giriş kartı ── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 mb-6 overflow-hidden">

          {/* Mod sekmeleri */}
          <div className="flex border-b border-gray-100 dark:border-slate-700">
            {([
              { key: 'file'   as const, label: '📁 Dosya yükle', desc: 'CSV / Excel' },
              { key: 'single' as const, label: '✏️ Tek ürün',    desc: 'Form ile giriş' },
              { key: 'paste'  as const, label: '📋 Toplu yapıştır', desc: 'Kopyala & yapıştır' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => { setMode(t.key); setError('') }}
                disabled={loading}
                className={`flex-1 px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                  mode === t.key
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-b-2 border-blue-500'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'
                }`}
              >
                <div className={`text-sm font-medium ${mode === t.key ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-slate-300'}`}>
                  {t.label}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* ── Ortak: Eşik ayarı ── */}
            <div className="mb-5 pb-5 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  Uyarı eşiği
                </label>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">%{threshold}</span>
              </div>
              <input type="range" min={1} max={30} value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                <span>%1</span><span>Bizim fiyatımız piyasa ortalamasından bu kadar sapınca uyarı verir</span><span>%30</span>
              </div>
            </div>

            {/* ── MOD: Dosya ── */}
            {mode === 'file' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Dosya seç <span className="text-gray-400 dark:text-slate-500 font-normal">(CSV veya Excel)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file" accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload} disabled={loading}
                  className="block w-full text-sm text-gray-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                  Zorunlu sütunlar:{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">sku</code>{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">product_name</code>{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">our_price</code>
                  {' '}· İsteğe bağlı:{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">category</code>{' '}
                  <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">brand</code>
                </p>
              </div>
            )}

            {/* ── MOD: Tek ürün ── */}
            {mode === 'single' && (
              <form onSubmit={handleSingleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* SKU */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      SKU <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={single.sku}
                      onChange={e => { setSingle(s => ({ ...s, sku: e.target.value })); setSingleErrors(se => ({ ...se, sku: undefined })) }}
                      placeholder="SKU-001"
                      className={inputCls}
                    />
                    {singleErrors.sku && <p className="text-xs text-red-500 mt-1">{singleErrors.sku}</p>}
                  </div>

                  {/* Fiyat */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      Bizim fiyatımız (₺) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={single.our_price}
                      onChange={e => { setSingle(s => ({ ...s, our_price: e.target.value })); setSingleErrors(se => ({ ...se, our_price: undefined })) }}
                      placeholder="1299.90"
                      className={inputCls}
                    />
                    {singleErrors.our_price && <p className="text-xs text-red-500 mt-1">{singleErrors.our_price}</p>}
                  </div>
                </div>

                {/* Ürün adı */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                    Ürün adı <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={single.product_name}
                    onChange={e => { setSingle(s => ({ ...s, product_name: e.target.value })); setSingleErrors(se => ({ ...se, product_name: undefined })) }}
                    placeholder="Apple iPhone 15 128GB Siyah"
                    className={inputCls}
                  />
                  {singleErrors.product_name && <p className="text-xs text-red-500 mt-1">{singleErrors.product_name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Kategori */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      Kategori <span className="text-gray-400 dark:text-slate-500 font-normal">(opsiyonel)</span>
                    </label>
                    <input
                      type="text"
                      value={single.category}
                      onChange={e => setSingle(s => ({ ...s, category: e.target.value }))}
                      placeholder="Elektronik"
                      className={inputCls}
                    />
                  </div>

                  {/* Marka */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      Marka <span className="text-gray-400 dark:text-slate-500 font-normal">(opsiyonel)</span>
                    </label>
                    <input
                      type="text"
                      value={single.brand}
                      onChange={e => setSingle(s => ({ ...s, brand: e.target.value }))}
                      placeholder="Apple"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    Fiyat analizi yap
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSingle({ sku: '', product_name: '', our_price: '', category: '', brand: '' }); setSingleErrors({}) }}
                    className="text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                  >
                    Temizle
                  </button>
                </div>
              </form>
            )}

            {/* ── MOD: Toplu yapıştır ── */}
            {mode === 'paste' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                      Ürün listesini buraya yapıştırın
                    </label>
                    {pasteText && (
                      <button onClick={() => { setPasteText(''); setPasteRows([]); setPastePreviewed(false) }}
                        className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                        Temizle ×
                      </button>
                    )}
                  </div>
                  <textarea
                    value={pasteText}
                    onChange={e => { setPasteText(e.target.value); setPastePreviewed(false); setPasteRows([]) }}
                    rows={6}
                    placeholder={
                      'Excel\'den veya başka kaynaktan kopyalayıp buraya yapıştırın.\n' +
                      'Her satır bir ürün. Sütun sırası:\n' +
                      '  SKU  |  Ürün Adı  |  Fiyat  |  Kategori (opsiyonel)  |  Marka (opsiyonel)\n\n' +
                      'Örnek:\n' +
                      'SKU-001\tApple iPhone 15 128GB\t29999\tTelefon\tApple\n' +
                      'SKU-002\tSamsung Galaxy A54\t12499\tTelefon'
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-300 dark:placeholder:text-slate-600"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                    Ayraç olarak <strong>sekme</strong> (Excel yapıştır), <strong>;</strong> veya <strong>,</strong> desteklenir.
                    Zorunlu: SKU, Ürün Adı, Fiyat
                  </p>
                </div>

                {/* Önizleme butonu */}
                {pasteText && !pastePreviewed && (
                  <button
                    onClick={handlePastePreview}
                    disabled={loading}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Önizle ({pasteText.split('\n').filter(l => l.trim()).length} satır)
                  </button>
                )}

                {/* Önizleme tablosu */}
                {pastePreviewed && pasteRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-700 dark:text-slate-300 font-medium">{pasteRows.length} satır</span>
                        {validPasteCount > 0 && (
                          <span className="text-green-600 dark:text-green-400">✓ {validPasteCount} geçerli</span>
                        )}
                        {invalidPasteCount > 0 && (
                          <span className="text-red-500">✗ {invalidPasteCount} hatalı</span>
                        )}
                      </div>
                      <button
                        onClick={() => setPastePreviewed(false)}
                        className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600"
                      >
                        Düzenle
                      </button>
                    </div>
                    <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-slate-700/50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">#</th>
                            <th className="text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">SKU</th>
                            <th className="text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Ürün adı</th>
                            <th className="text-right px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Fiyat</th>
                            <th className="text-left px-3 py-2 text-gray-500 dark:text-slate-400 font-medium">Kategori</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                          {pasteRows.map((row, i) => (
                            <tr key={i} className={row.valid ? 'bg-white dark:bg-slate-800' : 'bg-red-50 dark:bg-red-900/20'}>
                              <td className="px-3 py-1.5 text-gray-400 dark:text-slate-500 font-mono">{i + 1}</td>
                              <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-slate-300">{row.sku || <span className="text-red-400">—</span>}</td>
                              <td className="px-3 py-1.5 text-gray-700 dark:text-slate-300 max-w-[200px] truncate">{row.product_name || <span className="text-red-400">—</span>}</td>
                              <td className="px-3 py-1.5 text-right text-gray-700 dark:text-slate-300">{row.our_price || <span className="text-red-400">—</span>}</td>
                              <td className="px-3 py-1.5 text-gray-500 dark:text-slate-400">
                                {row.valid ? (row.category || '—') : (
                                  <span className="text-red-500 dark:text-red-400 font-medium">{row.error}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {validPasteCount > 0 && (
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={handlePasteSubmit}
                          disabled={loading}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                          </svg>
                          {validPasteCount} ürünü analiz et
                        </button>
                        {invalidPasteCount > 0 && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            {invalidPasteCount} hatalı satır atlanacak
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Duplicate uyarısı ── */}
        {dupInfo && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5 mb-6">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">Bazı ürünler zaten kayıtlı</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">
              <strong>{dupInfo.existing.length}</strong> ürün daha önce eklenmiş,{' '}
              <strong>{dupInfo.new_skus.length}</strong> ürün yeni.
              {dupInfo.existing.length > 0 && (
                <span className="block mt-1 text-xs text-amber-600 dark:text-amber-500">
                  Kayıtlı SKU&apos;lar: {dupInfo.existing.slice(0, 5).join(', ')}
                  {dupInfo.existing.length > 5 ? ` +${dupInfo.existing.length - 5} daha` : ''}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleRunAll}
                className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors">
                Tümünü analiz et ({pendingProducts.length} ürün)
              </button>
              {dupInfo.new_skus.length > 0 && (
                <button onClick={handleRunOnlyNew}
                  className="px-4 py-2 bg-white dark:bg-slate-700 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                  Sadece yenileri ekle ({dupInfo.new_skus.length} ürün)
                </button>
              )}
              <button onClick={() => { setDupInfo(null); setPendingProducts([]) }}
                className="px-4 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
                İptal
              </button>
            </div>
          </div>
        )}

        {/* ── Hata ── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ── Yükleniyor ── */}
        {loading && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-10 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Rakip fiyatlar taranıyor...</p>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500">{loadingMsg}</p>
          </div>
        )}

        {/* ── Sonuçlar ── */}
        {results.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                {results.length} ürün analiz edildi
              </span>
              <div className="flex gap-4 text-xs">
                <span className="text-red-600 font-medium">↑ {results.filter(r => r.alert === 'above_market').length} piyasa üstü</span>
                <span className="text-green-600 font-medium">↓ {results.filter(r => r.alert === 'below_market').length} piyasa altı</span>
                <span className="text-yellow-600">⚠ {results.filter(r => r.alert === 'insufficient_data').length} veri yetersiz</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">SKU</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Ürün</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Bizim</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Piyasa ort.</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Min / Maks</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Fark</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Durum</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Kaynak</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <>
                      <tr key={r.sku}
                        className={`border-b border-gray-50 dark:border-slate-700 cursor-pointer ${expandedRow === r.sku ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'}`}
                        onClick={() => setExpandedRow(expandedRow === r.sku ? null : r.sku)}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.sku}</td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="font-medium text-gray-900 dark:text-slate-100 truncate" title={r.product_name}>{r.product_name}</div>
                          {r.category && (
                            <span className="inline-block mt-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
                              {r.category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-slate-100">{fmt(r.our_price)}</td>
                        <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{r.market_mean != null ? fmt(r.market_mean) : '—'}</td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400 dark:text-slate-500">
                          {r.min_price != null && r.max_price != null ? `${fmt(r.min_price)} / ${fmt(r.max_price)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {r.price_diff_percent != null ? (
                            <span className={r.price_diff_percent > 0 ? 'text-red-600' : 'text-green-600'}>
                              {r.price_diff_percent > 0 ? '+' : ''}{r.price_diff_percent.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${alertColor(r.alert)}`}>
                            {alertLabel(r.alert)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.sources_count > 0 ? <ConfidenceDots sources={r.sources} /> : '—'}
                        </td>
                      </tr>
                      {expandedRow === r.sku && r.sources.length > 0 && (
                        <tr key={`${r.sku}-detail`} className="bg-blue-50 dark:bg-blue-900/20">
                          <td colSpan={8} className="px-6 py-4">
                            <SourceGroups sources={r.sources} fmt={fmt} />
                            {r.alert_reason && <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">{r.alert_reason}</p>}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
