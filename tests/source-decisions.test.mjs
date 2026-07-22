import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSourceUrl, sourceDecisionKey } from '../lib/source-decisions.ts'

test('source URL tracking parameters are removed and parameters are sorted', () => {
  assert.equal(
    normalizeSourceUrl('https://Example.com/product/123/?utm_source=test&b=2&a=1#details'),
    'https://example.com/product/123?a=1&b=2',
  )
})

test('source decision key normalizes platform casing and URL', () => {
  assert.equal(
    sourceDecisionKey('N11', 'https://www.n11.com/urun/test?utm_campaign=x'),
    sourceDecisionKey('n11', 'https://www.n11.com/urun/test'),
  )
})
