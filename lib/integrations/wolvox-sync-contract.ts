import type { WolvoxDepotInventoryRecord } from './wolvox-inventory-xml.ts'
import { stableFingerprint } from './wolvox-financial-xml.ts'

export interface InventorySnapshotContext {
  connectionId: string
  syncRunId?: string | null
  snapshotAt: string
  periodStartedAt?: string | null
}

export function buildInventorySnapshotRows(
  records: WolvoxDepotInventoryRecord[],
  context: InventorySnapshotContext,
) {
  if (!context.connectionId) throw new Error('wolvox_connection_required')
  const snapshotAt = new Date(context.snapshotAt)
  if (Number.isNaN(snapshotAt.getTime())) throw new Error('wolvox_snapshot_time_invalid')

  const seen = new Set<string>()
  return records.map(record => {
    const depotCode = record.depot_name?.trim() ?? ''
    const idempotencyKey = [
      context.connectionId,
      record.external_id,
      depotCode,
      snapshotAt.toISOString(),
    ].join('|')
    if (seen.has(idempotencyKey)) throw new Error('wolvox_inventory_snapshot_duplicate')
    seen.add(idempotencyKey)

    return {
      connection_id: context.connectionId,
      sync_run_id: context.syncRunId ?? null,
      external_product_id: record.external_id,
      depot_code: depotCode,
      depot_name: record.depot_name,
      snapshot_at: snapshotAt.toISOString(),
      period_started_at: context.periodStartedAt ?? null,
      quantity_in: record.quantity_in,
      quantity_out: record.quantity_out,
      quantity_remaining: record.quantity_remaining,
      quantity_available: record.quantity_available,
      quantity_blocked: record.quantity_blocked,
      unit_cost: record.unit_cost,
      inventory_value: record.inventory_value,
      source_hash: stableFingerprint([
        record.external_id,
        depotCode,
        record.quantity_in,
        record.quantity_out,
        record.quantity_remaining,
        record.quantity_available,
        record.quantity_blocked,
        record.unit_cost,
        record.inventory_value,
      ]),
    }
  })
}
