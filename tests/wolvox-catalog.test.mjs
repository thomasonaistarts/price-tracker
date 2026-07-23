import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createWolvoxMatchPreview,
  normalizeWolvoxProduct,
  parseWolvoxNumber,
  prepareWolvoxCatalog,
  summarizeWolvoxMatches,
} from '../lib/integrations/wolvox-catalog.ts'

test('Wolvox numeric values accept Turkish and API number formats', () => {
  assert.equal(parseWolvoxNumber('1.234,56 TL'), 1234.56)
  assert.equal(parseWolvoxNumber('1234.56'), 1234.56)
  assert.equal(parseWolvoxNumber(42.5), 42.5)
  assert.equal(parseWolvoxNumber('geçersiz'), null)
})

test('Wolvox records are normalized without hiding validation problems', () => {
  const record = normalizeWolvoxProduct({
    external_id: ' STK-1 ',
    barcode: '869 123',
    product_name: '  Deneme   Kalem ',
    sales_price: '125,50',
    purchase_cost: '-1',
    vat_rate: '120',
    stock_quantity: '12,5',
  }, 0)

  assert.equal(record.external_id, 'STK-1')
  assert.equal(record.product_name, 'Deneme Kalem')
  assert.equal(record.sales_price, 125.5)
  assert.equal(record.stock_quantity, 12.5)
  assert.deepEqual(record.validation_errors, ['purchase_cost_negative', 'vat_rate_out_of_range'])
})

test('duplicate external ids are visible and cannot create duplicate staging rows', () => {
  const preparation = prepareWolvoxCatalog([
    { external_id: '1', sku: 'A', product_name: 'Bir' },
    { external_id: '1', sku: 'B', product_name: 'İki' },
  ])

  assert.equal(preparation.receivedCount, 2)
  assert.equal(preparation.records.length, 1)
  assert.equal(preparation.invalidCount, 2)
  assert.deepEqual(preparation.duplicateExternalIds, ['1'])
})

test('catalog preview prioritizes barcode, then SKU, and reports conflicts', () => {
  const staging = prepareWolvoxCatalog([
    { external_id: 'w1', barcode: '869-001', product_name: 'Barkod eşleşmesi', sales_price: 10, vat_rate: 20 },
    { external_id: 'w2', sku: 'SKU-2', product_name: 'SKU eşleşmesi', sales_price: 10, vat_rate: 20 },
    { external_id: 'w3', sku: 'YENI', product_name: 'Yeni ürün', sales_price: 10, vat_rate: 20 },
    { external_id: 'w4', sku: 'ORTAK', product_name: 'Çakışan ürün', sales_price: 10, vat_rate: 20 },
    { external_id: '', sku: '', product_name: '' },
  ]).records
  const products = [
    { id: 'p1', sku: '869001', product_name: 'Eski barkodlu ürün' },
    { id: 'p2', sku: 'sku 2', product_name: 'Eski SKU ürünü' },
    { id: 'p3', sku: 'ORTAK', product_name: 'Ortak 1' },
    { id: 'p4', sku: 'ORTAK', product_name: 'Ortak 2' },
  ]

  const preview = createWolvoxMatchPreview(staging, products)
  assert.deepEqual(preview.map(item => [item.external_id, item.status, item.method]), [
    ['w1', 'matched', 'barcode'],
    ['w2', 'matched', 'sku'],
    ['w3', 'new', null],
    ['w4', 'conflict', 'sku'],
    ['invalid-row-5', 'invalid', null],
  ])
  assert.deepEqual(summarizeWolvoxMatches(preview), { matched: 2, new: 1, conflict: 1, invalid: 1 })
})

test('malformed catalog rows are staged as invalid instead of crashing the request', () => {
  const preparation = prepareWolvoxCatalog([null, 'bad-row'])
  assert.equal(preparation.receivedCount, 2)
  assert.equal(preparation.invalidCount, 2)
  assert.deepEqual(preparation.records.map(record => record.external_id), ['invalid-row-1', 'invalid-row-2'])
})

test('chunked catalog preparation keeps invalid row ids globally unique', () => {
  const firstChunk = prepareWolvoxCatalog([null], 0)
  const secondChunk = prepareWolvoxCatalog([null], 500)
  assert.equal(firstChunk.records[0].external_id, 'invalid-row-1')
  assert.equal(secondChunk.records[0].external_id, 'invalid-row-501')
})
