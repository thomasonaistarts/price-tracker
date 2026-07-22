import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateProfitability, recommendPrice } from '../lib/price-recommendation.ts'

const base = {
  salePrice: 150,
  purchaseCost: 80,
  vatRate: 20,
  commissionRate: 10,
  shippingCost: 10,
  packagingCost: 2,
  targetMarginRate: 20,
  priceFloor: null,
  priceCeiling: null,
  marketMean: 160,
}

test('profitability includes commission and fixed operational costs', () => {
  assert.deepEqual(calculateProfitability(150, base), {
    salePrice: 150,
    commissionCost: 15,
    grossContribution: 43,
    netContribution: 35.83,
    contributionMarginRate: 28.67,
  })
})

test('market mean is recommended when it protects target margin', () => {
  const result = recommendPrice(base)
  assert.equal(result.status, 'ready')
  assert.equal(result.minimumSafePrice, 131.43)
  assert.equal(result.recommendedPrice, 160)
  assert.equal(result.recommended?.contributionMarginRate, 32.5)
})

test('safe floor replaces a market price below target margin', () => {
  const result = recommendPrice({ ...base, marketMean: 110 })
  assert.equal(result.recommendedPrice, 131.43)
  assert.match(result.reason, /güvenli taban/)
})

test('manual floor and ceiling constrain the recommendation', () => {
  const result = recommendPrice({ ...base, priceFloor: 145, priceCeiling: 155, marketMean: 170 })
  assert.equal(result.minimumSafePrice, 145)
  assert.equal(result.recommendedPrice, 155)
})

test('missing cost and impossible rules do not produce a recommendation', () => {
  assert.equal(recommendPrice({ ...base, purchaseCost: null }).status, 'missing_cost')
  assert.equal(recommendPrice({ ...base, commissionRate: 70, targetMarginRate: 30 }).status, 'invalid_rules')
  assert.equal(recommendPrice({ ...base, priceCeiling: 100 }).status, 'invalid_rules')
})
