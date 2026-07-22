import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizePlatformHealth } from '../lib/platform-health.ts'

test('platform health separates success, empty and quota exhaustion', () => {
  const summaries = summarizePlatformHealth([
    {
      attempted_at: '2026-07-22T10:00:00.000Z',
      scraper_health: [
        { platform: 'Hepsiburada', status: 'success', resultCount: 4, durationMs: 1200 },
        { platform: 'N11', status: 'empty', resultCount: 0, durationMs: 900 },
        { platform: 'PTTAvm', status: 'error', resultCount: 0, durationMs: 300, errorCode: 'quota_exhausted' },
      ],
    },
  ])

  assert.equal(summaries.find(item => item.platform === 'Hepsiburada')?.state, 'healthy')
  assert.equal(summaries.find(item => item.platform === 'N11')?.state, 'warning')
  assert.equal(summaries.find(item => item.platform === 'PTTAvm')?.state, 'quota_exhausted')
  assert.equal(summaries.find(item => item.platform === 'Trendyol')?.state, 'no_data')
})
