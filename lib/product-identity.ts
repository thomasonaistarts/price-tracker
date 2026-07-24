export type ProductSearchStrategy =
  | 'barcode'
  | 'sku_barcode'
  | 'brand_product_name'
  | 'product_name'

export interface ProductSearchQuery {
  query: string
  strategy: ProductSearchStrategy
}

export interface ProductSearchIdentity {
  barcode?: string | null
  sku?: string | null
  productName: string
  brand?: string | null
}

function normalizeBarcodeCandidate(value?: string | null): string | null {
  if (!value) return null
  const compact = value.trim().replace(/[\s-]+/g, '')
  return /^\d+$/.test(compact) ? compact : null
}

function normalizeQueryKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
}

function includesBrand(productName: string, brand: string): boolean {
  const normalizedName = normalizeQueryKey(productName)
  const normalizedBrand = normalizeQueryKey(brand)
  return normalizedBrand.length > 0 && normalizedName.includes(normalizedBrand)
}

export function isValidGtin(value?: string | null): boolean {
  const digits = normalizeBarcodeCandidate(value)
  if (!digits || ![8, 12, 13, 14].includes(digits.length)) return false

  const expectedCheckDigit = Number(digits[digits.length - 1])
  const body = digits.slice(0, -1)
  let sum = 0

  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1)
  }

  return (10 - (sum % 10)) % 10 === expectedCheckDigit
}

/**
 * Ürün için güven sırasına göre benzersiz arama sorguları üretir.
 *
 * İç WOLVOX SKU'su yalnızca geçerli bir GTIN ise barkod sorgusu olarak
 * kullanılabilir. Barkod bulunamazsa marka + ürün adı, son olarak ürün adı
 * denenir.
 */
export function buildProductSearchQueries(identity: ProductSearchIdentity): ProductSearchQuery[] {
  const queries: ProductSearchQuery[] = []
  const seen = new Set<string>()

  const add = (query: string, strategy: ProductSearchStrategy) => {
    const trimmed = query.trim().replace(/\s+/g, ' ')
    if (!trimmed) return
    const key = normalizeQueryKey(trimmed)
    if (seen.has(key)) return
    seen.add(key)
    queries.push({ query: trimmed, strategy })
  }

  const barcode = normalizeBarcodeCandidate(identity.barcode)
  if (barcode && isValidGtin(barcode)) add(barcode, 'barcode')

  const skuBarcode = normalizeBarcodeCandidate(identity.sku)
  if (skuBarcode && isValidGtin(skuBarcode)) add(skuBarcode, 'sku_barcode')

  const productName = identity.productName.trim().replace(/\s+/g, ' ')
  const brand = identity.brand?.trim().replace(/\s+/g, ' ') ?? ''
  if (brand && productName && !includesBrand(productName, brand)) {
    add(`${brand} ${productName}`, 'brand_product_name')
  }
  add(productName, 'product_name')

  return queries
}

/**
 * Eski tek-sorgu kullanan çağrılar için geriye uyumluluk yardımcısı.
 */
export function chooseProductSearchQuery(sku: string, productName: string): ProductSearchQuery {
  const selected = buildProductSearchQueries({ sku, productName })[0]
    ?? { query: productName.trim(), strategy: 'product_name' as const }
  return selected.strategy === 'sku_barcode'
    ? { ...selected, strategy: 'barcode' }
    : selected
}

export function searchStrategyNote(strategy: ProductSearchStrategy): string {
  switch (strategy) {
    case 'barcode':
      return 'Arama stratejisi: ürün barkodu'
    case 'sku_barcode':
      return 'Arama stratejisi: GTIN biçimindeki SKU'
    case 'brand_product_name':
      return 'Arama stratejisi: marka + ürün adı'
    default:
      return 'Arama stratejisi: ürün adı'
  }
}
