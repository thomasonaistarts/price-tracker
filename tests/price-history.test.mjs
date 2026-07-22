import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPriceChangeEvents, buildPriceChartPoints } from '../lib/price-history.ts'

test('price history reports our, market and platform movements newest first', () => {
  const events = buildPriceChangeEvents([
    {
      id: '1', run_at: '2026-07-01T08:00:00.000Z', our_price: 100, market_mean: 90,
      min_price: 85, max_price: 95, price_diff_percent: 11, sources_count: 1,
      sources: [{ site: 'N11', price: 90 }],
    },
    {
      id: '2', run_at: '2026-07-08T08:00:00.000Z', our_price: 110, market_mean: 95,
      min_price: 90, max_price: 100, price_diff_percent: 16, sources_count: 1,
      sources: [{ site: 'N11', price: 99 }],
    },
  ])

  assert.deepEqual(events.map((event) => event.actor), ['Bizim fiyat', 'Piyasa ortalaması', 'N11'])
  assert.equal(events[0].percent, 10)
  assert.equal(events[2].percent, 10)
})

test('price history ignores unchanged and missing legacy snapshots', () => {
  const events = buildPriceChangeEvents([
    {
      id: '1', run_at: '2026-07-01T08:00:00.000Z', our_price: null, market_mean: 90,
      min_price: 85, max_price: 95, price_diff_percent: null, sources_count: 0, sources: [],
    },
    {
      id: '2', run_at: '2026-07-08T08:00:00.000Z', our_price: 100, market_mean: 90,
      min_price: 85, max_price: 95, price_diff_percent: null, sources_count: 0, sources: [],
    },
  ])
  assert.deepEqual(events, [])
})


test('recorded recommendation changes appear once in events and immediately on chart', () => {
  const points = [
    {
      id: '1', run_at: '2026-07-01T08:00:00.000Z', our_price: 100, market_mean: 90,
      min_price: 85, max_price: 95, price_diff_percent: 11, sources_count: 1, sources: [],
    },
    {
      id: '2', run_at: '2026-07-08T08:00:00.000Z', our_price: 110, market_mean: 95,
      min_price: 90, max_price: 100, price_diff_percent: 16, sources_count: 1, sources: [],
    },
  ]
  const changes = [{
    id: 'change-1', created_at: '2026-07-08T08:00:00.000Z', old_price: 100, new_price: 110,
    change_source: 'recommendation', reason: 'test',
  }]
  const events = buildPriceChangeEvents(points, changes)
  assert.equal(events.filter(event => event.kind === 'our_price').length, 1)
  assert.equal(events.find(event => event.kind === 'our_price').actor, 'Bizim fiyat · öneri')
  assert.equal(buildPriceChartPoints(points, changes).at(-1).our_price, 110)
})
