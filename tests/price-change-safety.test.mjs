import assert from 'node:assert/strict'
import test from 'node:test'
import {
  priceChangePercent,
  requiresLargePriceChangeConfirmation,
} from '../lib/price-change-safety.ts'

test('price change boundary allows exactly ten percent', () => {
  assert.equal(priceChangePercent(100, 110), 10)
  assert.equal(requiresLargePriceChangeConfirmation(100, 110), false)
  assert.equal(requiresLargePriceChangeConfirmation(100, 110.01), true)
})

test('price change safety works in both directions', () => {
  assert.equal(requiresLargePriceChangeConfirmation(100, 89), true)
  assert.equal(requiresLargePriceChangeConfirmation(100, 91), false)
})

test('invalid prices are always treated as unsafe', () => {
  assert.equal(requiresLargePriceChangeConfirmation(0, 100), true)
  assert.equal(requiresLargePriceChangeConfirmation(100, Number.NaN), true)
})
