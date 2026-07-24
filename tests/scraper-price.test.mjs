import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarketplacePrice } from '../lib/scrapers/price.ts'

test('marketplace prices keep cents for number and Turkish text values', () => {
  assert.equal(parseMarketplacePrice(1594.99), 1594.99)
  assert.equal(parseMarketplacePrice('1.594,99 TL'), 1594.99)
  assert.equal(parseMarketplacePrice('1594,90'), 1594.9)
})

test('international thousands and decimal separators are normalized', () => {
  assert.equal(parseMarketplacePrice('1,594.99'), 1594.99)
  assert.equal(parseMarketplacePrice('1594.9'), 1594.9)
})

test('invalid marketplace price values are rejected', () => {
  assert.equal(parseMarketplacePrice(null), null)
  assert.equal(parseMarketplacePrice('fiyat yok'), null)
  assert.equal(parseMarketplacePrice(Number.POSITIVE_INFINITY), null)
})
