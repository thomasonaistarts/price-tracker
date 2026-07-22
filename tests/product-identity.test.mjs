import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseProductSearchQuery, isValidGtin } from '../lib/product-identity.ts'

test('valid EAN-13 is selected as the marketplace search query', () => {
  assert.equal(isValidGtin('8005125750818'), true)
  assert.deepEqual(
    chooseProductSearchQuery('8005125750818', 'Mekanik Laboratuvarı Haul Truck'),
    { query: '8005125750818', strategy: 'barcode' },
  )
})

test('spaces and hyphens in a valid GTIN are normalized', () => {
  assert.deepEqual(
    chooseProductSearchQuery('800-5125 750818', 'Ürün'),
    { query: '8005125750818', strategy: 'barcode' },
  )
})

test('invalid checksum and internal SKU fall back to product name', () => {
  assert.equal(isValidGtin('8005125750819'), false)
  assert.deepEqual(
    chooseProductSearchQuery('STOK-123', '  Art-X Marker Seti  '),
    { query: 'Art-X Marker Seti', strategy: 'product_name' },
  )
})
