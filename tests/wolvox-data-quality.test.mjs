import assert from 'node:assert/strict'
import test from 'node:test'
import { assessWolvoxCatalogQuality } from '../lib/integrations/wolvox-data-quality.ts'

const base = {
  external_id: '1',
  sku: 'ST1',
  product_name: 'Ürün',
  sales_price: 100,
  purchase_cost: 50,
  vat_rate: 20,
  stock_quantity: 1,
  unit_name: 'ADET',
  is_active: true,
  validation_errors: [],
  raw_data: {},
}

test('WOLVOX quality summary exposes missing identity fields', () => {
  const summary = assessWolvoxCatalogQuality([
    { ...base, barcode: '8690000000005', brand: 'Marka', category: 'Kırtasiye' },
    { ...base, external_id: '2', barcode: null, brand: null, category: null },
    { ...base, external_id: '3', barcode: '9786256611825', brand: null, category: '9786256611825' },
  ])

  assert.equal(summary.total, 3)
  assert.equal(summary.missingBarcode, 1)
  assert.equal(summary.missingBrand, 2)
  assert.equal(summary.missingCategory, 1)
  assert.equal(summary.suspiciousCategory, 1)
  assert.equal(summary.identityReadyPercent, 66.67)
})
