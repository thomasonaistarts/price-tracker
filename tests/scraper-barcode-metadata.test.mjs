import test from 'node:test'
import assert from 'node:assert/strict'
import { extractProductBarcode } from '../lib/scrapers/metadata.ts'

test('extracts valid GTIN values from marketplace payload shapes', () => {
  assert.equal(extractProductBarcode({ gtin13: '8681241429052' }), '8681241429052')
  assert.equal(
    extractProductBarcode({ details: { barcode: '978-6256 611825' } }),
    '9786256611825',
  )
})

test('ignores invalid checksums and internal product codes', () => {
  assert.equal(extractProductBarcode({ ean13: '8681241429053' }), undefined)
  assert.equal(extractProductBarcode({ barcode: 'ST02950' }), undefined)
})
