import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateDiscoveryBenchmark,
  selectBalancedDiscoveryCandidates,
  summarizeProductDiscovery,
} from '../lib/product-discovery-benchmark.ts'

function result(overrides = {}) {
  return {
    sources: [],
    review_candidates: [],
    scraper_health: [],
    ...overrides,
  }
}

test('discovery summary separates found products from pricing readiness', () => {
  const summary = summarizeProductDiscovery(result({
    sources: [{
      site: 'N11',
      searchStrategy: 'barcode',
    }],
    scraper_health: [{
      platform: 'N11',
      status: 'success',
      resultCount: 2,
      matchedCount: 1,
      acceptedCount: 1,
      durationMs: 200,
    }],
  }), 2)

  assert.equal(summary.found, true)
  assert.equal(summary.pricingReady, false)
  assert.deepEqual(summary.acceptedPlatforms, ['N11'])
  assert.deepEqual(summary.successfulStrategies, ['barcode'])
  assert.equal(summary.platformOutcomes[0].outcome, 'accepted')
})

test('platform diagnostics explain candidates rejected by identity', () => {
  const summary = summarizeProductDiscovery(result({
    scraper_health: [{
      platform: 'PTTAvm',
      status: 'success',
      resultCount: 8,
      matchedCount: 0,
      acceptedCount: 0,
      durationMs: 300,
    }],
  }), 2)

  assert.equal(summary.found, false)
  assert.equal(summary.platformOutcomes[0].outcome, 'identity_rejected')
})

test('aggregate reports an honest denominator and product discovery rate', () => {
  const aggregate = aggregateDiscoveryBenchmark([
    {
      status: 'success',
      data: {
        elapsed_seconds: 10,
        estimated_provider_calls: 5,
        discovery: {
          found: true,
          pricingReady: false,
          candidateOnly: false,
          acceptedSourceCount: 1,
          reviewCandidateCount: 0,
          acceptedPlatforms: ['N11'],
          successfulStrategies: ['barcode'],
          platformOutcomes: [],
        },
      },
    },
    {
      status: 'success',
      data: {
        elapsed_seconds: 20,
        estimated_provider_calls: 7,
        discovery: {
          found: false,
          pricingReady: false,
          candidateOnly: true,
          acceptedSourceCount: 0,
          reviewCandidateCount: 1,
          acceptedPlatforms: [],
          successfulStrategies: [],
          platformOutcomes: [],
        },
      },
    },
    { status: 'error' },
  ])

  assert.equal(aggregate.completed, 2)
  assert.equal(aggregate.errors, 1)
  assert.equal(aggregate.discovered, 1)
  assert.equal(aggregate.discoveryRate, 0.5)
  assert.equal(aggregate.averageElapsedSeconds, 15)
  assert.equal(aggregate.totalEstimatedProviderCalls, 12)
})

test('balanced selection spreads products across categories', () => {
  const selected = selectBalancedDiscoveryCandidates([
    { id: 'a1', category: 'Çanta', barcode: '1' },
    { id: 'a2', category: 'Çanta', barcode: '2' },
    { id: 'a3', category: 'Çanta', barcode: '3' },
    { id: 'b1', category: 'Oyuncak', barcode: '4' },
    { id: 'c1', category: 'Kırtasiye', barcode: null },
  ], 3)

  assert.deepEqual(new Set(selected.map(item => item.category)), new Set([
    'Çanta',
    'Kırtasiye',
    'Oyuncak',
  ]))
})

test('balanced selection includes barcode fallback candidates where available', () => {
  const selected = selectBalancedDiscoveryCandidates([
    { id: 'a1', category: 'Çanta', barcode: '1' },
    { id: 'a2', category: 'Çanta', barcode: null },
    { id: 'a3', category: 'Çanta', barcode: '3' },
  ], 2)

  assert.deepEqual(selected.map(item => item.id), ['a1', 'a2'])
})
