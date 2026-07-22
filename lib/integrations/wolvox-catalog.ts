export interface WolvoxCatalogInput {
  external_id?: unknown
  sku?: unknown
  barcode?: unknown
  product_name?: unknown
  brand?: unknown
  category?: unknown
  sales_price?: unknown
  purchase_cost?: unknown
  vat_rate?: unknown
  stock_quantity?: unknown
  unit_name?: unknown
  is_active?: unknown
  raw_data?: unknown
}

export interface WolvoxStagingProduct {
  external_id: string
  sku: string | null
  barcode: string | null
  product_name: string | null
  brand: string | null
  category: string | null
  sales_price: number | null
  purchase_cost: number | null
  vat_rate: number | null
  stock_quantity: number | null
  unit_name: string | null
  is_active: boolean
  validation_errors: string[]
  raw_data: Record<string, unknown>
}

export interface CatalogPreparation {
  records: WolvoxStagingProduct[]
  receivedCount: number
  validCount: number
  invalidCount: number
  duplicateExternalIds: string[]
  duplicateRowCount: number
}

export interface ExistingCatalogProduct {
  id: string
  sku: string
  product_name: string
}

export type WolvoxMatchStatus = 'matched' | 'new' | 'conflict' | 'invalid'
export type WolvoxMatchMethod = 'barcode' | 'sku' | null

export interface WolvoxMatchPreview {
  external_id: string
  sku: string | null
  barcode: string | null
  product_name: string | null
  sales_price: number | null
  stock_quantity: number | null
  status: WolvoxMatchStatus
  method: WolvoxMatchMethod
  product_id: string | null
  current_product_name: string | null
  validation_errors: string[]
}

function textValue(value: unknown, maxLength = 500) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, maxLength) : null
}

export function canonicalProductKey(value: unknown) {
  return textValue(value, 200)?.toLocaleUpperCase('tr-TR').replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '') ?? ''
}

export function parseWolvoxNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  let normalized = String(value).trim().replace(/\s/g, '').replace(/₺|TL|TRY/gi, '')
  if (!normalized) return null

  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  if (comma > dot) normalized = normalized.replace(/\./g, '').replace(',', '.')
  else if (dot > comma && comma >= 0) normalized = normalized.replace(/,/g, '')
  else if (comma >= 0) normalized = normalized.replace(',', '.')

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = textValue(value)?.toLocaleLowerCase('tr-TR')
  if (!normalized) return true
  return !['0', 'false', 'hayır', 'hayir', 'pasif', 'inactive'].includes(normalized)
}

export function normalizeWolvoxProduct(input: WolvoxCatalogInput | unknown, rowIndex: number): WolvoxStagingProduct {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as WolvoxCatalogInput : {}
  const suppliedExternalId = textValue(source.external_id, 200)
  const sku = textValue(source.sku, 200)
  const barcode = textValue(source.barcode, 200)
  const productName = textValue(source.product_name)
  const salesPrice = parseWolvoxNumber(source.sales_price)
  const purchaseCost = parseWolvoxNumber(source.purchase_cost)
  const vatRate = parseWolvoxNumber(source.vat_rate)
  const stockQuantity = parseWolvoxNumber(source.stock_quantity)
  const validationErrors: string[] = []

  if (!suppliedExternalId) validationErrors.push('external_id_missing')
  if (!sku && !barcode) validationErrors.push('sku_or_barcode_missing')
  if (!productName) validationErrors.push('product_name_missing')
  if (source.sales_price !== null && source.sales_price !== undefined && source.sales_price !== '' && salesPrice === null) validationErrors.push('sales_price_invalid')
  if (salesPrice !== null && salesPrice < 0) validationErrors.push('sales_price_negative')
  if (source.purchase_cost !== null && source.purchase_cost !== undefined && source.purchase_cost !== '' && purchaseCost === null) validationErrors.push('purchase_cost_invalid')
  if (purchaseCost !== null && purchaseCost < 0) validationErrors.push('purchase_cost_negative')
  if (vatRate !== null && (vatRate < 0 || vatRate > 100)) validationErrors.push('vat_rate_out_of_range')
  if (source.stock_quantity !== null && source.stock_quantity !== undefined && source.stock_quantity !== '' && stockQuantity === null) validationErrors.push('stock_quantity_invalid')

  return {
    external_id: suppliedExternalId ?? `invalid-row-${rowIndex + 1}`,
    sku,
    barcode,
    product_name: productName,
    brand: textValue(source.brand, 200),
    category: textValue(source.category, 200),
    sales_price: salesPrice,
    purchase_cost: purchaseCost,
    vat_rate: vatRate,
    stock_quantity: stockQuantity,
    unit_name: textValue(source.unit_name, 50),
    is_active: booleanValue(source.is_active),
    validation_errors: validationErrors,
    raw_data: source.raw_data && typeof source.raw_data === 'object' && !Array.isArray(source.raw_data)
      ? source.raw_data as Record<string, unknown>
      : { ...source },
  }
}

export function prepareWolvoxCatalog(inputs: unknown[]): CatalogPreparation {
  const records = inputs.map(normalizeWolvoxProduct)
  const seen = new Map<string, WolvoxStagingProduct>()
  const duplicateExternalIds = new Set<string>()
  let duplicateRowCount = 0

  for (const record of records) {
    if (seen.has(record.external_id)) {
      duplicateRowCount += 1
      duplicateExternalIds.add(record.external_id)
      const first = seen.get(record.external_id)!
      if (!first.validation_errors.includes('external_id_duplicate')) first.validation_errors.push('external_id_duplicate')
      record.validation_errors.push('external_id_duplicate')
    }
    seen.set(record.external_id, record)
  }

  const uniqueRecords = Array.from(seen.values())
  return {
    records: uniqueRecords,
    receivedCount: inputs.length,
    validCount: uniqueRecords.filter(record => record.validation_errors.length === 0).length,
    invalidCount: uniqueRecords.filter(record => record.validation_errors.length > 0).length + duplicateRowCount,
    duplicateExternalIds: Array.from(duplicateExternalIds),
    duplicateRowCount,
  }
}

export function createWolvoxMatchPreview(staging: WolvoxStagingProduct[], products: ExistingCatalogProduct[]) {
  const productIndexes = new Map<string, ExistingCatalogProduct[]>()
  for (const product of products) {
    const key = canonicalProductKey(product.sku)
    if (!key) continue
    productIndexes.set(key, [...(productIndexes.get(key) ?? []), product])
  }

  return staging.map<WolvoxMatchPreview>(record => {
    if (record.validation_errors.length) {
      return previewResult(record, 'invalid', null, null)
    }

    const barcodeMatches = productIndexes.get(canonicalProductKey(record.barcode)) ?? []
    const skuMatches = productIndexes.get(canonicalProductKey(record.sku)) ?? []
    const matches = barcodeMatches.length ? barcodeMatches : skuMatches
    const method: WolvoxMatchMethod = barcodeMatches.length ? 'barcode' : skuMatches.length ? 'sku' : null

    if (matches.length > 1) return previewResult(record, 'conflict', method, null)
    if (matches.length === 1) return previewResult(record, 'matched', method, matches[0])
    return previewResult(record, 'new', null, null)
  })
}

function previewResult(
  record: WolvoxStagingProduct,
  status: WolvoxMatchStatus,
  method: WolvoxMatchMethod,
  product: ExistingCatalogProduct | null,
): WolvoxMatchPreview {
  return {
    external_id: record.external_id,
    sku: record.sku,
    barcode: record.barcode,
    product_name: record.product_name,
    sales_price: record.sales_price,
    stock_quantity: record.stock_quantity,
    status,
    method,
    product_id: product?.id ?? null,
    current_product_name: product?.product_name ?? null,
    validation_errors: record.validation_errors,
  }
}

export function summarizeWolvoxMatches(preview: WolvoxMatchPreview[]) {
  return preview.reduce((summary, item) => {
    summary[item.status] += 1
    return summary
  }, { matched: 0, new: 0, conflict: 0, invalid: 0 })
}
