import type { PlatformScrapeHealth } from '@/lib/scrapers'

export type AnalysisOutcome =
  | 'success'
  | 'insufficient_sources'
  | 'no_match'
  | 'no_results'
  | 'timeout'
  | 'provider_failure'
  | 'parser_failure'

export interface AnalysisOutcomeInput {
  scraperHealth: PlatformScrapeHealth[]
  rawMatchedSources: number
  acceptedSources: number
  minSources: number
}

export interface AnalysisOutcomePolicy {
  outcome: AnalysisOutcome
  successful: boolean
  persistAnalysis: boolean
  retryAfterHours: number | null
  failureReason: string | null
}

const POLICY: Record<AnalysisOutcome, Omit<AnalysisOutcomePolicy, 'outcome'>> = {
  success: {
    successful: true,
    persistAnalysis: true,
    retryAfterHours: null,
    failureReason: null,
  },
  insufficient_sources: {
    successful: true,
    persistAnalysis: true,
    retryAfterHours: 24,
    failureReason: 'insufficient_sources',
  },
  no_match: {
    successful: false,
    persistAnalysis: false,
    retryAfterHours: 7 * 24,
    failureReason: 'no_match',
  },
  no_results: {
    successful: false,
    persistAnalysis: false,
    retryAfterHours: 24,
    failureReason: 'no_results',
  },
  timeout: {
    successful: false,
    persistAnalysis: false,
    retryAfterHours: 6,
    failureReason: 'timeout',
  },
  provider_failure: {
    successful: false,
    persistAnalysis: false,
    retryAfterHours: 6,
    failureReason: 'provider_failure',
  },
  parser_failure: {
    successful: false,
    persistAnalysis: false,
    retryAfterHours: 12,
    failureReason: 'parser_failure',
  },
}

export function classifyAnalysisOutcome(input: AnalysisOutcomeInput): AnalysisOutcomePolicy {
  const attempted = input.scraperHealth.filter(item => item.attempted !== false)
  const rawResultCount = attempted.reduce((sum, item) => sum + Math.max(0, item.resultCount), 0)
  const timeoutCount = attempted.filter(item => item.status === 'timeout').length
  const errorCount = attempted.filter(item => item.status === 'error').length
  let outcome: AnalysisOutcome
  if (input.acceptedSources >= input.minSources) {
    outcome = 'success'
  } else if (input.rawMatchedSources > 0) {
    outcome = 'insufficient_sources'
  } else if (rawResultCount > 0) {
    outcome = 'no_match'
  } else if (errorCount > 0) {
    outcome = 'provider_failure'
  } else if (timeoutCount > 0) {
    outcome = 'timeout'
  } else if (
    attempted.some(item => item.status === 'success' && item.resultCount === 0)
  ) {
    outcome = 'parser_failure'
  } else {
    outcome = 'no_results'
  }

  return { outcome, ...POLICY[outcome] }
}

export function retryCooldownHours(outcome: AnalysisOutcome | null | undefined): number {
  if (!outcome) return 6
  return POLICY[outcome].retryAfterHours ?? 15 * 24
}

export function isAnalysisRetryDue(input: {
  lastAttemptedAt: string | null | undefined
  lastOutcome: AnalysisOutcome | null | undefined
  nowMs?: number
}): boolean {
  if (!input.lastAttemptedAt) return true
  const attemptedMs = new Date(input.lastAttemptedAt).getTime()
  if (!Number.isFinite(attemptedMs)) return true
  const cooldownMs = retryCooldownHours(input.lastOutcome) * 60 * 60 * 1000
  return (input.nowMs ?? Date.now()) - attemptedMs >= cooldownMs
}
