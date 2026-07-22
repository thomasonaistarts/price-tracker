import type { ProductInput } from '@/lib/validations'
import { scrapeAllPlatforms, type ScrapedPrice, type ConfidenceThresholds, type PlatformScrapeHealth, DEFAULT_CONFIDENCE_THRESHOLDS } from '@/lib/scrapers'
import type { SourceDecisionRule } from '@/lib/source-decisions'
import { chooseProductSearchQuery, searchStrategyNote } from '@/lib/product-identity'

export type { ScrapedPrice }

export interface AnalysisResult {
  sku: string
  product_name: string
  category: string
  brand: string
  our_price: number
  threshold_used: number
  market_mean: number | null
  market_median: number | null
  market_std: number | null
  min_price: number | null
  max_price: number | null
  sources_count: number
  sources: ScrapedPrice[]
  price_diff_percent: number | null
  alert: 'above_market' | 'below_market' | 'no_alert' | 'insufficient_data'
  alert_reason: string
  follow_up: string[]
  confidence: number
  notes: string[]
  scraper_health: PlatformScrapeHealth[]
  technical_failure: boolean
}

export interface AnalysisOptions {
  thresholdPercent: number
  minSources: number
  categoryThresholds?: Record<string, number>
  confidenceThresholds?: ConfidenceThresholds
  upperOutlierPct?: number
  lowerOutlierPct?: number
  activePlatforms?: string[]
  sourceDecisions?: SourceDecisionRule[]
}

function r2(n: number) { return Math.round(n * 100) / 100 }

function iqrFilter(arr: number[]): number[] {
  if (arr.length < 4) return arr
  const s = [...arr].sort((a, b) => a - b)
  const q1 = s[Math.floor(s.length * 0.25)]
  const q3 = s[Math.floor(s.length * 0.75)]
  const iqr = q3 - q1
  return arr.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr)
}

export async function analyzeProduct(
  product: ProductInput,
  options: AnalysisOptions,
): Promise<AnalysisResult> {
  const { sku, product_name, category = '', brand = '', our_price } = product
  const thresholdPercent = options.categoryThresholds?.[category] ?? options.thresholdPercent
  const minSources = options.minSources
  const upperOutlierPct = options.upperOutlierPct ?? 250
  const search = chooseProductSearchQuery(sku, product_name)
  const searchNote = searchStrategyNote(search.strategy)

  // Gerçek rakip fiyatları scrape et
  let scraperHealth: PlatformScrapeHealth[] = []
  const sources = await scrapeAllPlatforms(product_name, {
    thresholds: options.confidenceThresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS,
    activePlatforms: options.activePlatforms,
    searchQuery: search.query,
    lowerOutlierPct: options.lowerOutlierPct,
    sourceDecisions: options.sourceDecisions,
    onHealth: (health) => { scraperHealth = health },
  })

  const prices = sources.map(s => s.comparisonPrice ?? s.price).filter(p => p > 0)
  const filtered = iqrFilter(prices)
  // Sıfır kaynak, platformlar "başarılı" görünse bile geçerli fiyat analizi değildir.
  // Önceki başarılı sonucu koru ve cron'un daha sonra yeniden denemesine izin ver.
  const technicalFailure = sources.length === 0

  if (filtered.length < minSources) {
    return {
      sku, product_name, category, brand, our_price,
      threshold_used: thresholdPercent,
      market_mean: null, market_median: null, market_std: null,
      min_price: prices.length ? r2(Math.min(...prices)) : null,
      max_price: prices.length ? r2(Math.max(...prices)) : null,
      sources_count: sources.length, sources,
      price_diff_percent: null,
      alert: 'insufficient_data',
      alert_reason: sources.length === 0
        ? 'Rakip sitelerden fiyat bilgisi alınamadı'
        : `Yalnızca ${filtered.length} güvenilir kaynak bulundu (min: ${minSources})`,
      follow_up: ['manuel_kontrol', 'daha_fazla_kaynak'],
      confidence: 0.2,
      scraper_health: scraperHealth,
      technical_failure: technicalFailure,
      notes: [
        searchNote,
        ...(sources.length === 0 ? ['Scraper sonuç döndürmedi — ürün adını kontrol edin veya daha sonra tekrar deneyin'] : [`IQR filtreleme sonrası ${filtered.length} kaynak kaldı`]),
      ],
    }
  }

  const mean = r2(filtered.reduce((a, b) => a + b, 0) / filtered.length)
  const sorted = [...filtered].sort((a, b) => a - b)
  const median = r2(sorted[Math.floor(sorted.length / 2)])
  const std = r2(Math.sqrt(filtered.reduce((a, b) => a + (b - mean) ** 2, 0) / filtered.length))
  const diff = r2((our_price - mean) / mean * 100)
  const absD = Math.abs(diff)

  // Fiyat farkı üst eşiği aşıyorsa büyük ihtimalle yanlış ürün eşleşmesi — yetersiz veri say
  if (diff > upperOutlierPct) {
    return {
      sku, product_name, category, brand, our_price,
      threshold_used: thresholdPercent,
      market_mean: mean, market_median: median, market_std: std,
      min_price: r2(Math.min(...prices)), max_price: r2(Math.max(...prices)),
      sources_count: sources.length, sources,
      price_diff_percent: diff,
      alert: 'insufficient_data',
      alert_reason: `Fiyat farkı %${diff.toFixed(0)} (eşik: %${upperOutlierPct}) — muhtemelen yanlış ürün eşleşmesi`,
      follow_up: ['manuel_kontrol', 'ürün_adını_güncelle'],
      confidence: 0.1,
      scraper_health: scraperHealth,
      technical_failure: false,
      notes: [
        searchNote,
        `Bizim fiyatımız (₺${our_price}) piyasa ortalamasının (₺${mean}) %${diff.toFixed(0)} üzerinde.`,
        `Bu oran %${upperOutlierPct} eşiğini aştığı için sonuçlar güvenilir sayılmıyor — eşleşen ürünler farklı olabilir.`,
      ],
    }
  }

  let alert: AnalysisResult['alert'] = 'no_alert'
  let alert_reason = 'Fiyat piyasa ortalamasında'
  let follow_up: string[] = []

  if (absD >= thresholdPercent) {
    if (diff > 0) {
      alert = 'above_market'
      alert_reason = `Piyasa ortalamasının %${absD.toFixed(1)} üzerinde (eşik: %${thresholdPercent})`
      follow_up = ['fiyat_indirimi_düşün', 'manuel_kontrol']
    } else {
      alert = 'below_market'
      alert_reason = `Piyasa ortalamasının %${absD.toFixed(1)} altında (eşik: %${thresholdPercent})`
      follow_up = ['fiyat_artışı_mümkün', 'manuel_kontrol']
    }
  }

  const confidence = r2(Math.min(0.95, 0.5 + filtered.length * 0.08))

  return {
    sku, product_name, category, brand, our_price,
    threshold_used: thresholdPercent,
    market_mean: mean, market_median: median, market_std: std,
    min_price: r2(Math.min(...prices)), max_price: r2(Math.max(...prices)),
    sources_count: sources.length, sources,
    price_diff_percent: diff,
    alert, alert_reason, follow_up,
    confidence,
    scraper_health: scraperHealth,
    technical_failure: false,
    notes: [
      searchNote,
      `${sources.length} fiyat kaynağı bulundu (${(options.activePlatforms ?? ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol']).join(', ')})`,
    ],
  }
}

export async function runAnalysis(
  products: ProductInput[],
  options: AnalysisOptions,
): Promise<AnalysisResult[]> {
  const BATCH = 5
  const results: AnalysisResult[] = []
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH)
    const batchResults = await Promise.all(
      batch.map(p => analyzeProduct(p, options))
    )
    results.push(...batchResults)
  }
  return results
}
