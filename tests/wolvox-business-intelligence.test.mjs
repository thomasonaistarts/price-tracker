import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attributeSalesChannel,
  buildInventoryIntelligence,
  calculateNetSales,
  detectInventoryCostChanges,
  summarizeFinancials,
  summarizeSalesChannels,
} from '../lib/integrations/wolvox-business-intelligence.ts'

test('inventory intelligence ranks fast-moving products and estimates stockout', () => {
  const rows = buildInventoryIntelligence([
    {
      externalProductId: 'slow',
      productName: 'Yavaş ürün',
      stockAvailable: 100,
      quantityOut: 10,
      periodDays: 30,
    },
    {
      externalProductId: 'fast',
      productName: 'Hızlı ürün',
      stockAvailable: 8,
      quantityOut: 60,
      periodDays: 30,
    },
  ])

  assert.equal(rows[0].externalProductId, 'fast')
  assert.equal(rows[0].averageDailyUnitsOut, 2)
  assert.equal(rows[0].estimatedDaysToStockout, 4)
  assert.equal(rows[0].status, 'fast')
  assert.equal(rows[1].status, 'slow')
})

test('positive stock without reported outbound movement is dead stock', () => {
  const [row] = buildInventoryIntelligence([{
    externalProductId: 'dead',
    productName: 'Hareketsiz ürün',
    stockAvailable: 12,
    quantityOut: 0,
    periodDays: 90,
  }])
  assert.equal(row.status, 'dead')
  assert.equal(row.estimatedDaysToStockout, null)
})

test('sales channel stays unknown without one unambiguous explicit mapping', () => {
  const rules = [
    { sourceField: 'depot_code', sourceValue: 'MERKEZ', channel: 'store' },
    { sourceField: 'document_series', sourceValue: 'WEB', channel: 'web' },
  ]
  assert.equal(attributeSalesChannel({ depotCode: 'MERKEZ' }, rules), 'store')
  assert.equal(attributeSalesChannel({ depotCode: 'MERKEZ', documentSeries: 'WEB' }, rules), 'unknown')
  assert.equal(attributeSalesChannel({ branchCode: '001' }, rules), 'unknown')
})

test('returns are removed from gross sales', () => {
  assert.equal(calculateNetSales({ salesTotal: 1250.25, salesReturnTotal: 150.1 }), 1100.15)
})

test('financial summary deduplicates daily revisions and subtracts returns', () => {
  const summary = summarizeFinancials([
    {
      summaryDate: '2026-07-22',
      purchaseTotal: 1100,
      purchaseReturnTotal: 50,
      salesTotal: 2000,
      salesReturnTotal: 100,
    },
    {
      summaryDate: '2026-07-22',
      purchaseTotal: 1000,
      purchaseReturnTotal: 50,
      salesTotal: 1800,
      salesReturnTotal: 100,
    },
  ])
  assert.equal(summary.days, 1)
  assert.equal(summary.netPurchaseTotal, 1050)
  assert.equal(summary.netSalesTotal, 1900)
  assert.equal(summary.grossProfitBeforeExpenses, 850)
})

test('inventory cost changes compare distinct snapshots per product', () => {
  const changes = detectInventoryCostChanges([
    { externalProductId: '1', productName: 'Kalem', snapshotAt: '2026-07-24T10:00:00Z', unitCost: 120 },
    { externalProductId: '1', productName: 'Kalem', snapshotAt: '2026-07-23T10:00:00Z', unitCost: 100 },
    { externalProductId: '2', productName: 'Defter', snapshotAt: '2026-07-24T10:00:00Z', unitCost: 50 },
  ])
  assert.equal(changes.length, 1)
  assert.equal(changes[0].changePercent, 20)
})

test('channel summary keeps unknown sales visible and removes returns', () => {
  const rows = summarizeSalesChannels([
    { channel: 'store', documentType: 'sale', netTotal: 1000 },
    { channel: 'store', documentType: 'sale_return', netTotal: 100 },
    { channel: 'unknown', documentType: 'sale', netTotal: 500 },
  ])
  assert.equal(rows.find(row => row.channel === 'store')?.netSales, 900)
  assert.equal(rows.find(row => row.channel === 'unknown')?.netSales, 500)
})
