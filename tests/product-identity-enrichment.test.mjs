import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProductIdentityEvidence,
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

test('two listings from the same marketplace are not independent corroboration', () => {
  const proposal = proposeProductIdentity([
    {
      source: 'verified_marketplace',
      sourceLabel: 'N11',
      sourceUrl: 'https://www.n11.com/urun/one',
      productName: 'Adel ALX-806 Kalem Seti',
      brand: 'Adel',
      manufacturerCode: 'ALX-806',
      verified: true,
    },
    {
      source: 'verified_marketplace',
      sourceLabel: 'N11',
      sourceUrl: 'https://www.n11.com/urun/two',
      productName: 'Adel ALX-806 Üçlü Kalem Seti',
      brand: 'Adel',
      manufacturerCode: 'ALX-806',
      verified: true,
    },
  ])

  assert.equal(proposal.brand, null)
  assert.equal(proposal.manufacturerCode, null)
  assert.equal(proposal.confidence, 'insufficient')
})

test('identity evidence ignores latest results unless their URL was verified', () => {
  const evidence = buildProductIdentityEvidence({
    product: {
      productName: 'Adel Kalem Seti',
      externalSource: 'wolvox',
    },
    rememberedSources: [{
      platform: 'N11',
      sourceUrl: 'https://www.n11.com/urun/verified/?utm_source=fiyatlaa',
      productName: 'Adel ALX-806 Kalem Seti',
    }],
    latestSources: [
      {
        site: 'N11',
        url: 'https://www.n11.com/urun/verified',
        product_name: 'Adel ALX-806 Kalem Seti',
        brand: 'Adel',
        manufacturerCode: 'ALX-806',
        confidence: 'exact',
      },
      {
        site: 'Trendyol',
        url: 'https://www.trendyol.com/urun/unverified',
        product_name: 'Yanlış Marka ZZZ-999 Kalem Seti',
        brand: 'Yanlış Marka',
        manufacturerCode: 'ZZZ-999',
        confidence: 'exact',
      },
    ],
  })

  assert.equal(evidence.length, 1)
  assert.equal(evidence[0].sourceLabel, 'N11')
  assert.equal(evidence[0].brand, 'Adel')
})

test('existing Wolvox identity is authoritative but still requires approval', () => {
  const evidence = buildProductIdentityEvidence({
    product: {
      productName: 'Barbie Kelebek Dansçı Bebek',
      brand: 'Barbie',
      manufacturerCode: 'HXJ10',
      productType: 'Bebek',
      externalSource: 'WOLVOX',
    },
  })
  const proposal = proposeProductIdentity(evidence)

  assert.equal(proposal.confidence, 'authoritative')
  assert.equal(proposal.approvalRequired, true)
  assert.equal(canWriteIdentityToWolvox(proposal), false)
})
