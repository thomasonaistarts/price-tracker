import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveCountsMatch, totalArchiveRows } from '../lib/integrations/catalog-archive.ts'

test('archive verification requires every source table count to match', () => {
  const source = { users: 4, products: 631, price_analyses: 504 }
  assert.equal(archiveCountsMatch(source, { ...source }), true)
  assert.equal(archiveCountsMatch(source, { ...source, products: 630 }), false)
  assert.equal(archiveCountsMatch(source, { users: 4, products: 631 }), false)
})

test('archive total includes all recorded business rows', () => {
  assert.equal(totalArchiveRows({ users: 4, products: 631, price_analyses: 504, user_settings: 1 }), 1140)
})
