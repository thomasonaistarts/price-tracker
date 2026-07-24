import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDualPriceProposals } from '../lib/dual-price-engine.ts'

test('store and ecommerce prices use separate cost rules', () => {
  const proposals = buildDualPriceProposals({
    store: {
      salePrice: 120,
      purchaseCost: 80,
      vatRate: 20,
      commissionRate: 0,
      shippingCost: 0,
      packagingCost: 0,
      targetMarginRate: 20,
    },
    ecommerce: {
      salePrice: 120,
      purchaseCost: 80,
      vatRate: 20,
      commissionRate: 15,
      shippingCost: 25,
      packagingCost: 5,
      targetMarginRate: 20,
    },
  })

  assert.equal(proposals.store.proposedPrice, 100)
  assert.equal(proposals.ecommerce.proposedPrice, 169.23)
  assert.notEqual(proposals.store.proposedPrice, proposals.ecommerce.proposedPrice)
})

test('each price target independently enforces the ten percent approval gate', () => {
  const proposals = buildDualPriceProposals({
    store: {
      salePrice: 100,
      purchaseCost: 79,
      vatRate: 20,
      commissionRate: 0,
      shippingCost: 0,
      packagingCost: 0,
      targetMarginRate: 20,
    },
    ecommerce: {
      salePrice: 150,
      purchaseCost: 80,
      vatRate: 20,
      commissionRate: 10,
      shippingCost: 10,
      packagingCost: 0,
      targetMarginRate: 20,
    },
  })
  assert.equal(proposals.store.requiresExtraApproval, false)
  assert.equal(proposals.ecommerce.requiresExtraApproval, true)
})
