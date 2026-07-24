import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBarcodeMatch } from '../lib/scrapers/index.ts'

test('classifies equal valid GTIN values as an exact match', () => {
  assert.equal(classifyBarcodeMatch('8681241429052', '8681241429052'), 'match')
})

test('rejects a different valid candidate GTIN', () => {
  assert.equal(classifyBarcodeMatch('8681241429052', '9786256611825'), 'mismatch')
})

test('does not use invalid or missing values as negative identity evidence', () => {
  assert.equal(classifyBarcodeMatch('ST02950', '8681241429052'), 'unknown')
  assert.equal(classifyBarcodeMatch('8681241429052', undefined), 'unknown')
})
