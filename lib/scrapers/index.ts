import { scrapeHepsiburada } from './hepsiburada.ts'
import { scrapeN11 } from './n11.ts'
import { scrapePttavm } from './pttavm.ts'
import { scrapeIdefix } from './idefix.ts'
import { scrapeTrendyol } from './trendyol.ts'
import {
  matchProduct,
  calcUnitPrice,
  isAutomaticMatchEligible,
  type ConfidenceThresholds,
  DEFAULT_CONFIDENCE_THRESHOLDS,
} from './similarity.ts'
import type { ScrapedPrice } from './types.ts'
import { ScraperProxyError, type ScraperProxyErrorCode } from './proxy.ts'
import { sourceDecisionKey, type SourceDecisionRule } from '../source-decisions.ts'
import { filterLowPriceOutliers, selectBestOfferPerPlatform } from './selection.ts'
import { runAbortable, runInNamedQueue, runSequentialUntil } from './execution.ts'
import { scrapeVerifiedProductUrl } from './direct.ts'

export type { ScrapedPrice }

export const SUPPORTED_PLATFORMS = ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol'] as const
export type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number]

export interface ScrapeOptions {
  thresholds?: ConfidenceThresholds
  activePlatforms?: string[]
  searchQuery?: string
  lowerOutlierPct?: number
  sourceDecisions?: SourceDecisionRule[]
  onHealth?: (health: PlatformScrapeHealth[]) => void
  onReviewCandidates?: (candidates: ScrapedPrice[]) => void
}

export interface PlatformScrapeHealth {
  platform: SupportedPlatform
  status: 'success' | 'empty' | 'timeout' | 'error'
  resultCount: number
  matchedCount?: number
  acceptedCount?: number
  outOfStockCount?: number
  durationMs: number
  errorCode?: ScraperProxyErrorCode
  attempted?: boolean
}

// Platform başına timeout — render gerektiren Hepsiburada daha uzun
const TIMEOUT = {
  hepsiburada: 40_000,  // 7s iç API denemesi + gerekirse render
  n11:         12_000,
  pttavm:      12_000,
  idefix:      12_000,
  trendyol:    60_000,  // Apify actor soğuk başlangıçta 35 saniyeyi aşabiliyor
}

export async function runScraper(
  platform: SupportedPlatform,
  scraper: (signal: AbortSignal) => Promise<ScrapedPrice[]>,
  timeoutMs: number,
): Promise<{ items: ScrapedPrice[]; health: PlatformScrapeHealth }> {
  const execution = await runAbortable(scraper, timeoutMs)

  if (execution.outcome === 'success') {
    const items = execution.value
    return {
      items,
      health: {
        platform,
        status: items.length > 0 ? 'success' : 'empty',
        resultCount: items.length,
        durationMs: execution.durationMs,
      },
    }
  }

  const error = execution.error
  return {
    items: [],
      health: {
        platform,
        status: execution.outcome === 'timeout'
          || (error instanceof ScraperProxyError && error.code === 'provider_timeout')
          ? 'timeout'
          : 'error',
      resultCount: 0,
      durationMs: execution.durationMs,
      errorCode: error instanceof ScraperProxyError ? error.code : undefined,
    },
  }
}

interface ScraperJob {
  platform: SupportedPlatform
  run: () => Promise<{ items: ScrapedPrice[]; health: PlatformScrapeHealth }>
}

const SCRAPER_API_QUOTA_COOLDOWN_MS = 5 * 60 * 1000
let scraperApiQuotaBlockedUntil = 0

function skippedForOpenQuotaCircuit(
  jobs: ScraperJob[],
): { items: ScrapedPrice[]; health: PlatformScrapeHealth }[] {
  return jobs.map(job => ({
    items: [],
    health: {
      platform: job.platform,
      status: 'error',
      resultCount: 0,
      durationMs: 0,
      errorCode: 'quota_exhausted',
      attempted: false,
    },
  }))
}

export async function runScraperApiJobsSequentially(
  jobs: ScraperJob[],
): Promise<{ items: ScrapedPrice[]; health: PlatformScrapeHealth }[]> {
  return runInNamedQueue('scraperapi', async () => {
    if (Date.now() < scraperApiQuotaBlockedUntil) {
      return skippedForOpenQuotaCircuit(jobs)
    }

    // ScraperAPI aynı hesabı dört pazaryeri için kullanıyor. Kota bittiğinde
    // kalan sitelere istek atmak sonucu değiştirmez, yalnızca süre ve yük üretir.
    const attemptedResults = await runSequentialUntil(
      jobs.map(job => job.run),
      result => result.health.errorCode === 'quota_exhausted',
    )
    const quotaExhausted = attemptedResults.some(
      result => result.health.errorCode === 'quota_exhausted'
    )

    if (!quotaExhausted) return attemptedResults

    scraperApiQuotaBlockedUntil = Date.now() + SCRAPER_API_QUOTA_COOLDOWN_MS
    return [
      ...attemptedResults,
      ...skippedForOpenQuotaCircuit(jobs.slice(attemptedResults.length)),
    ]
  })
}

export async function runApifyJob<T>(job: () => Promise<T>): Promise<T> {
  return runInNamedQueue('apify', job)
}

export { type ConfidenceThresholds, DEFAULT_CONFIDENCE_THRESHOLDS }

export async function scrapeAllPlatforms(
  query: string,
  options: ScrapeOptions = {},
): Promise<ScrapedPrice[]> {
  const thresholds = options.thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS
  const searchQuery = options.searchQuery?.trim() || query
  const active = new Set(options.activePlatforms ?? SUPPORTED_PLATFORMS)
  const verifiedUrlByPlatform = new Map(
    (options.sourceDecisions ?? [])
      .filter(decision => decision.decision === 'approved')
      .map(decision => [decision.platform, decision.source_url]),
  )
  const withVerifiedFallback = (
    platform: SupportedPlatform,
    discovery: (signal: AbortSignal) => Promise<ScrapedPrice[]>,
  ) => async (signal: AbortSignal) => {
    const verifiedUrl = verifiedUrlByPlatform.get(platform)
    if (verifiedUrl && platform !== 'Trendyol') {
      const direct = await scrapeVerifiedProductUrl(platform, verifiedUrl, signal)
      if (direct.length > 0) return direct
    }
    return discovery(signal)
  }
  const scraperApiJobs: ScraperJob[] = []
  // Canary ölçümlerinde İdefix/PTTAvm daha hızlı ve daha verimli sonuç verdi.
  // Yavaş render isteyen Hepsiburada en sona bırakılır; çağrılar yine sıralıdır.
  if (active.has('İdefix')) scraperApiJobs.push(
    {
      platform: 'İdefix',
      run: () => runScraper('İdefix', withVerifiedFallback('İdefix', signal => scrapeIdefix(searchQuery, signal)), TIMEOUT.idefix),
    }
  )
  if (active.has('PTTAvm')) scraperApiJobs.push(
    {
      platform: 'PTTAvm',
      run: () => runScraper('PTTAvm', withVerifiedFallback('PTTAvm', signal => scrapePttavm(searchQuery, signal)), TIMEOUT.pttavm),
    }
  )
  if (active.has('N11')) scraperApiJobs.push(
    {
      platform: 'N11',
      run: () => runScraper('N11', withVerifiedFallback('N11', signal => scrapeN11(searchQuery, signal)), TIMEOUT.n11),
    }
  )
  if (active.has('Hepsiburada')) scraperApiJobs.push(
    {
      platform: 'Hepsiburada',
      run: () => runScraper('Hepsiburada', withVerifiedFallback('Hepsiburada', signal => scrapeHepsiburada(searchQuery, signal)), TIMEOUT.hepsiburada),
    }
  )

  // ScraperAPI çağrıları kendi içinde sırayla çalışır. Ayrı sağlayıcı olan
  // Trendyol/Apify bu kuyrukla eş zamanlı ilerleyebilir.
  const scraperApiPromise = runScraperApiJobsSequentially(scraperApiJobs)
  const trendyolPromise = active.has('Trendyol')
    ? runApifyJob(() =>
        runScraper('Trendyol', signal => scrapeTrendyol(searchQuery, signal), TIMEOUT.trendyol)
      )
    : null

  const [scraperApiResults, trendyolResult] = await Promise.all([
    scraperApiPromise,
    trendyolPromise,
  ])
  const platformResults = trendyolResult
    ? [...scraperApiResults, trendyolResult]
    : scraperApiResults
  const all = platformResults.flatMap((result) => result.items)

  const results: ScrapedPrice[] = []
  const reviewResults: ScrapedPrice[] = []
  const decisionMap = new Map(
    (options.sourceDecisions ?? []).map((decision) => [
      sourceDecisionKey(decision.platform, decision.source_url),
      decision.decision,
    ]),
  )

  for (const item of all) {
    const decision = decisionMap.get(sourceDecisionKey(item.site, item.url))
    if (decision === 'rejected') continue

    const mr = matchProduct(query, item.product_name, thresholds)
    const manuallyApproved = decision === 'approved'

    const automaticConfidence = mr.confidence === 'rejected' ? 'low' : mr.confidence
    const enriched: ScrapedPrice = {
      ...item,
      confidence: manuallyApproved ? 'exact' : automaticConfidence,
      matchScore: manuallyApproved ? 1 : mr.score,
      matchReasons: manuallyApproved ? ['Kullanıcı tarafından onaylandı'] : mr.reasons,
      manualDecision: manuallyApproved ? 'approved' : undefined,
    }

    // Miktar oranı varsa → birim fiyat hesapla (ekran boyutu için birim fiyat hesaplanmaz)
    if (
      mr.candidateBaseQty &&
      mr.candidateBaseQty > 0 &&
      mr.unitType &&
      mr.unitType !== 'screen' &&
      mr.quantityRatio !== null
    ) {
      enriched.quantityRatio = mr.quantityRatio
      if (mr.quantityRatio !== 1) {
        // Farklı miktarlar → birim fiyat göster
        const { unitPrice, label } = calcUnitPrice(item.price, mr.candidateBaseQty, mr.unitType as 'weight' | 'volume' | 'count' | 'length')
        enriched.unitPrice = unitPrice
        enriched.unitPriceLabel = label
        enriched.comparisonPrice = Math.round((item.price / mr.quantityRatio) * 100) / 100
      }
    }

    // Düşük güvenli adaylar piyasa hesabına hiçbir zaman girmez. Yine de kullanıcı
    // doğru ürünü elle onaylayabilsin diye ayrı bir inceleme listesinde tutulur.
    if (!manuallyApproved && !isAutomaticMatchEligible(mr.confidence)) {
      if (mr.confidence === 'low') reviewResults.push(enriched)
      continue
    }

    results.push(enriched)
  }

  // Her pazaryerinden yalnızca en güvenilir ve stokta olan teklifi tut.
  const selected = selectBestOfferPerPlatform(results)
  const reviewCandidates = selectBestOfferPerPlatform(reviewResults)
  options.onReviewCandidates?.(reviewCandidates)

  // Şüpheli derecede düşük fiyatları platform seçimi sonrasında temizle.
  const accepted = filterLowPriceOutliers(selected, options.lowerOutlierPct ?? 50)
  const matchedByPlatform = new Map<string, number>()
  const acceptedByPlatform = new Map<string, number>()
  const outOfStockByPlatform = new Map<string, number>()
  for (const item of [...results, ...reviewCandidates]) {
    matchedByPlatform.set(item.site, (matchedByPlatform.get(item.site) ?? 0) + 1)
    if (item.inStock === false) {
      outOfStockByPlatform.set(item.site, (outOfStockByPlatform.get(item.site) ?? 0) + 1)
    }
  }
  for (const item of accepted) {
    acceptedByPlatform.set(item.site, (acceptedByPlatform.get(item.site) ?? 0) + 1)
  }
  options.onHealth?.(platformResults.map(({ health }) => ({
    ...health,
    matchedCount: matchedByPlatform.get(health.platform) ?? 0,
    acceptedCount: acceptedByPlatform.get(health.platform) ?? 0,
    outOfStockCount: outOfStockByPlatform.get(health.platform) ?? 0,
  })))
  return accepted
}
