import type { AnalysisResult } from '@/lib/analyzer'

export type DiscoveryPlatformOutcome =
  | 'accepted'
  | 'review_only'
  | 'no_results'
  | 'identity_rejected'
  | 'out_of_stock'
  | 'filtered'
  | 'timeout'
  | 'provider_error'
  | 'not_attempted'

export interface ProductDiscoverySummary {
  found: boolean
  pricingReady: boolean
  candidateOnly: boolean
  acceptedSourceCount: number
  reviewCandidateCount: number
  acceptedPlatforms: string[]
  successfulStrategies: string[]
  platformOutcomes: Array<{
    platform: string
    outcome: DiscoveryPlatformOutcome
    rawCandidates: number
    matchedCandidates: number
    acceptedCandidates: number
    durationMs: number
    errorCode?: string
  }>
}

export interface DiscoveryRunForAggregate {
  status: 'success' | 'error'
  data?: {
    elapsed_seconds: number
    estimated_provider_calls: number
    discovery: ProductDiscoverySummary
  }
}

export interface DiscoveryCandidate {
  id: string
  category?: string | null
  barcode?: string | null
}

/**
 * Adayları alfabetik listenin ilk 20 kaydından seçmek yerine kategoriler
 * arasında dönüşümlü seçer. Her kategori içinde barkodlu/barkodsuz ürünleri
 * dönüşümlü alarak fallback yolunun da benchmarka girmesini sağlar.
 */
export function selectBalancedDiscoveryCandidates<T extends DiscoveryCandidate>(
  candidates: T[],
  limit = 20,
): T[] {
  if (limit <= 0) return []

  const buckets = new Map<string, T[]>()
  for (const candidate of candidates) {
    const category = candidate.category?.trim() || 'Kategorisiz'
    const bucket = buckets.get(category) ?? []
    bucket.push(candidate)
    buckets.set(category, bucket)
  }

  buckets.forEach((bucket, category) => {
    const withBarcode = bucket.filter((candidate: T) => Boolean(candidate.barcode))
    const withoutBarcode = bucket.filter((candidate: T) => !candidate.barcode)
    const interleaved: T[] = []
    while (withBarcode.length > 0 || withoutBarcode.length > 0) {
      const nextWithBarcode = withBarcode.shift()
      if (nextWithBarcode) interleaved.push(nextWithBarcode)
      const nextWithoutBarcode = withoutBarcode.shift()
      if (nextWithoutBarcode) interleaved.push(nextWithoutBarcode)
    }
    buckets.set(category, interleaved)
  })

  const selected: T[] = []
  const categories = Array.from(buckets.keys()).sort((left, right) =>
    left.localeCompare(right, 'tr-TR'),
  )
  while (selected.length < Math.min(limit, candidates.length)) {
    let added = false
    for (const category of categories) {
      const candidate = buckets.get(category)?.shift()
      if (!candidate) continue
      selected.push(candidate)
      added = true
      if (selected.length >= limit) break
    }
    if (!added) break
  }

  return selected
}

function platformOutcome(
  health: AnalysisResult['scraper_health'][number],
  acceptedPlatforms: Set<string>,
  reviewPlatforms: Set<string>,
): DiscoveryPlatformOutcome {
  if (acceptedPlatforms.has(health.platform)) return 'accepted'
  if (reviewPlatforms.has(health.platform)) return 'review_only'
  if (health.attempted === false) return 'not_attempted'
  if (health.status === 'timeout') return 'timeout'
  if (health.status === 'error') return 'provider_error'
  if (health.resultCount === 0) return 'no_results'
  if ((health.matchedCount ?? 0) === 0) return 'identity_rejected'
  if (
    (health.acceptedCount ?? 0) === 0
    && (health.outOfStockCount ?? 0) > 0
  ) return 'out_of_stock'
  return 'filtered'
}

export function summarizeProductDiscovery(
  result: AnalysisResult,
  minimumSources: number,
): ProductDiscoverySummary {
  const acceptedPlatforms = new Set(result.sources.map(source => source.site))
  const reviewPlatforms = new Set(result.review_candidates.map(source => source.site))
  const successfulStrategies = Array.from(new Set(
    result.sources
      .map(source => source.searchStrategy)
      .filter((value): value is string => Boolean(value)),
  ))

  return {
    found: result.sources.length > 0,
    pricingReady: result.sources.length >= minimumSources,
    candidateOnly: result.sources.length === 0 && result.review_candidates.length > 0,
    acceptedSourceCount: result.sources.length,
    reviewCandidateCount: result.review_candidates.length,
    acceptedPlatforms: Array.from(acceptedPlatforms),
    successfulStrategies,
    platformOutcomes: result.scraper_health.map(health => ({
      platform: health.platform,
      outcome: platformOutcome(health, acceptedPlatforms, reviewPlatforms),
      rawCandidates: health.resultCount,
      matchedCandidates: health.matchedCount ?? 0,
      acceptedCandidates: health.acceptedCount ?? 0,
      durationMs: health.durationMs,
      errorCode: health.errorCode,
    })),
  }
}

export function aggregateDiscoveryBenchmark(runs: DiscoveryRunForAggregate[]) {
  const completed = runs.filter(
    (run): run is DiscoveryRunForAggregate & { data: NonNullable<DiscoveryRunForAggregate['data']> } =>
      run.status === 'success' && Boolean(run.data),
  )
  const discovered = completed.filter(run => run.data.discovery.found).length
  const pricingReady = completed.filter(run => run.data.discovery.pricingReady).length
  const candidateOnly = completed.filter(run => run.data.discovery.candidateOnly).length
  const platformAccepted = new Map<string, number>()
  const strategyAccepted = new Map<string, number>()

  for (const run of completed) {
    for (const platform of run.data.discovery.acceptedPlatforms) {
      platformAccepted.set(platform, (platformAccepted.get(platform) ?? 0) + 1)
    }
    for (const strategy of run.data.discovery.successfulStrategies) {
      strategyAccepted.set(strategy, (strategyAccepted.get(strategy) ?? 0) + 1)
    }
  }

  const sum = (selector: (run: typeof completed[number]) => number) =>
    completed.reduce((total, run) => total + selector(run), 0)

  return {
    selected: runs.length,
    completed: completed.length,
    errors: runs.filter(run => run.status === 'error').length,
    discovered,
    discoveryRate: completed.length > 0 ? discovered / completed.length : 0,
    pricingReady,
    pricingReadyRate: completed.length > 0 ? pricingReady / completed.length : 0,
    candidateOnly,
    notFound: completed.length - discovered,
    averageElapsedSeconds: completed.length > 0
      ? sum(run => run.data.elapsed_seconds) / completed.length
      : 0,
    totalEstimatedProviderCalls: sum(run => run.data.estimated_provider_calls),
    platformAccepted: Object.fromEntries(platformAccepted),
    strategyAccepted: Object.fromEntries(strategyAccepted),
  }
}
