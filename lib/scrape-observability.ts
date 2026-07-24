import type { PlatformScrapeHealth } from './scrapers/index.ts'

export interface ScrapeUsageEstimate {
  scraperApiCredits: number
  apifyRuns: number
  attemptedPlatforms: number
  acceptedSources: number
  timeoutCount: number
  providerErrorCount: number
}

const SCRAPER_API_CREDIT_ESTIMATE: Record<string, number> = {
  Hepsiburada: 11,
  N11: 1,
  PTTAvm: 1,
  'İdefix': 1,
}

export function estimateScrapeUsage(
  health: PlatformScrapeHealth[],
): ScrapeUsageEstimate {
  const attempted = health.filter(item => item.attempted !== false)
  return {
    scraperApiCredits: attempted.reduce(
      (sum, item) => sum + (SCRAPER_API_CREDIT_ESTIMATE[item.platform] ?? 0),
      0,
    ),
    apifyRuns: attempted.filter(item => item.platform === 'Trendyol').length,
    attemptedPlatforms: attempted.length,
    acceptedSources: attempted.reduce((sum, item) => sum + (item.acceptedCount ?? 0), 0),
    timeoutCount: attempted.filter(item => item.status === 'timeout').length,
    providerErrorCount: attempted.filter(item => item.status === 'error').length,
  }
}

export function withinScraperApiBudget(input: {
  consumedCredits: number
  estimatedNextCredits: number
  dailyLimit: number
}) {
  if (input.dailyLimit <= 0) return false
  return input.consumedCredits + input.estimatedNextCredits <= input.dailyLimit
}
