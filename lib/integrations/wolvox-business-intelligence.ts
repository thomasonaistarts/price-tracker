export type SalesChannel = 'store' | 'web' | 'marketplace' | 'unknown'

export interface InventoryMovementInput {
  externalProductId: string
  productName: string
  category?: string | null
  stockAvailable: number
  quantityOut: number
  quantityIn?: number
  inventoryValue?: number
  periodDays: number
}

export interface InventoryIntelligenceRow {
  externalProductId: string
  productName: string
  category: string | null
  stockAvailable: number
  unitsOut: number
  averageDailyUnitsOut: number
  estimatedDaysToStockout: number | null
  status: 'out_of_stock' | 'fast' | 'healthy' | 'slow' | 'dead'
  confidence: 'reported_movement' | 'insufficient_period'
}

export interface ChannelMappingRule {
  sourceField: 'depot_code' | 'branch_code' | 'document_series' | 'current_account_group'
  sourceValue: string
  channel: Exclude<SalesChannel, 'unknown'>
}

export interface ChannelEvidence {
  depotCode?: string | null
  branchCode?: string | null
  documentSeries?: string | null
  currentAccountGroup?: string | null
}

export interface DailyFinancialInput {
  summaryDate: string
  purchaseTotal: number
  purchaseReturnTotal: number
  salesTotal: number
  salesReturnTotal: number
}

export interface FinancialSummary {
  purchaseTotal: number
  purchaseReturnTotal: number
  netPurchaseTotal: number
  salesTotal: number
  salesReturnTotal: number
  netSalesTotal: number
  grossProfitBeforeExpenses: number
  days: number
}

export interface InventoryCostSnapshot {
  externalProductId: string
  productName: string
  snapshotAt: string
  unitCost: number | null
}

export interface InventoryCostChange {
  externalProductId: string
  productName: string
  previousCost: number
  currentCost: number
  changePercent: number
  snapshotAt: string
}

export interface SalesDocumentSummaryInput {
  channel: SalesChannel
  documentType: 'sale' | 'purchase' | 'sale_return' | 'purchase_return'
  netTotal: number
}

const finite = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export function buildInventoryIntelligence(
  rows: InventoryMovementInput[],
): InventoryIntelligenceRow[] {
  return rows.map(row => {
    const periodDays = Math.max(0, finite(row.periodDays))
    const quantityOut = Math.max(0, finite(row.quantityOut))
    const stockAvailable = finite(row.stockAvailable)
    const averageDailyUnitsOut = periodDays > 0 ? quantityOut / periodDays : 0
    const estimatedDaysToStockout = stockAvailable > 0 && averageDailyUnitsOut > 0
      ? stockAvailable / averageDailyUnitsOut
      : null

    let status: InventoryIntelligenceRow['status']
    if (stockAvailable <= 0) status = 'out_of_stock'
    else if (quantityOut <= 0) status = 'dead'
    else if (estimatedDaysToStockout !== null && estimatedDaysToStockout <= 30) status = 'fast'
    else if (estimatedDaysToStockout !== null && estimatedDaysToStockout >= 180) status = 'slow'
    else status = 'healthy'
    const confidence: InventoryIntelligenceRow['confidence'] = periodDays > 0
      ? 'reported_movement'
      : 'insufficient_period'

    return {
      externalProductId: row.externalProductId,
      productName: row.productName,
      category: row.category ?? null,
      stockAvailable,
      unitsOut: quantityOut,
      averageDailyUnitsOut,
      estimatedDaysToStockout,
      status,
      confidence,
    }
  }).sort((a, b) =>
    b.averageDailyUnitsOut - a.averageDailyUnitsOut
    || (a.estimatedDaysToStockout ?? Number.POSITIVE_INFINITY)
      - (b.estimatedDaysToStockout ?? Number.POSITIVE_INFINITY)
  )
}

export function attributeSalesChannel(
  evidence: ChannelEvidence,
  rules: ChannelMappingRule[],
): SalesChannel {
  const values: Record<ChannelMappingRule['sourceField'], string> = {
    depot_code: evidence.depotCode?.trim() ?? '',
    branch_code: evidence.branchCode?.trim() ?? '',
    document_series: evidence.documentSeries?.trim() ?? '',
    current_account_group: evidence.currentAccountGroup?.trim() ?? '',
  }

  const matches = rules.filter(rule =>
    values[rule.sourceField].toLocaleLowerCase('tr-TR')
      === rule.sourceValue.trim().toLocaleLowerCase('tr-TR')
  )
  const channels = new Set(matches.map(match => match.channel))
  return channels.size === 1 ? matches[0].channel : 'unknown'
}

export function calculateNetSales(input: {
  salesTotal: number
  salesReturnTotal: number
}) {
  return Math.round((finite(input.salesTotal) - finite(input.salesReturnTotal)) * 100) / 100
}

export function summarizeFinancials(rows: DailyFinancialInput[]): FinancialSummary {
  const unique = new Map<string, DailyFinancialInput>()
  for (const row of rows) {
    if (!unique.has(row.summaryDate)) unique.set(row.summaryDate, row)
  }
  const totals = Array.from(unique.values()).reduce((sum, row) => ({
    purchaseTotal: sum.purchaseTotal + finite(row.purchaseTotal),
    purchaseReturnTotal: sum.purchaseReturnTotal + finite(row.purchaseReturnTotal),
    salesTotal: sum.salesTotal + finite(row.salesTotal),
    salesReturnTotal: sum.salesReturnTotal + finite(row.salesReturnTotal),
  }), {
    purchaseTotal: 0,
    purchaseReturnTotal: 0,
    salesTotal: 0,
    salesReturnTotal: 0,
  })
  const netPurchaseTotal = totals.purchaseTotal - totals.purchaseReturnTotal
  const netSalesTotal = totals.salesTotal - totals.salesReturnTotal
  return {
    ...Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, Math.round(value * 100) / 100]),
    ) as typeof totals,
    netPurchaseTotal: Math.round(netPurchaseTotal * 100) / 100,
    netSalesTotal: Math.round(netSalesTotal * 100) / 100,
    grossProfitBeforeExpenses: Math.round((netSalesTotal - netPurchaseTotal) * 100) / 100,
    days: unique.size,
  }
}

export function detectInventoryCostChanges(
  snapshots: InventoryCostSnapshot[],
  minimumAbsolutePercent = 0.01,
): InventoryCostChange[] {
  const grouped = new Map<string, InventoryCostSnapshot[]>()
  for (const snapshot of snapshots) {
    if (snapshot.unitCost == null || !Number.isFinite(snapshot.unitCost) || snapshot.unitCost <= 0) continue
    const rows = grouped.get(snapshot.externalProductId) ?? []
    rows.push(snapshot)
    grouped.set(snapshot.externalProductId, rows)
  }
  const result: InventoryCostChange[] = []
  for (const [externalProductId, rows] of Array.from(grouped.entries())) {
    rows.sort((a, b) => new Date(b.snapshotAt).getTime() - new Date(a.snapshotAt).getTime())
    const current = rows[0]
    const previous = rows.find(row =>
      row.snapshotAt !== current.snapshotAt && row.unitCost !== current.unitCost
    )
    if (!previous?.unitCost || !current.unitCost) continue
    const changePercent = ((current.unitCost - previous.unitCost) / previous.unitCost) * 100
    if (Math.abs(changePercent) < minimumAbsolutePercent) continue
    result.push({
      externalProductId,
      productName: current.productName,
      previousCost: previous.unitCost,
      currentCost: current.unitCost,
      changePercent: Math.round(changePercent * 100) / 100,
      snapshotAt: current.snapshotAt,
    })
  }
  return result.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
}

export function summarizeSalesChannels(rows: SalesDocumentSummaryInput[]) {
  const channels: SalesChannel[] = ['store', 'web', 'marketplace', 'unknown']
  return channels.map(channel => {
    const channelRows = rows.filter(row => row.channel === channel)
    const sales = channelRows
      .filter(row => row.documentType === 'sale')
      .reduce((sum, row) => sum + finite(row.netTotal), 0)
    const returns = channelRows
      .filter(row => row.documentType === 'sale_return')
      .reduce((sum, row) => sum + finite(row.netTotal), 0)
    return {
      channel,
      documents: channelRows.length,
      netSales: Math.round((sales - returns) * 100) / 100,
    }
  })
}
