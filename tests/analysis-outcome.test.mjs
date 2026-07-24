import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAnalysisOutcome,
  isAnalysisRetryDue,
  retryCooldownHours,
} from '../lib/analysis-outcome.ts'

const health = (status, resultCount = 0) => ({
  platform: 'N11',
  status,
  resultCount,
  durationMs: 100,
})

test('analysis outcome separates timeout, provider failure and empty results', () => {
  assert.equal(classifyAnalysisOutcome({
    scraperHealth: [health('timeout')],
    rawMatchedSources: 0,
    acceptedSources: 0,
    minSources: 2,
  }).outcome, 'timeout')

  assert.equal(classifyAnalysisOutcome({
    scraperHealth: [health('error')],
    rawMatchedSources: 0,
    acceptedSources: 0,
    minSources: 2,
  }).outcome, 'provider_failure')

  assert.equal(classifyAnalysisOutcome({
    scraperHealth: [health('empty')],
    rawMatchedSources: 0,
    acceptedSources: 0,
    minSources: 2,
  }).outcome, 'no_results')

  assert.equal(classifyAnalysisOutcome({
    scraperHealth: [health('empty'), { ...health('timeout'), platform: 'Trendyol' }],
    rawMatchedSources: 0,
    acceptedSources: 0,
    minSources: 2,
  }).outcome, 'timeout')
})

test('analysis outcome distinguishes rejected matches and insufficient sources', () => {
  assert.equal(classifyAnalysisOutcome({
    scraperHealth: [health('success', 4)],
    rawMatchedSources: 0,
    acceptedSources: 0,
    minSources: 2,
  }).outcome, 'no_match')

  const insufficient = classifyAnalysisOutcome({
    scraperHealth: [health('success', 1)],
    rawMatchedSources: 1,
    acceptedSources: 1,
    minSources: 2,
  })
  assert.equal(insufficient.outcome, 'insufficient_sources')
  assert.equal(insufficient.persistAnalysis, true)
})

test('retry policy backs off identity failures longer than provider failures', () => {
  assert.equal(retryCooldownHours('timeout'), 6)
  assert.equal(retryCooldownHours('provider_failure'), 6)
  assert.equal(retryCooldownHours('no_match'), 168)
})

test('retry due calculation respects the per-outcome cooldown', () => {
  const now = Date.parse('2026-07-24T12:00:00.000Z')
  assert.equal(isAnalysisRetryDue({
    lastAttemptedAt: '2026-07-24T05:00:00.000Z',
    lastOutcome: 'timeout',
    nowMs: now,
  }), true)
  assert.equal(isAnalysisRetryDue({
    lastAttemptedAt: '2026-07-20T12:00:00.000Z',
    lastOutcome: 'no_match',
    nowMs: now,
  }), false)
})
