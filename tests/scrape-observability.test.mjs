import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateScrapeUsage,
  withinScraperApiBudget,
} from '../lib/scrape-observability.ts'

test('scrape usage separates provider attempts, accepted sources and timeouts', () => {
  const usage = estimateScrapeUsage([
    { platform: 'N11', status: 'success', resultCount: 3, acceptedCount: 1, durationMs: 100 },
    { platform: 'Hepsiburada', status: 'timeout', resultCount: 0, acceptedCount: 0, durationMs: 40000 },
    { platform: 'Trendyol', status: 'success', resultCount: 2, acceptedCount: 1, durationMs: 20000 },
    { platform: 'PTTAvm', status: 'error', resultCount: 0, durationMs: 0, attempted: false },
  ])
  assert.deepEqual(usage, {
    scraperApiCredits: 12,
    apifyRuns: 1,
    attemptedPlatforms: 3,
    acceptedSources: 2,
    timeoutCount: 1,
    providerErrorCount: 0,
  })
})

test('daily provider budget fails closed', () => {
  assert.equal(withinScraperApiBudget({ consumedCredits: 900, estimatedNextCredits: 50, dailyLimit: 1000 }), true)
  assert.equal(withinScraperApiBudget({ consumedCredits: 980, estimatedNextCredits: 50, dailyLimit: 1000 }), false)
  assert.equal(withinScraperApiBudget({ consumedCredits: 0, estimatedNextCredits: 1, dailyLimit: 0 }), false)
})
