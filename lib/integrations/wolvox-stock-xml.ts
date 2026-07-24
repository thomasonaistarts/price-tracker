import type { WolvoxCatalogInput } from './wolvox-catalog.ts'
import { parseWolvoxReportXml, type WolvoxXmlRow } from './wolvox-report-xml.ts'

export type WolvoxStockSourceRow = WolvoxXmlRow

export interface WolvoxStockXmlResult {
  products: WolvoxCatalogInput[]
  sourceRowCount: number
  sourceFields: string[]
}

const STAGING_RAW_FIELDS = [
  'BLKODU',
  'STOKKODU',
  'BARKODU',
  'GTIN_NO',
  'STOK_ADI',
  'MARKASI',
  'URETICI_FIRMA',
  'GRUBU',
  'ARA_GRUBU',
  'ALT_GRUBU',
  'BIRIMI',
  'KDV_ORANI',
  'KSF1',
  'KAF1',
  'AKTIF',
  'WEBDE_GORUNSUN',
  'DEGISTIRME_TARIHI',
] as const

function normalizeIdentity(value: string | undefined) {
  return String(value ?? '').trim().replace(/[\s-]+/g, '').toLocaleUpperCase('tr-TR')
}

function looksLikeProductIdentity(
  value: string | undefined,
  source: WolvoxStockSourceRow,
): boolean {
  const normalized = normalizeIdentity(value)
  if (!normalized) return false
  if (/^\d{8,14}$/.test(normalized)) return true
  return [source.BARKODU, source.GTIN_NO, source.STOKKODU]
    .some(identity => normalizeIdentity(identity) === normalized)
}

export function selectWolvoxCategory(source: WolvoxStockSourceRow): string {
  return [source.GRUBU, source.ARA_GRUBU, source.ALT_GRUBU]
    .map(value => String(value ?? '').trim())
    .find(value => value && !looksLikeProductIdentity(value, source))
    ?? ''
}

export function parseWolvoxStockXml(xml: string): WolvoxStockXmlResult {
  let parsed
  try {
    parsed = parseWolvoxReportXml(xml)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.endsWith('_invalid_root')) throw new Error('wolvox_stock_xml_invalid_root')
    if (message.endsWith('_empty')) throw new Error('wolvox_stock_xml_empty')
    throw error
  }

  const products = parsed.rows.map(mapWolvoxStockRow)
  return {
    products,
    sourceRowCount: products.length,
    sourceFields: parsed.sourceFields,
  }
}

export function mapWolvoxStockRow(source: WolvoxStockSourceRow): WolvoxCatalogInput {
  const rawData: Record<string, string> = {}
  for (const field of STAGING_RAW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) rawData[field] = source[field]
  }

  return {
    external_id: source.BLKODU,
    sku: source.STOKKODU,
    barcode: source.BARKODU || source.GTIN_NO,
    product_name: source.STOK_ADI,
    brand: source.MARKASI || source.URETICI_FIRMA,
    category: selectWolvoxCategory(source),
    sales_price: source.KSF1,
    purchase_cost: source.KAF1,
    vat_rate: source.KDV_ORANI,
    stock_quantity: null,
    unit_name: source.BIRIMI,
    is_active: source.AKTIF,
    raw_data: rawData,
  }
}
