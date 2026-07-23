import { parseWolvoxNumber, type WolvoxCatalogInput } from './wolvox-catalog.ts'
import { parseWolvoxReportXml } from './wolvox-report-xml.ts'

export interface WolvoxDepotInventoryRecord {
  external_id: string
  depot_name: string | null
  quantity_remaining: number
  quantity_available: number
  quantity_blocked: number
  unit_cost: number | null
  inventory_value: number
}

export interface WolvoxInventoryXmlResult {
  records: WolvoxDepotInventoryRecord[]
  sourceRowCount: number
  sourceFields: string[]
}

export interface WolvoxInventoryMergeSummary {
  catalogProducts: number
  inventoryRows: number
  inventoryProducts: number
  matchedProducts: number
  catalogWithoutInventory: number
  inventoryWithoutCatalog: number
  productsInMultipleDepots: number
  positiveStockProducts: number
  zeroStockProducts: number
  negativeStockProducts: number
}

interface InventoryAggregate {
  quantityRemaining: number
  quantityAvailable: number
  quantityBlocked: number
  inventoryValue: number
  unitCosts: number[]
  depots: Map<string, { quantity: number; available: number; blocked: number }>
}

export function parseWolvoxInventoryXml(xml: string): WolvoxInventoryXmlResult {
  const parsed = parseWolvoxReportXml(xml)
  const records = parsed.rows.map(source => {
    const externalId = source.BLSTKODU || source.BLKODU
    if (!externalId) throw new Error('wolvox_inventory_external_id_missing')
    return {
      external_id: externalId,
      depot_name: source.DEPO_ADI_1 || source.DEPO_ADI || null,
      quantity_remaining: numberOrZero(source.MIKTAR_KALAN),
      quantity_available: numberOrZero(source.MIKTAR_KULBILIR),
      quantity_blocked: numberOrZero(source.MIKTAR_BLOKE),
      unit_cost: parseWolvoxNumber(source.BIRIM_FIYATI),
      inventory_value: numberOrZero(source.ENV_TUTARI),
    }
  })

  return {
    records,
    sourceRowCount: records.length,
    sourceFields: parsed.sourceFields,
  }
}

export function mergeWolvoxInventory(
  products: WolvoxCatalogInput[],
  inventoryRecords: WolvoxDepotInventoryRecord[],
) {
  const aggregates = new Map<string, InventoryAggregate>()

  for (const record of inventoryRecords) {
    const aggregate: InventoryAggregate = aggregates.get(record.external_id) ?? {
      quantityRemaining: 0,
      quantityAvailable: 0,
      quantityBlocked: 0,
      inventoryValue: 0,
      unitCosts: [],
      depots: new Map(),
    }
    aggregate.quantityRemaining += record.quantity_remaining
    aggregate.quantityAvailable += record.quantity_available
    aggregate.quantityBlocked += record.quantity_blocked
    aggregate.inventoryValue += record.inventory_value
    if (record.unit_cost !== null && record.unit_cost > 0) aggregate.unitCosts.push(record.unit_cost)
    if (record.depot_name) {
      const depot = aggregate.depots.get(record.depot_name) ?? { quantity: 0, available: 0, blocked: 0 }
      depot.quantity += record.quantity_remaining
      depot.available += record.quantity_available
      depot.blocked += record.quantity_blocked
      aggregate.depots.set(record.depot_name, depot)
    }
    aggregates.set(record.external_id, aggregate)
  }

  const catalogIds = new Set(products.map(product => String(product.external_id ?? '').trim()).filter(Boolean))
  let matchedProducts = 0
  let productsInMultipleDepots = 0
  let positiveStockProducts = 0
  let zeroStockProducts = 0
  let negativeStockProducts = 0

  const merged = products.map(product => {
    const externalId = String(product.external_id ?? '').trim()
    const inventory = aggregates.get(externalId)
    const quantityAvailable = inventory?.quantityAvailable ?? 0
    if (inventory) matchedProducts += 1
    if ((inventory?.depots.size ?? 0) > 1) productsInMultipleDepots += 1
    if (quantityAvailable > 0) positiveStockProducts += 1
    else if (quantityAvailable < 0) negativeStockProducts += 1
    else zeroStockProducts += 1

    const weightedCost = inventory && inventory.quantityRemaining > 0 && inventory.inventoryValue > 0
      ? inventory.inventoryValue / inventory.quantityRemaining
      : inventory?.unitCosts[0] ?? null
    const rawData = product.raw_data && typeof product.raw_data === 'object' && !Array.isArray(product.raw_data)
      ? product.raw_data as Record<string, unknown>
      : {}

    return {
      ...product,
      purchase_cost: weightedCost ?? product.purchase_cost,
      stock_quantity: quantityAvailable,
      raw_data: {
        ...rawData,
        inventory: {
          found: Boolean(inventory),
          quantity_remaining: inventory?.quantityRemaining ?? 0,
          quantity_available: quantityAvailable,
          quantity_blocked: inventory?.quantityBlocked ?? 0,
          weighted_unit_cost: weightedCost,
          inventory_value: inventory?.inventoryValue ?? 0,
          depots: inventory
            ? Array.from(inventory.depots, ([name, values]) => ({ name, ...values }))
            : [],
        },
      },
    } satisfies WolvoxCatalogInput
  })

  const summary: WolvoxInventoryMergeSummary = {
    catalogProducts: products.length,
    inventoryRows: inventoryRecords.length,
    inventoryProducts: aggregates.size,
    matchedProducts,
    catalogWithoutInventory: products.length - matchedProducts,
    inventoryWithoutCatalog: Array.from(aggregates.keys()).filter(id => !catalogIds.has(id)).length,
    productsInMultipleDepots,
    positiveStockProducts,
    zeroStockProducts,
    negativeStockProducts,
  }

  return { products: merged, summary }
}

function numberOrZero(value: unknown) {
  return parseWolvoxNumber(value) ?? 0
}
