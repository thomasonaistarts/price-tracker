import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canWriteIdentityToWolvox,
  proposeProductIdentity,
} from '../lib/product-identity-enrichment.ts'

test('verified marketplace identity requires two independent corroborating sources', () => {
  const proposal = proposeProductIdentity([
    {
      source: 'verified_marketplace',
      sourceLabel: 'Trendyol',
      productName: 'Adel ALX-806 Üçlü Kalem Seti',
      brand: 'Adel',
      manufacturerCode: 'ALX-806',
      verified: true,
    },
    {
      source: 'verified_marketplace',
      sourceLabel: 'N11',
      productName: 'Adel ALX 806 3lü Kalem Seti',
      brand: 'Adel',
      manufacturerCode: 'ALX 806',
      verified: true,
    },
  ])

  assert.equal(proposal.brand, 'Adel')
  assert.equal(proposal.manufacturerCode, 'ALX-806')
  assert.equal(proposal.confidence, 'corroborated')
  assert.equal(proposal.approvalRequired, true)
  assert.equal(canWriteIdentityToWolvox(proposal), false)
})

test('one marketplace title cannot invent a brand or model', () => {
  const proposal = proposeProductIdentity([{
    source: 'verified_marketplace',
    sourceLabel: 'Trendyol',
    productName: 'Adel ALX-806 Üçlü Kalem Seti',
    brand: 'Adel',
    verified: true,
  }])

  assert.equal(proposal.brand, null)
  assert.equal(proposal.manufacturerCode, null)
  assert.equal(proposal.confidence, 'insufficient')
})

test('manual identity is authoritative and is the only direct Wolvox write candidate', () => {
  const proposal = proposeProductIdentity([{
    source: 'manual',
    sourceLabel: 'Yönetici',
    productName: 'Adel Kalem Seti',
    brand: 'Adel',
    manufacturerCode: 'ALX-806',
    productType: 'Kalem seti',
    verified: true,
  }])

  assert.equal(proposal.confidence, 'authoritative')
  assert.equal(proposal.approvalRequired, false)
  assert.equal(canWriteIdentityToWolvox(proposal), true)
})

test('unverified evidence never contributes to identity', () => {
  const proposal = proposeProductIdentity([
    {
      source: 'supplier',
      sourceLabel: 'Tedarikçi',
      productName: 'Yanlış Ürün',
      brand: 'Tahmin',
      verified: false,
    },
  ])
  assert.equal(proposal.confidence, 'insufficient')
  assert.equal(proposal.brand, null)
})
