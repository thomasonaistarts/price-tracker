import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterLowPriceOutliers,
  selectBestOfferPerPlatform,
} from '../lib/scrapers/selection.ts'

function offer(overrides = {}) {
  return {
    site: 'Trendyol',
    product_name: 'Art-X Marker Seti 24 Renk',
    price: 100,
    url: 'https://example.com/product',
    currency: 'TRY',
    confidence: 'high',
    matchScore: 0.8,
    inStock: true,
    ...overrides,
  }
}

test('one marketplace contributes only its best matching in-stock offer', () => {
  const selected = selectBestOfferPerPlatform([
    offer({ price: 70, confidence: 'medium', matchScore: 0.7, url: 'https://example.com/cheap' }),
    offer({ price: 110, confidence: 'exact', matchScore: 0.98, url: 'https://example.com/exact' }),
    offer({ price: 90, confidence: 'high', matchScore: 0.9, url: 'https://example.com/high' }),
    offer({ site: 'N11', price: 105, url: 'https://n11.com/product' }),
  ])

  assert.equal(selected.length, 2)
  assert.equal(selected.find(item => item.site === 'Trendyol')?.url, 'https://example.com/exact')
  assert.equal(selected.find(item => item.site === 'N11')?.price, 105)
})

test('out-of-stock and cheaper but weaker offers cannot displace a reliable offer', () => {
  const selected = selectBestOfferPerPlatform([
    offer({ price: 50, confidence: 'exact', matchScore: 1, inStock: false, url: 'https://example.com/sold-out' }),
    offer({ price: 80, confidence: 'high', matchScore: 0.81, url: 'https://example.com/cheap' }),
    offer({ price: 120, confidence: 'high', matchScore: 0.92, url: 'https://example.com/best' }),
  ])

  assert.deepEqual(selected.map(item => item.url), ['https://example.com/best'])
})

test('manual approval has priority and price is only the final tie breaker', () => {
  const selected = selectBestOfferPerPlatform([
    offer({ price: 90, confidence: 'exact', matchScore: 1, url: 'https://example.com/automatic' }),
    offer({ price: 130, confidence: 'exact', matchScore: 1, manualDecision: 'approved', url: 'https://example.com/manual' }),
  ])
  assert.equal(selected[0]?.url, 'https://example.com/manual')

  const tied = selectBestOfferPerPlatform([
    offer({ price: 110, url: 'https://example.com/expensive' }),
    offer({ price: 100, url: 'https://example.com/cheaper' }),
  ])
  assert.equal(tied[0]?.url, 'https://example.com/cheaper')
})

test('low-price filter operates on already independent platform offers', () => {
  const filtered = filterLowPriceOutliers([
    offer({ site: 'Trendyol', price: 20 }),
    offer({ site: 'N11', price: 100 }),
    offer({ site: 'PTTAvm', price: 110 }),
  ], 50)

  assert.deepEqual(filtered.map(item => item.site), ['N11', 'PTTAvm'])
})
