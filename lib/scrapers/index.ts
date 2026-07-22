import { scrapeHepsiburada } from './hepsiburada'
import { scrapeN11 } from './n11'
import { scrapePttavm } from './pttavm'
import { scrapeIdefix } from './idefix'
import { scrapeTrendyol } from './trendyol'
import { matchProduct, calcUnitPrice, type ConfidenceThresholds, DEFAULT_CONFIDENCE_THRESHOLDS } from './similarity'
import type { ScrapedPrice } from './types'
import { ScraperProxyError, type ScraperProxyErrorCode } from './proxy'
import { sourceDecisionKey, type SourceDecisionRule } from '@/lib/source-decisions'

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
}

export interface PlatformScrapeHealth {
  platform: SupportedPlatform
  status: 'success' | 'empty' | 'timeout' | 'error'
  resultCount: number
  durationMs: number
  errorCode?: ScraperProxyErrorCode
}

// Platform başına timeout — render gerektiren Hepsiburada daha uzun
const TIMEOUT = {
  hepsiburada: 40_000,  // 7s iç API denemesi + gerekirse render
  n11:         12_000,
  pttavm:      12_000,
  idefix:      12_000,
  trendyol:    60_000,  // Apify actor soğuk başlangıçta 35 saniyeyi aşabiliyor
}

class ScraperTimeoutError extends Error {}

async function runScraper(
  platform: SupportedPlatform,
  scraper: () => Promise<ScrapedPrice[]>,
  timeoutMs: number,
): Promise<{ items: ScrapedPrice[]; health: PlatformScrapeHealth }> {
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const items = await Promise.race([
      scraper(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ScraperTimeoutError()), timeoutMs)
      }),
    ])
    return {
      items,
      health: {
        platform,
        status: items.length > 0 ? 'success' : 'empty',
        resultCount: items.length,
        durationMs: Date.now() - startedAt,
      },
    }
  } catch (error) {
    return {
      items: [],
      health: {
        platform,
        status: error instanceof ScraperTimeoutError ? 'timeout' : 'error',
        resultCount: 0,
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof ScraperProxyError ? error.code : undefined,
      },
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export { type ConfidenceThresholds, DEFAULT_CONFIDENCE_THRESHOLDS }

export async function scrapeAllPlatforms(
  query: string,
  options: ScrapeOptions = {},
): Promise<ScrapedPrice[]> {
  const thresholds = options.thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS
  const searchQuery = options.searchQuery?.trim() || query
  const active = new Set(options.activePlatforms ?? SUPPORTED_PLATFORMS)
  const jobs: Promise<{ items: ScrapedPrice[]; health: PlatformScrapeHealth }>[] = []
  if (active.has('Hepsiburada')) jobs.push(runScraper('Hepsiburada', () => scrapeHepsiburada(searchQuery), TIMEOUT.hepsiburada))
  if (active.has('N11')) jobs.push(runScraper('N11', () => scrapeN11(searchQuery), TIMEOUT.n11))
  if (active.has('PTTAvm')) jobs.push(runScraper('PTTAvm', () => scrapePttavm(searchQuery), TIMEOUT.pttavm))
  if (active.has('İdefix')) jobs.push(runScraper('İdefix', () => scrapeIdefix(searchQuery), TIMEOUT.idefix))
  if (active.has('Trendyol')) jobs.push(runScraper('Trendyol', () => scrapeTrendyol(searchQuery), TIMEOUT.trendyol))

  const platformResults = await Promise.all(jobs)
  options.onHealth?.(platformResults.map((result) => result.health))

  const all = platformResults.flatMap((result) => result.items)

  const results: ScrapedPrice[] = []
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

    // Otomatik eşleştirici reddettiyse yalnızca manuel onay bu kararı geçersiz kılabilir.
    if (!manuallyApproved && mr.confidence === 'rejected') continue

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

    results.push(enriched)
  }

  // Her site × güven seviyesi için sadece en ucuz ürünü tut
  const deduped = cheapestPerSiteAndConfidence(results)

  // Piyasa medyanının %50'sinin altındaki fiyatları at (yanlış ürün eşleşmesi temizliği)
  return filterPriceOutliers(deduped, options.lowerOutlierPct ?? 50)
}

/**
 * Piyasa medyanının %50'sinden düşük fiyatları eler.
 * Örnek: medyan ₺12.000 ise → ₺6.000 altı fiyatlar atılır.
 * Çok az sonuç varsa (<3) filtreleme uygulanmaz.
 */
function filterPriceOutliers(items: ScrapedPrice[], lowerOutlierPct: number): ScrapedPrice[] {
  if (items.length < 3) return items
  const sorted = [...items].map(i => i.comparisonPrice ?? i.price).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const floor = median * Math.min(100, Math.max(1, lowerOutlierPct)) / 100
  return items.filter(i => i.manualDecision === 'approved' || (i.comparisonPrice ?? i.price) >= floor)
}

/**
 * site + confidence kombinasyonu başına en düşük fiyatlı ürünü döndürür.
 * Örnek: N11'de 3 HIGH sonuç varsa → en ucuz 1 tanesi kalır.
 */
function cheapestPerSiteAndConfidence(items: ScrapedPrice[]): ScrapedPrice[] {
  const map = new Map<string, ScrapedPrice>()
  for (const item of items) {
    const key = item.manualDecision === 'approved'
      ? `${item.site}|approved|${item.url}`
      : `${item.site}|${item.confidence ?? 'high'}`
    const existing = map.get(key)
    if (!existing || item.price < existing.price) {
      map.set(key, item)
    }
  }
  return Array.from(map.values())
}
