export type ProductSearchStrategy = 'barcode' | 'product_name'

export interface ProductSearchQuery {
  query: string
  strategy: ProductSearchStrategy
}

function normalizeBarcodeCandidate(value: string): string | null {
  const compact = value.trim().replace(/[\s-]+/g, '')
  return /^\d+$/.test(compact) ? compact : null
}

export function isValidGtin(value: string): boolean {
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

export function chooseProductSearchQuery(sku: string, productName: string): ProductSearchQuery {
  const barcode = normalizeBarcodeCandidate(sku)
  if (barcode && isValidGtin(barcode)) {
    return { query: barcode, strategy: 'barcode' }
  }
  return { query: productName.trim(), strategy: 'product_name' }
}

export function searchStrategyNote(strategy: ProductSearchStrategy): string {
  return strategy === 'barcode'
    ? 'Arama stratejisi: barkod'
    : 'Arama stratejisi: ürün adı'
}
