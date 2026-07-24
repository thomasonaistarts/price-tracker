import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInventorySnapshotRows } from '../lib/integrations/wolvox-sync-contract.ts'

const record = {
  external_id: '10',
  depot_name: 'MERKEZ',
  quantity_in: 12,
  quantity_out: 7,
  quantity_remaining: 5,
  quantity_available: 4,
  quantity_blocked: 1,
  unit_cost: 20,
  inventory_value: 100,
}

test('inventory sync rows preserve movement, depot and cost fields', () => {
  const [row] = buildInventorySnapshotRows([record], {
    connectionId: 'connection',
    snapshotAt: '2026-07-24T10:00:00.000Z',
    periodStartedAt: '2026-07-01T00:00:00.000Z',
  })
  assert.equal(row.external_product_id, '10')
  assert.equal(row.depot_code, 'MERKEZ')
  assert.equal(row.quantity_out, 7)
  assert.equal(row.unit_cost, 20)
  assert.match(row.source_hash, /^[0-9a-f]{8}$/)
})

test('duplicate product/depot rows in one snapshot are rejected', () => {
  assert.throws(() => buildInventorySnapshotRows([record, record], {
    connectionId: 'connection',
    snapshotAt: '2026-07-24T10:00:00.000Z',
  }), /snapshot_duplicate/)
})
