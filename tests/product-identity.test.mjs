import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProductSearchQueries, chooseProductSearchQuery, isValidGtin } from '../lib/product-identity.ts'

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

test('real product barcode is searched before a GTIN-like SKU and name fallbacks', () => {
  assert.deepEqual(
    buildProductSearchQueries({
      barcode: '869-0000 000005',
      sku: '8005125750818',
      brand: 'Art-X',
      productName: 'Marker Seti 24 Renk',
    }),
    [
      { query: '8690000000005', strategy: 'barcode' },
      { query: '8005125750818', strategy: 'sku_barcode' },
      { query: 'Art-X Marker Seti 24 Renk', strategy: 'brand_product_name' },
      { query: 'Marker Seti 24 Renk', strategy: 'product_name' },
    ],
  )
})

test('invalid barcode and internal SKU safely fall back to brand and product name', () => {
  assert.deepEqual(
    buildProductSearchQueries({
      barcode: '8690000000007',
      sku: 'STOK-123',
      brand: 'Faber-Castell',
      productName: 'Boya Kalemi 12 Renk',
    }),
    [
      { query: 'Faber-Castell Boya Kalemi 12 Renk', strategy: 'brand_product_name' },
      { query: 'Boya Kalemi 12 Renk', strategy: 'product_name' },
    ],
  )
})

test('brand is not duplicated when product name already contains it', () => {
  assert.deepEqual(
    buildProductSearchQueries({
      barcode: null,
      sku: 'STOK-456',
      brand: 'Faber-Castell',
      productName: 'Faber-Castell Boya Kalemi 12 Renk',
    }),
    [
      { query: 'Faber-Castell Boya Kalemi 12 Renk', strategy: 'product_name' },
    ],
  )
})
