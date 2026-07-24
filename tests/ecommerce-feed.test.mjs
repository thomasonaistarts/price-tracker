import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEcommerceXmlFeed,
  ecommerceAvailableStock,
} from '../lib/integrations/ecommerce-feed.ts'

test('ecommerce feed reserves store safety stock', () => {
  assert.equal(ecommerceAvailableStock({
    sku: 'A',
    title: 'Ürün',
    price: 100,
    stockQuantity: 5,
    safetyStock: 2,
  }), 3)
  assert.equal(ecommerceAvailableStock({
    sku: 'A',
    title: 'Ürün',
    price: 100,
    stockQuantity: 1,
    safetyStock: 2,
  }), 0)
})

test('ecommerce feed uses only the explicit ecommerce price and escapes XML', () => {
  const xml = buildEcommerceXmlFeed([{
    sku: 'ST&1',
    barcode: '8690000000001',
    title: 'Kalem <Seti>',
    price: 249.9,
    stockQuantity: 10,
    safetyStock: 2,
    currency: 'TRY',
    description: 'A&B',
    imageUrls: ['https://cdn.example/image?a=1&b=2', 'http://unsafe.example/image'],
  }], '2026-07-24T10:00:00.000Z')

  assert.match(xml, /<price currency="TRY">249\.90<\/price>/)
  assert.match(xml, /<stock>8<\/stock>/)
  assert.match(xml, /ST&amp;1/)
  assert.match(xml, /Kalem &lt;Seti&gt;/)
  assert.match(xml, /https:\/\/cdn\.example\/image\?a=1&amp;b=2/)
  assert.doesNotMatch(xml, /unsafe\.example/)
  assert.doesNotMatch(xml, /our_price/)
})

test('invalid or incomplete ecommerce products are excluded', () => {
  const xml = buildEcommerceXmlFeed([
    { sku: '', title: 'Ürün', price: 10, stockQuantity: 1, safetyStock: 0 },
    { sku: 'A', title: '', price: 10, stockQuantity: 1, safetyStock: 0 },
    { sku: 'B', title: 'Ürün', price: 0, stockQuantity: 1, safetyStock: 0 },
  ])
  assert.match(xml, /count="0"/)
  assert.doesNotMatch(xml, /<product>/)
})
