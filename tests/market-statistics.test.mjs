import assert from 'node:assert/strict'
import test from 'node:test'
import { robustMarketStatistics } from '../lib/market-statistics.ts'

test('robust market reference uses the median', () => {
  const stats = robustMarketStatistics([100, 110, 120])
  assert.equal(stats.mean, 110)
  assert.equal(stats.reference, 110)
  assert.equal(stats.method, 'median')
})

test('MAD filter removes an extreme price before calculating the market', () => {
  const stats = robustMarketStatistics([99, 100, 101, 102, 9999])
  assert.deepEqual(stats.acceptedPrices, [99, 100, 101, 102])
  assert.equal(stats.reference, 100.5)
  assert.equal(stats.method, 'median_mad')
})

test('robust market handles empty and even-sized samples', () => {
  assert.equal(robustMarketStatistics([]).reference, null)
  assert.equal(robustMarketStatistics([100, 120]).reference, 110)
})
