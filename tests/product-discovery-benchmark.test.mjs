import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateDiscoveryBenchmark,
  selectBalancedDiscoveryCandidates,
  summarizeProductIdentitySignals,
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

test('identity signals do not treat two listings from one platform as corroboration', () => {
  const identity = summarizeProductIdentitySignals([
    { site: 'Trendyol', brand: 'Faber-Castell' },
    { site: 'Trendyol', brand: 'Faber Castell' },
  ])

  assert.equal(identity.hasAnySignal, true)
  assert.equal(identity.brand.sourceCount, 1)
  assert.equal(identity.candidateReady, false)
})

test('identity signals require agreement across independent platforms', () => {
  const identity = summarizeProductIdentitySignals([
    {
      site: 'Trendyol',
      brand: 'Faber-Castell',
      manufacturerCode: 'FC-123',
      productType: 'Kurşun Kalem',
    },
    {
      site: 'N11',
      brand: 'Faber Castell',
      manufacturerCode: 'FC123',
      productType: 'Kurşun kalem',
    },
  ])

  assert.equal(identity.brand.sourceCount, 2)
  assert.equal(identity.manufacturerCode.sourceCount, 2)
  assert.equal(identity.productType.sourceCount, 2)
  assert.deepEqual(identity.corroboratedFields, [
    'brand',
    'manufacturerCode',
    'productType',
  ])
  assert.equal(identity.candidateReady, true)
})

test('conflicting identity values remain signals but are not ready', () => {
  const identity = summarizeProductIdentitySignals([
    { site: 'Trendyol', brand: 'Adel' },
    { site: 'N11', brand: 'Serve' },
  ])

  assert.equal(identity.hasAnySignal, true)
  assert.equal(identity.brand.sourceCount, 1)
  assert.equal(identity.candidateReady, false)
})

test('empty identity input is safe', () => {
  const identity = summarizeProductIdentitySignals([])

  assert.equal(identity.hasAnySignal, false)
  assert.equal(identity.signalSourceCount, 0)
  assert.equal(identity.candidateReady, false)
  assert.deepEqual(identity.corroboratedFields, [])
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
          identity: summarizeProductIdentitySignals([]),
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
          identity: summarizeProductIdentitySignals([]),
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
