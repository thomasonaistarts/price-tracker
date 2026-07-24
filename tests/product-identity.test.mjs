import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIdentityTermsQuery,
  buildModelCodeQuery,
  buildProductSearchQueries,
  chooseProductSearchQuery,
  extractModelCodes,
  isValidGtin,
  normalizeProductNameForSearch,
} from '../lib/product-identity.ts'

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
      { query: 'Art-X 24 Renk Marker Seti', strategy: 'identity_terms' },
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
      { query: 'Faber-Castell 12 Renk Boya Kalemi', strategy: 'identity_terms' },
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
      { query: 'Faber-Castell 12 Renk Boya Kalemi', strategy: 'identity_terms' },
    ],
  )
})

test('marketplace name is normalized without removing model punctuation', () => {
  assert.equal(
    normalizeProductNameForSearch('  Faber-Castell | Grip_2001   Kalem  '),
    'Faber-Castell Grip 2001 Kalem',
  )
})

test('identity query removes discovery filler but keeps model and product subtype', () => {
  assert.equal(
    buildIdentityTermsQuery('Adel Junior Love Corgi Sırt Çantası'),
    'Adel Love Corgi Sırt Çantası',
  )
  assert.equal(
    buildIdentityTermsQuery('Adel Beslenme Çantası Slam Dunk'),
    'Adel Slam Dunk Beslenme Çantası',
  )
  assert.equal(
    buildIdentityTermsQuery('Kuromi Boyama Kitabı The Çocuk'),
    'Kuromi Boyama Kitabı',
  )
})

test('short identity fallback is appended after the exact product name', () => {
  assert.deepEqual(
    buildProductSearchQueries({
      barcode: '8681241429052',
      sku: 'ST02946',
      productName: 'Adel Junior Love Corgi Sırt Çantası',
    }),
    [
      { query: '8681241429052', strategy: 'barcode' },
      { query: 'Adel Junior Love Corgi Sırt Çantası', strategy: 'product_name' },
      { query: 'Adel Love Corgi Sırt Çantası', strategy: 'identity_terms' },
    ],
  )
})

test('explicit brand is kept once in the short identity query', () => {
  assert.equal(
    buildIdentityTermsQuery('Junior Love Corgi Sırt Çantası', 'Adel'),
    'Adel Love Corgi Sırt Çantası',
  )
})

test('model codes are extracted without treating package and measurement values as models', () => {
  assert.deepEqual(
    extractModelCodes('2in1 Barbie Kelebek Dansçı Bebek HXJ10 500 ml'),
    ['HXJ10'],
  )
  assert.deepEqual(
    extractModelCodes('Altın Sentetik Uzun Yassı Uç Fırça CA-983 No:16'),
    ['CA-983'],
  )
})

test('model-code discovery query keeps identity, code and product type compact', () => {
  assert.equal(
    buildModelCodeQuery('2in1 Barbie Kelebek Dansçı Bebek HXJ10'),
    'Barbie HXJ10 Bebek',
  )
  assert.equal(
    buildModelCodeQuery('Altın Sentetik Uzun Yassı Uç Fırça CA-983 No:16'),
    'Altın CA-983 Fırça',
  )
  assert.equal(
    buildModelCodeQuery('Play-Doh Veteriner Seti F3639'),
    'Play-Doh F3639',
  )
})

test('model-code query is attempted before the exact and compact name fallbacks', () => {
  assert.deepEqual(
    buildProductSearchQueries({
      barcode: null,
      sku: 'ST05154',
      productName: '2in1 Barbie Kelebek Dansçı Bebek HXJ10',
    }),
    [
      { query: 'Barbie HXJ10 Bebek', strategy: 'model_code' },
      { query: '2in1 Barbie Kelebek Dansçı Bebek HXJ10', strategy: 'product_name' },
      { query: '2in1 Barbie Kelebek Dansçı HXJ10 Bebek', strategy: 'identity_terms' },
    ],
  )
})

test('explicit manufacturer code and product type form the compact first name query', () => {
  assert.deepEqual(
    buildProductSearchQueries({
      barcode: null,
      sku: 'ST05154',
      brand: 'Barbie',
      productName: 'Kelebek Dansçı Bebek',
      manufacturerCode: 'HXJ10',
      productType: 'Bebek',
    }),
    [
      { query: 'Barbie HXJ10 Bebek', strategy: 'model_code' },
      { query: 'Barbie Kelebek Dansçı Bebek', strategy: 'brand_product_name' },
      { query: 'Kelebek Dansçı Bebek', strategy: 'product_name' },
    ],
  )
})
