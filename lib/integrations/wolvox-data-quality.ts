import type { WolvoxStagingProduct } from './wolvox-catalog'

export interface WolvoxCatalogQuality {
  total: number
  missingBarcode: number
  missingBrand: number
  missingCategory: number
  suspiciousCategory: number
  invalid: number
  identityReadyPercent: number
}

function suspiciousCategory(record: WolvoxStagingProduct): boolean {
  const category = String(record.category ?? '').replace(/[\s-]+/g, '').toLocaleUpperCase('tr-TR')
  if (!category) return false
  if (/^\d{8,14}$/.test(category)) return true
  return [record.barcode, record.sku]
    .some(value => String(value ?? '').replace(/[\s-]+/g, '').toLocaleUpperCase('tr-TR') === category)
}

export function assessWolvoxCatalogQuality(
  records: WolvoxStagingProduct[],
): WolvoxCatalogQuality {
  const identityReady = records.filter(record =>
    Boolean(record.product_name && (record.barcode || record.brand))
  ).length

  return {
    total: records.length,
    missingBarcode: records.filter(record => !record.barcode).length,
    missingBrand: records.filter(record => !record.brand).length,
    missingCategory: records.filter(record => !record.category).length,
    suspiciousCategory: records.filter(suspiciousCategory).length,
    invalid: records.filter(record => record.validation_errors.length > 0).length,
    identityReadyPercent: records.length
      ? Math.round((identityReady / records.length) * 10_000) / 100
      : 0,
  }
}
