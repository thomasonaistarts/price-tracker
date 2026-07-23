import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWolvoxProduct } from '../lib/integrations/wolvox-catalog.ts'
import { buildWolvoxProductDrafts } from '../lib/integrations/wolvox-product-draft.ts'

test('Wolvox staging record becomes a source-owned Fiyatlaa product draft', () => {
  const record = normalizeWolvoxProduct({
    external_id: 'STK-42',
    sku: 'KASA-42',
    barcode: '8690000000042',
    product_name: 'Çizgili Defter',
    brand: 'Örnek',
    category: 'Kırtasiye',
    sales_price: '149,90',
    purchase_cost: '80,00',
    vat_rate: 20,
    stock_quantity: 36,
    unit_name: 'ADET',
    is_active: true,
  }, 0)

  const result = buildWolvoxProductDrafts([record], 'efe-user-id')
  assert.equal(result.rejected.length, 0)
  assert.deepEqual(result.drafts[0], {
    user_id: 'efe-user-id',
    sku: 'KASA-42',
    product_name: 'Çizgili Defter',
    brand: 'Örnek',
    category: 'Kırtasiye',
    our_price: 149.9,
    purchase_cost: 80,
    vat_rate: 20,
    currency: 'TRY',
    is_active: true,
    external_source: 'wolvox',
    external_id: 'STK-42',
    barcode: '8690000000042',
    stock_quantity: 36,
    stock_unit: 'ADET',
  })
})

test('approved exclusions are skipped and duplicate barcodes fall back to unique Wolvox SKUs', () => {
  const records = [
    normalizeWolvoxProduct({
      external_id: '1',
      sku: 'ST001',
      barcode: '8690000000042',
      product_name: 'Birinci ürün',
      sales_price: 100,
      vat_rate: 20,
    }, 0),
    normalizeWolvoxProduct({
      external_id: '2',
      sku: 'ST002',
      barcode: '8690000000042',
      product_name: 'İkinci ürün',
      sales_price: 120,
      vat_rate: 20,
    }, 1),
    normalizeWolvoxProduct({
      external_id: '3',
      sku: 'ST003',
      product_name: 'Hariç ürün',
      is_active: true,
    }, 2),
  ]

  const result = buildWolvoxProductDrafts(records, 'efe-user-id', {
    decisions: { '1': 'use_sku', '2': 'use_sku', '3': 'exclude' },
  })

  assert.deepEqual(result.drafts.map(draft => [draft.sku, draft.barcode]), [
    ['ST001', null],
    ['ST002', null],
  ])
  assert.deepEqual(result.excluded, ['3'])
  assert.equal(result.clearedBarcodeCount, 2)
  assert.equal(result.rejected.length, 0)
})

test('active Wolvox product without sale price or VAT is rejected', () => {
  const record = normalizeWolvoxProduct({
    external_id: 'STK-43',
    sku: 'KASA-43',
    product_name: 'Eksik Ürün',
    is_active: true,
  }, 0)

  const result = buildWolvoxProductDrafts([record], 'efe-user-id')
  assert.equal(result.drafts.length, 0)
  assert.deepEqual(result.rejected[0].reasons, ['sales_price_missing', 'vat_rate_missing', 'sales_price_required', 'vat_rate_required'])
})

test('draft import is rejected when catalog owner is missing', () => {
  const record = normalizeWolvoxProduct({
    external_id: 'STK-44',
    sku: 'KASA-44',
    product_name: 'Kalem',
    sales_price: 10,
    vat_rate: 20,
  }, 0)

  const result = buildWolvoxProductDrafts([record], '')
  assert.equal(result.drafts.length, 0)
  assert.deepEqual(result.rejected[0].reasons, ['owner_user_id_missing'])
})
