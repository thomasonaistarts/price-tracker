import type { ProductInput } from '@/lib/validations'
import { scrapeAllPlatforms, SUPPORTED_PLATFORMS, type ScrapedPrice, type ConfidenceThresholds, type PlatformScrapeHealth, DEFAULT_CONFIDENCE_THRESHOLDS } from '@/lib/scrapers'
import type { SourceDecisionRule } from '@/lib/source-decisions'
import { buildProductSearchQueries, searchStrategyNote, type ProductSearchStrategy } from '@/lib/product-identity'
import { platformsEligibleForFallback } from '@/lib/scrapers/fallback'
import { classifyAnalysisOutcome, type AnalysisOutcome } from '@/lib/analysis-outcome'
import { robustMarketStatistics } from '@/lib/market-statistics'

export type { ScrapedPrice }

export interface AnalysisSearchAttempt {
  strategy: ProductSearchStrategy
  query: string
  platforms: string[]
}

export interface AnalysisResult {
  sku: string
  barcode: string
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
  review_candidates: ScrapedPrice[]
  rejected_candidates: ScrapedPrice[]
  price_diff_percent: number | null
  alert: 'above_market' | 'below_market' | 'no_alert' | 'insufficient_data'
  alert_reason: string
  follow_up: string[]
  confidence: number
  notes: string[]
  scraper_health: PlatformScrapeHealth[]
  search_attempts: AnalysisSearchAttempt[]
  outcome: AnalysisOutcome
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
  discoveryTargetSources?: number
}

function r2(n: number) { return Math.round(n * 100) / 100 }

function sourcePrice(source: ScrapedPrice): number {
  return source.comparisonPrice ?? source.price
}

const HEALTH_STATUS_PRIORITY: Record<PlatformScrapeHealth['status'], number> = {
  success: 4,
  timeout: 3,
  error: 2,
  empty: 1,
}

function mergeScraperHealth(
  current: PlatformScrapeHealth[],
  next: PlatformScrapeHealth[],
): PlatformScrapeHealth[] {
  const byPlatform = new Map(current.map(item => [item.platform, item]))

  for (const item of next) {
    const existing = byPlatform.get(item.platform)
    if (!existing) {
      byPlatform.set(item.platform, item)
      continue
    }

    const preferred = HEALTH_STATUS_PRIORITY[item.status] > HEALTH_STATUS_PRIORITY[existing.status]
      ? item
      : existing

    byPlatform.set(item.platform, {
      ...preferred,
      resultCount: existing.resultCount + item.resultCount,
      matchedCount: (existing.matchedCount ?? 0) + (item.matchedCount ?? 0),
      acceptedCount: (existing.acceptedCount ?? 0) + (item.acceptedCount ?? 0),
      outOfStockCount: (existing.outOfStockCount ?? 0) + (item.outOfStockCount ?? 0),
      durationMs: existing.durationMs + item.durationMs,
      errorCode: preferred.status === 'success'
        ? undefined
        : preferred.errorCode ?? existing.errorCode ?? item.errorCode,
    })
  }

  return Array.from(byPlatform.values())
}

export async function analyzeProduct(
  product: ProductInput,
  options: AnalysisOptions,
): Promise<AnalysisResult> {
  const {
    sku,
    product_name,
    category = '',
    brand = '',
    manufacturer_code = '',
    product_type = '',
    our_price,
  } = product
  const barcode = product.barcode ?? ''
  const thresholdPercent = options.categoryThresholds?.[category] ?? options.thresholdPercent
  const minSources = options.minSources
  const upperOutlierPct = options.upperOutlierPct ?? 250
  const searches = buildProductSearchQueries({
    barcode,
    sku,
    productName: product_name,
    brand,
    manufacturerCode: manufacturer_code,
    productType: product_type,
  })

  // Barkoddan başlayıp yalnızca henüz sonuç bulunamayan platformlarda daha
  // geniş sorgulara geç. Böylece başarılı platform aynı analizde tekrar çağrılmaz.
  let scraperHealth: PlatformScrapeHealth[] = []
  let sources: ScrapedPrice[] = []
  let reviewCandidates: ScrapedPrice[] = []
  let rejectedCandidates: ScrapedPrice[] = []
  let remainingPlatforms = Array.from(new Set(options.activePlatforms ?? SUPPORTED_PLATFORMS))
  const attemptedStrategies: ProductSearchStrategy[] = []
  const searchAttempts: AnalysisSearchAttempt[] = []

  for (const search of searches) {
    if (remainingPlatforms.length === 0) break

    let attemptHealth: PlatformScrapeHealth[] = []
    let attemptReviewCandidates: ScrapedPrice[] = []
    let attemptRejectedCandidates: ScrapedPrice[] = []
    const attemptSources = await scrapeAllPlatforms(product_name, {
      thresholds: options.confidenceThresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS,
      activePlatforms: remainingPlatforms,
      searchQuery: search.query,
      expectedBarcode: barcode,
      lowerOutlierPct: options.lowerOutlierPct,
      sourceDecisions: options.sourceDecisions,
      onHealth: (health) => { attemptHealth = health },
      onReviewCandidates: (candidates) => { attemptReviewCandidates = candidates },
      onRejectedCandidates: (candidates) => { attemptRejectedCandidates = candidates },
    })

    attemptedStrategies.push(search.strategy)
    searchAttempts.push({
      strategy: search.strategy,
      query: search.query,
      platforms: attemptHealth
        .filter(item => item.attempted !== false)
        .map(item => item.platform),
    })
    sources.push(...attemptSources.map(source => ({
      ...source,
      searchStrategy: search.strategy,
      searchQuery: search.query,
    })))
    reviewCandidates.push(...attemptReviewCandidates.map(source => ({
      ...source,
      searchStrategy: search.strategy,
      searchQuery: search.query,
    })))
    rejectedCandidates.push(...attemptRejectedCandidates.map(source => ({
      ...source,
      searchStrategy: search.strategy,
      searchQuery: search.query,
    })))
    scraperHealth = mergeScraperHealth(scraperHealth, attemptHealth)

    const matchedPlatforms = new Set(sources.map(source => source.site))
    remainingPlatforms = platformsEligibleForFallback(
      remainingPlatforms,
      attemptHealth,
      matchedPlatforms,
    )
    if (matchedPlatforms.size >= (options.discoveryTargetSources ?? minSources)) break
  }

  const searchNotes = attemptedStrategies.map(searchStrategyNote)
  reviewCandidates = Array.from(
    new Map(
      reviewCandidates.map(candidate => [
        `${candidate.site.toLocaleLowerCase('tr-TR')}|${candidate.url}`,
        candidate,
      ]),
    ).values(),
  )
  rejectedCandidates = Array.from(
    new Map(
      rejectedCandidates.map(candidate => [
        `${candidate.site.toLocaleLowerCase('tr-TR')}|${candidate.url}`,
        candidate,
      ]),
    ).values(),
  ).slice(0, 10)

  const market = robustMarketStatistics(sources.map(sourcePrice))
  const acceptedPriceKeys = new Set(market.acceptedPrices.map(price => price.toFixed(2)))
  const acceptedSources = sources.filter(source => acceptedPriceKeys.has(r2(sourcePrice(source)).toFixed(2)))
  const prices = acceptedSources.map(sourcePrice).filter(price => price > 0)
  const outcomePolicy = classifyAnalysisOutcome({
    scraperHealth,
    rawMatchedSources: sources.length,
    acceptedSources: acceptedSources.length,
    minSources,
  })
  // Sadece fiyat analizi olarak saklanabilen sonuçlar son başarılı görünümü günceller.
  // Provider/timeout/no-match denemeleri analysis_attempts içinde kalır.
  const technicalFailure = !outcomePolicy.persistAnalysis

  if (acceptedSources.length < minSources) {
    return {
      sku, barcode, product_name, category, brand, our_price,
      threshold_used: thresholdPercent,
      market_mean: null, market_median: null, market_std: null,
      min_price: prices.length ? r2(Math.min(...prices)) : null,
      max_price: prices.length ? r2(Math.max(...prices)) : null,
      sources_count: acceptedSources.length, sources: acceptedSources,
      review_candidates: reviewCandidates,
      rejected_candidates: rejectedCandidates,
      price_diff_percent: null,
      alert: 'insufficient_data',
      alert_reason: sources.length === 0
        ? 'Rakip sitelerden fiyat bilgisi alınamadı'
        : `Yalnızca ${acceptedSources.length} güvenilir ve bağımsız kaynak bulundu (min: ${minSources})`,
      follow_up: ['manuel_kontrol', 'daha_fazla_kaynak'],
      confidence: 0.2,
      scraper_health: scraperHealth,
      search_attempts: searchAttempts,
      outcome: outcomePolicy.outcome,
      technical_failure: technicalFailure,
      notes: [
        ...searchNotes,
        ...(sources.length === 0 ? ['Scraper sonuç döndürmedi — ürün adını kontrol edin veya daha sonra tekrar deneyin'] : [`Filtreleme sonrası ${acceptedSources.length} bağımsız platform kaynağı kaldı`]),
      ],
    }
  }

  const mean = market.mean!
  const median = market.median!
  const reference = market.reference!
  const std = market.standardDeviation!
  const diff = r2((our_price - reference) / reference * 100)
  const absD = Math.abs(diff)

  // Fiyat farkı üst eşiği aşıyorsa büyük ihtimalle yanlış ürün eşleşmesi — yetersiz veri say
  if (diff > upperOutlierPct) {
    return {
      sku, barcode, product_name, category, brand, our_price,
      threshold_used: thresholdPercent,
      market_mean: mean, market_median: median, market_std: std,
      min_price: r2(Math.min(...prices)), max_price: r2(Math.max(...prices)),
      sources_count: acceptedSources.length, sources: acceptedSources,
      review_candidates: reviewCandidates,
      rejected_candidates: rejectedCandidates,
      price_diff_percent: diff,
      alert: 'insufficient_data',
      alert_reason: `Fiyat farkı %${diff.toFixed(0)} (eşik: %${upperOutlierPct}) — muhtemelen yanlış ürün eşleşmesi`,
      follow_up: ['manuel_kontrol', 'ürün_adını_güncelle'],
      confidence: 0.1,
      scraper_health: scraperHealth,
      search_attempts: searchAttempts,
      outcome: 'insufficient_sources',
      technical_failure: false,
      notes: [
        ...searchNotes,
        `Bizim fiyatımız (₺${our_price}) sağlam piyasa referansının (medyan ₺${reference}) %${diff.toFixed(0)} üzerinde.`,
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

  const confidence = r2(Math.min(0.95, 0.5 + acceptedSources.length * 0.08))

  return {
    sku, barcode, product_name, category, brand, our_price,
    threshold_used: thresholdPercent,
    market_mean: mean, market_median: median, market_std: std,
    min_price: r2(Math.min(...prices)), max_price: r2(Math.max(...prices)),
    sources_count: acceptedSources.length, sources: acceptedSources,
    review_candidates: reviewCandidates,
    rejected_candidates: rejectedCandidates,
    price_diff_percent: diff,
    alert, alert_reason, follow_up,
    confidence,
    scraper_health: scraperHealth,
    search_attempts: searchAttempts,
    outcome: outcomePolicy.outcome,
    technical_failure: false,
    notes: [
      ...searchNotes,
      `${acceptedSources.length} bağımsız platform kaynağı bulundu (${(options.activePlatforms ?? ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol']).join(', ')})`,
      `Piyasa referansı ${market.method === 'median_mad' ? 'MAD aykırı değer filtresi sonrası medyan' : 'medyan'} ile hesaplandı.`,
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
