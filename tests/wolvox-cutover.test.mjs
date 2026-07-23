import test from 'node:test'
import assert from 'node:assert/strict'
import { createWolvoxMatchPreview, prepareWolvoxCatalog } from '../lib/integrations/wolvox-catalog.ts'
import { evaluateWolvoxCutoverReadiness } from '../lib/integrations/wolvox-cutover.ts'

test('duplicate staging barcode or SKU blocks automatic import', () => {
  const staging = prepareWolvoxCatalog([
    { external_id: 'w1', barcode: '8690001', product_name: 'Kalem 1', sales_price: 10, vat_rate: 20 },
    { external_id: 'w2', barcode: '869-0001', product_name: 'Kalem 2', sales_price: 12, vat_rate: 20 },
    { external_id: 'w3', sku: 'TEKIL', product_name: 'Defter', sales_price: 20, vat_rate: 20 },
  ]).records

  const preview = createWolvoxMatchPreview(staging, [])
  assert.deepEqual(preview.map(item => item.status), ['conflict', 'conflict', 'new'])
})

test('cutover is blocked while the Wolvox catalog has not arrived', () => {
  const readiness = evaluateWolvoxCutoverReadiness({
    connectionAssigned: true,
    archiveVerified: true,
    stagingTotal: 0,
    matched: 0,
    newProducts: 0,
    conflicts: 0,
    invalid: 0,
    latestSyncStatus: null,
  })

  assert.equal(readiness.ready, false)
  assert.equal(readiness.passedCount, 2)
  assert.equal(readiness.checks.find(check => check.id === 'catalog_received')?.passed, false)
})

test('cutover requires successful, valid, conflict-free and consistent staging', () => {
  const readiness = evaluateWolvoxCutoverReadiness({
    connectionAssigned: true,
    archiveVerified: true,
    stagingTotal: 3000,
    matched: 500,
    newProducts: 2500,
    conflicts: 0,
    invalid: 0,
    latestSyncStatus: 'succeeded',
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.passedCount, readiness.totalCount)
})

test('one invalid or conflicting record keeps cutover locked', () => {
  const readiness = evaluateWolvoxCutoverReadiness({
    connectionAssigned: true,
    archiveVerified: true,
    stagingTotal: 3000,
    matched: 499,
    newProducts: 2499,
    conflicts: 1,
    invalid: 1,
    latestSyncStatus: 'succeeded',
  })

  assert.equal(readiness.ready, false)
  assert.equal(readiness.checks.find(check => check.id === 'records_valid')?.passed, false)
  assert.equal(readiness.checks.find(check => check.id === 'conflicts_resolved')?.passed, false)
})

test('resolved staging issues remain part of the classification count', () => {
  const readiness = evaluateWolvoxCutoverReadiness({
    connectionAssigned: true,
    archiveVerified: true,
    stagingTotal: 6473,
    matched: 123,
    newProducts: 6327,
    conflicts: 0,
    invalid: 0,
    classifiedConflicts: 8,
    classifiedInvalid: 15,
    latestSyncStatus: 'succeeded',
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.checks.find(check => check.id === 'counts_consistent')?.passed, true)
})
