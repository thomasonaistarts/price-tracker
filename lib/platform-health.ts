import type { PlatformScrapeHealth } from '@/lib/scrapers'

export const HEALTH_PLATFORMS = ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol'] as const

export interface AnalysisHealthRow {
  attempted_at: string
  scraper_health: unknown
}

export interface PlatformHealthSummary {
  platform: typeof HEALTH_PLATFORMS[number]
  state: 'healthy' | 'warning' | 'unhealthy' | 'quota_exhausted' | 'no_data'
  samples: number
  successes: number
  empty: number
  timeouts: number
  errors: number
  quotaErrors: number
  resultCount: number
  averageDurationMs: number
  lastSeenAt: string | null
}

export function summarizePlatformHealth(rows: AnalysisHealthRow[]): PlatformHealthSummary[] {
  const summaries = new Map(HEALTH_PLATFORMS.map(platform => [platform, {
    platform,
    state: 'no_data' as PlatformHealthSummary['state'],
    samples: 0,
    successes: 0,
    empty: 0,
    timeouts: 0,
    errors: 0,
    quotaErrors: 0,
    resultCount: 0,
    averageDurationMs: 0,
    lastSeenAt: null as string | null,
    totalDurationMs: 0,
  }]))

  for (const row of rows) {
    if (!Array.isArray(row.scraper_health)) continue

    for (const rawHealth of row.scraper_health) {
      const health = rawHealth as Partial<PlatformScrapeHealth>
      if (!HEALTH_PLATFORMS.includes(health.platform as typeof HEALTH_PLATFORMS[number])) continue

      const summary = summaries.get(health.platform as typeof HEALTH_PLATFORMS[number])!
      summary.samples += 1
      summary.resultCount += Number(health.resultCount) || 0
      summary.totalDurationMs += Number(health.durationMs) || 0
      if (health.status === 'success') summary.successes += 1
      else if (health.status === 'empty') summary.empty += 1
      else if (health.status === 'timeout') summary.timeouts += 1
      else if (health.status === 'error') summary.errors += 1
      if (health.errorCode === 'quota_exhausted') summary.quotaErrors += 1

      if (!summary.lastSeenAt || new Date(row.attempted_at) > new Date(summary.lastSeenAt)) {
        summary.lastSeenAt = row.attempted_at
      }
    }
  }

  return Array.from(summaries.values()).map(({ totalDurationMs, ...summary }) => {
    const hardFailures = summary.timeouts + summary.errors
    const state: PlatformHealthSummary['state'] = summary.samples === 0
      ? 'no_data'
      : summary.quotaErrors > 0
        ? 'quota_exhausted'
        : summary.successes > 0 && hardFailures / summary.samples <= 0.2
        ? 'healthy'
        : summary.successes > 0 || summary.empty > 0
          ? 'warning'
          : 'unhealthy'

    return {
      ...summary,
      state,
      averageDurationMs: summary.samples ? Math.round(totalDurationMs / summary.samples) : 0,
    }
  })
}
