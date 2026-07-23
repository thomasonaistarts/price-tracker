import { canonicalProductKey, type WolvoxStagingProduct } from './wolvox-catalog.ts'
import type { WolvoxStagingDecision } from './wolvox-staging-decisions.ts'

export interface WolvoxProductDraft {
  user_id: string
  sku: string
  product_name: string
  brand: string | null
  category: string | null
  our_price: number
  purchase_cost: number | null
  vat_rate: number
  currency: 'TRY'
  is_active: boolean
  external_source: 'wolvox'
  external_id: string
  barcode: string | null
  stock_quantity: number | null
  stock_unit: string | null
}

export interface RejectedWolvoxProduct {
  external_id: string
  reasons: string[]
}

export interface WolvoxProductDraftOptions {
  decisions?: Record<string, WolvoxStagingDecision>
}

export function buildWolvoxProductDrafts(
  records: WolvoxStagingProduct[],
  ownerUserId: string,
  options: WolvoxProductDraftOptions = {},
) {
  const drafts: WolvoxProductDraft[] = []
  const rejected: RejectedWolvoxProduct[] = []
  const excluded: string[] = []
  let clearedBarcodeCount = 0
  const decisions = options.decisions ?? {}
  const includedRecords = records.filter(record => decisions[record.external_id] !== 'exclude')
  const barcodeCounts = new Map<string, number>()
  const destinationSkuCounts = new Map<string, number>()

  for (const record of includedRecords) {
    const barcodeKey = canonicalProductKey(record.barcode)
    const destinationSkuKey = canonicalProductKey(record.sku || record.barcode)
    if (barcodeKey) barcodeCounts.set(barcodeKey, (barcodeCounts.get(barcodeKey) ?? 0) + 1)
    if (destinationSkuKey) destinationSkuCounts.set(destinationSkuKey, (destinationSkuCounts.get(destinationSkuKey) ?? 0) + 1)
  }

  for (const record of records) {
    if (decisions[record.external_id] === 'exclude') {
      excluded.push(record.external_id)
      continue
    }

    const reasons = [...record.validation_errors]
    const destinationSku = record.sku || record.barcode
    const destinationSkuKey = canonicalProductKey(destinationSku)

    if (!ownerUserId) reasons.push('owner_user_id_missing')
    if (!destinationSku) reasons.push('destination_sku_missing')
    if (destinationSkuKey && (destinationSkuCounts.get(destinationSkuKey) ?? 0) > 1) reasons.push('destination_sku_duplicate')
    if (!record.product_name) reasons.push('product_name_missing')
    if (record.sales_price === null || record.sales_price <= 0) reasons.push('sales_price_required')
    if (record.vat_rate === null || record.vat_rate < 0 || record.vat_rate > 100) reasons.push('vat_rate_required')

    if (reasons.length) {
      rejected.push({ external_id: record.external_id, reasons: Array.from(new Set(reasons)) })
      continue
    }

    const barcode = record.barcode && (barcodeCounts.get(canonicalProductKey(record.barcode)) ?? 0) === 1
      ? record.barcode
      : null
    if (record.barcode && !barcode) clearedBarcodeCount += 1

    drafts.push({
      user_id: ownerUserId,
      sku: destinationSku!,
      product_name: record.product_name!,
      brand: record.brand,
      category: record.category,
      our_price: record.sales_price!,
      purchase_cost: record.purchase_cost,
      vat_rate: record.vat_rate!,
      currency: 'TRY',
      is_active: record.is_active,
      external_source: 'wolvox',
      external_id: record.external_id,
      barcode,
      stock_quantity: record.stock_quantity,
      stock_unit: record.unit_name,
    })
  }

  return {
    drafts,
    rejected,
    excluded,
    clearedBarcodeCount,
  }
}
