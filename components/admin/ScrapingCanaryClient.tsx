'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisResult } from '@/lib/analyzer'
import {
  aggregateDiscoveryBenchmark,
  selectBalancedDiscoveryCandidates,
  type ProductDiscoverySummary,
} from '@/lib/product-discovery-benchmark'

interface CanaryCandidate {
  id: string
  user_id: string
  sku: string
  barcode: string | null
  product_name: string
  brand: string | null
  manufacturer_code?: string | null
  product_type?: string | null
  category: string | null
  our_price: number
  stock_quantity: number
  external_source: string
}

interface CanaryResponse {
  dry_run: true
  writes_performed: 0
  minimum_sources: number
  elapsed_seconds: number
  estimated_provider_calls: number
  product: {
    id: string
    sku: string
    barcode: string | null
    product_name: string
    category: string | null
    our_price: number
    stock_quantity: number
  }
  discovery: ProductDiscoverySummary
  result: AnalysisResult
}

type ReviewValue = 'pending' | 'pass' | 'fail'

interface CanaryReview {
  product_match: ReviewValue
  price_match: ReviewValue
  stock_match: ReviewValue
  notes: string
}

interface CanaryRun {
  productId: string
  status: 'success' | 'error'
  data?: CanaryResponse
  error?: string
}

const EMPTY_REVIEW: CanaryReview = {
  product_match: 'pending',
  price_match: 'pending',
  stock_match: 'pending',
  notes: '',
}

function money(value: number | null | undefined) {
  if (value == null) return '—'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(value)
}

function confidenceLabel(value?: string) {
  if (value === 'exact') return 'Kesin'
  if (value === 'high') return 'Yüksek'
  if (value === 'medium') return 'Orta'
  if (value === 'low') return 'Düşük'
  return '—'
}

const OUTCOME_LABELS = {
  accepted: 'Bulundu',
  review_only: 'İnceleme adayı',
  no_results: 'Sonuç yok',
  identity_rejected: 'Kimlik uyuşmadı',
  out_of_stock: 'Stok dışı',
  filtered: 'Filtrelendi',
  timeout: 'Zaman aşımı',
  provider_error: 'Sağlayıcı hatası',
  not_attempted: 'Denenmedi',
} as const

function percent(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

export default function ScrapingCanaryClient() {
  const [candidates, setCandidates] = useState<CanaryCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [runs, setRuns] = useState<CanaryRun[]>([])
  const [reviews, setReviews] = useState<Record<string, CanaryReview>>({})
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runningProductId, setRunningProductId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRequested = useRef(false)

  useEffect(() => {
    let active = true
    fetch('/api/debug-scraper/canary', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Canary ürünleri alınamadı')
        if (active) setCandidates(body.candidates ?? [])
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    if (!needle) return candidates
    return candidates.filter(candidate =>
      [
        candidate.product_name,
        candidate.sku,
        candidate.barcode ?? '',
        candidate.category ?? '',
      ].some(value => value.toLocaleLowerCase('tr-TR').includes(needle))
    )
  }, [candidates, query])
  const benchmark = useMemo(
    () => aggregateDiscoveryBenchmark(runs),
    [runs],
  )
  const manualVerification = useMemo(() => {
    const values = runs
      .map(run => reviews[run.productId]?.product_match ?? 'pending')
    const passed = values.filter(value => value === 'pass').length
    const failed = values.filter(value => value === 'fail').length
    const reviewed = passed + failed
    return {
      reviewed,
      passed,
      failed,
      pending: values.length - reviewed,
      precision: reviewed > 0 ? passed / reviewed : 0,
    }
  }, [reviews, runs])

  function toggleProduct(productId: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(productId)) {
        next.delete(productId)
      } else if (next.size < 20) {
        next.add(productId)
      }
      return next
    })
  }

  function selectBalancedTwenty() {
    const balanced = selectBalancedDiscoveryCandidates(filteredCandidates, 20)
    setSelected(new Set(balanced.map(candidate => candidate.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function runCanary() {
    if (selected.size === 0 || running) return

    setRunning(true)
    setError(null)
    setRuns([])
    stopRequested.current = false

    for (const productId of Array.from(selected)) {
      if (stopRequested.current) break
      setRunningProductId(productId)

      try {
        const response = await fetch('/api/debug-scraper/canary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Canary analizi başarısız')

        setRuns(current => [
          ...current,
          { productId, status: 'success', data: body as CanaryResponse },
        ])
        setReviews(current => ({
          ...current,
          [productId]: current[productId] ?? { ...EMPTY_REVIEW },
        }))
      } catch (reason) {
        setRuns(current => [
          ...current,
          {
            productId,
            status: 'error',
            error: reason instanceof Error ? reason.message : String(reason),
          },
        ])
      }
    }

    setRunningProductId(null)
    setRunning(false)
  }

  function updateReview(productId: string, patch: Partial<CanaryReview>) {
    setReviews(current => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? EMPTY_REVIEW),
        ...patch,
      },
    }))
  }

  function downloadReport() {
    const report = {
      generated_at: new Date().toISOString(),
      dry_run: true,
      benchmark,
      manual_verification: manualVerification,
      runs,
      reviews,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fiyatlaa-scraping-canary-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Canary ürünlerini seç
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                En fazla 20 ürün. İşlemler paralel değil, sırayla çalışır ve veri yazmaz.
              </p>
            </div>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Ürün, SKU, barkod veya kategori ara"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 sm:w-80"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
            Ürünler yükleniyor…
          </div>
        ) : error && candidates.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-12 px-4 py-3">Seç</th>
                  <th className="px-4 py-3">Ürün</th>
                  <th className="px-4 py-3">Kimlik</th>
                  <th className="px-4 py-3">Fiyat / stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredCandidates.map(candidate => {
                  const checked = selected.has(candidate.id)
                  const disabled = !checked && selected.size >= 20
                  return (
                    <tr key={candidate.id} className="text-gray-700 dark:text-slate-300">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || running}
                          onChange={() => toggleProduct(candidate.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-slate-100">
                          {candidate.product_name}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {candidate.category ?? 'Kategorisiz'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>SKU: {candidate.sku}</div>
                        <div className={candidate.barcode ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                          {candidate.barcode ? `Barkod: ${candidate.barcode}` : 'Barkod yok — fallback adayı'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{money(candidate.our_price)}</div>
                        <div className="text-xs text-gray-400">Stok: {candidate.stock_quantity}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 dark:border-slate-700">
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {selected.size}/20 ürün seçildi · Supabase’e sonuç yazılmaz
          </div>
          <div className="flex gap-2">
            {!running && (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selected.size === 0}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Seçimi temizle
                </button>
                <button
                  type="button"
                  onClick={selectBalancedTwenty}
                  disabled={filteredCandidates.length === 0}
                  className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
                >
                  Dengeli 20 seç
                </button>
              </>
            )}
            {running && (
              <button
                type="button"
                onClick={() => { stopRequested.current = true }}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Sıradaki ürünlerden önce dur
              </button>
            )}
            <button
              type="button"
              disabled={selected.size === 0 || running}
              onClick={runCanary}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? 'Canary çalışıyor…' : 'Seçilenleri sırayla çalıştır'}
            </button>
          </div>
        </div>
      </section>

      {runningProductId && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          Ürün taranıyor: {candidates.find(item => item.id === runningProductId)?.product_name ?? runningProductId}
        </div>
      )}

      {runs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Canary sonuçları</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Kaynak bağlantılarını açıp ürün, fiyat ve stok bilgisini elle doğrulayın.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadReport}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              JSON raporunu indir
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-gray-500 dark:text-slate-400">Tamamlanan</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-slate-100">
                {benchmark.completed}/{selected.size}
              </p>
              <p className="mt-1 text-xs text-gray-400">{benchmark.errors} teknik hata</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Ürün bulundu</p>
              <p className="mt-1 text-xl font-semibold text-emerald-800 dark:text-emerald-200">
                {benchmark.discovered}/{benchmark.completed} · {percent(benchmark.discoveryRate)}
              </p>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                En az bir güvenilir kaynak
              </p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="text-xs text-blue-700 dark:text-blue-300">Fiyatlandırmaya hazır</p>
              <p className="mt-1 text-xl font-semibold text-blue-800 dark:text-blue-200">
                {benchmark.pricingReady}/{benchmark.completed} · {percent(benchmark.pricingReadyRate)}
              </p>
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Minimum kaynak sayısına ulaştı
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-xs text-amber-700 dark:text-amber-300">Diğer sonuçlar</p>
              <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
                {benchmark.candidateOnly} inceleme · {benchmark.notFound} bulunamadı
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Ort. {benchmark.averageElapsedSeconds.toFixed(1)} sn · {benchmark.totalEstimatedProviderCalls} çağrı
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
              <p className="text-xs text-violet-700 dark:text-violet-300">Elle doğrulanan isabet</p>
              <p className="mt-1 text-xl font-semibold text-violet-800 dark:text-violet-200">
                {manualVerification.passed}/{manualVerification.reviewed} · {percent(manualVerification.precision)}
              </p>
              <p className="mt-1 text-xs text-violet-600 dark:text-violet-400">
                {manualVerification.failed} yanlış · {manualVerification.pending} bekliyor
              </p>
            </div>
          </div>

          {runs.map(run => {
            if (run.status === 'error' || !run.data) {
              return (
                <div key={run.productId} className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {run.error ?? 'Bilinmeyen canary hatası'}
                </div>
              )
            }

            const { data } = run
            const review = reviews[run.productId] ?? EMPTY_REVIEW

            return (
              <article key={run.productId} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-gray-100 px-5 py-4 dark:border-slate-700">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-slate-100">{data.product.product_name}</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        {data.product.barcode ? `Barkod ${data.product.barcode}` : 'Barkod yok'} · Bizim fiyat {money(data.product.our_price)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`rounded-full px-2 py-1 font-medium ${
                        data.discovery.found
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : data.discovery.candidateOnly
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                      }`}>
                        {data.discovery.found
                          ? `Ürün bulundu · ${data.discovery.acceptedSourceCount} kaynak`
                          : data.discovery.candidateOnly
                            ? 'Yalnızca inceleme adayı'
                            : 'Ürün bulunamadı'}
                      </span>
                      <span className={`rounded-full px-2 py-1 ${
                        data.discovery.pricingReady
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {data.discovery.pricingReady
                          ? 'Fiyatlandırmaya hazır'
                          : `Fiyat kaynağı ${data.discovery.acceptedSourceCount}/${data.minimum_sources}`}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Dry-run · 0 yazma
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                        {data.elapsed_seconds} sn
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                        Tahmini {data.estimated_provider_calls} sağlayıcı çağrısı
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.result.search_attempts.map((attempt, index) => (
                      <span key={`${attempt.strategy}-${index}`} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                        {attempt.strategy} · {attempt.platforms.length} platform
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {data.discovery.platformOutcomes.map(platform => (
                      <div
                        key={platform.platform}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs dark:border-slate-600 dark:bg-slate-900/50"
                      >
                        <div className="font-medium text-gray-800 dark:text-slate-200">
                          {platform.platform}
                        </div>
                        <div className={
                          platform.outcome === 'accepted'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : platform.outcome === 'review_only'
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-gray-500 dark:text-slate-400'
                        }>
                          {OUTCOME_LABELS[platform.outcome]}
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-400">
                          {platform.rawCandidates} aday · {(platform.durationMs / 1000).toFixed(1)} sn
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                  {data.result.sources.length === 0 ? (
                    <div className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      Güvenilir kaynak bulunamadı. Platform sağlık ve fallback adımlarını kontrol edin.
                    </div>
                  ) : data.result.sources.map(source => (
                    <a
                      key={`${source.site}-${source.url}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-gray-200 p-3 transition-colors hover:border-blue-400 dark:border-slate-600 dark:hover:border-blue-500"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-slate-100">{source.site}</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {money(source.comparisonPrice ?? source.price)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">
                        {source.product_name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                          {confidenceLabel(source.confidence)}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                          Skor {source.matchScore?.toFixed(2) ?? '—'}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 ${source.inStock === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {source.inStock === false ? 'Stok dışı' : source.inStock === true ? 'Stokta' : 'Stok bilinmiyor'}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>

                {data.result.review_candidates.length > 0 && (
                  <div className="border-t border-orange-100 bg-orange-50/60 px-5 py-4 dark:border-orange-900/60 dark:bg-orange-950/20">
                    <p className="mb-3 text-xs font-semibold text-orange-700 dark:text-orange-300">
                      Manuel inceleme · {data.result.review_candidates.length} düşük güvenli aday fiyat hesabına alınmadı
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {data.result.review_candidates.map(source => (
                        <a
                          key={`${source.site}-${source.url}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-orange-200 bg-white p-3 transition-colors hover:border-orange-400 dark:border-orange-900 dark:bg-slate-800 dark:hover:border-orange-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900 dark:text-slate-100">{source.site}</span>
                            <span className="font-semibold text-orange-600 dark:text-orange-300">
                              {money(source.comparisonPrice ?? source.price)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">
                            {source.product_name}
                          </p>
                          <p className="mt-2 text-[10px] text-orange-600 dark:text-orange-300">
                            Skor {source.matchScore?.toFixed(2) ?? '—'} · yalnızca inceleme
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {data.result.rejected_candidates.length > 0 && (
                  <details className="border-t border-gray-100 bg-gray-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/30">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-slate-300">
                      Kimlik nedeniyle reddedilen en güçlü adaylar · {data.result.rejected_candidates.length}
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {data.result.rejected_candidates.map((source, index) => (
                        <a
                          key={`${source.site}-${source.url}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900 dark:text-slate-100">{source.site}</span>
                            <span className="text-xs text-gray-500">{money(source.price)}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-slate-400">
                            {source.product_name}
                          </p>
                          <p className="mt-2 line-clamp-2 text-[10px] text-red-600 dark:text-red-400">
                            {source.matchReasons?.join(' · ') || 'Kimlik kurallarını geçemedi'}
                          </p>
                        </a>
                      ))}
                    </div>
                  </details>
                )}

                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
                  <div className="grid gap-3 md:grid-cols-3">
                    {([
                      ['product_match', 'Ürün eşleşmesi'],
                      ['price_match', 'Fiyat eşleşmesi'],
                      ['stock_match', 'Stok eşleşmesi'],
                    ] as const).map(([field, label]) => (
                      <label key={field} className="text-xs text-gray-500 dark:text-slate-400">
                        {label}
                        <select
                          value={review[field]}
                          onChange={event => updateReview(run.productId, {
                            [field]: event.target.value as ReviewValue,
                          })}
                          className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="pending">Kontrol edilmedi</option>
                          <option value="pass">Doğru</option>
                          <option value="fail">Yanlış</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={review.notes}
                    onChange={event => updateReview(run.productId, { notes: event.target.value })}
                    placeholder="Varyant, fiyat, stok veya eşleşme notu"
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
