export type ProductSearchStrategy =
  | 'barcode'
  | 'sku_barcode'
  | 'brand_product_name'
  | 'product_name'
  | 'identity_terms'

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

function foldSearchToken(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const DISCOVERY_FILLER_TOKENS = new Set([
  'adet',
  'cocuk',
  'erkek',
  'girl',
  'junior',
  'kids',
  'kiz',
  'lisansli',
  'mini',
  'model',
  'modeli',
  'orijinal',
  'renkli',
  'standart',
  'the',
  'urun',
  'yeni',
])

const PRODUCT_TYPE_PHRASES = [
  ['anaokul', 'cantasi'],
  ['beslenme', 'cantasi'],
  ['boya', 'kalemi'],
  ['boyama', 'kitabi'],
  ['dolma', 'kalem'],
  ['keceli', 'kalem'],
  ['kursun', 'kalem'],
  ['marker', 'seti'],
  ['not', 'defteri'],
  ['okul', 'cantasi'],
  ['oyun', 'seti'],
  ['resim', 'defteri'],
  ['sirt', 'cantasi'],
  ['kalemlik'],
  ['kitap'],
] as const

function searchWords(value: string): Array<{ original: string; folded: string }> {
  const matches = value.match(
    /[0-9A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]+(?:[-./][0-9A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]+)*/g,
  ) ?? []
  return matches
    .map(original => ({
      original,
      folded: foldSearchToken(original),
    }))
    .filter(word => word.folded.length > 0)
}

/**
 * Pazaryeri aramasında gereksiz boşluk ve ayraçları temizler. Bu fonksiyon
 * model numaralarını veya ürün tipini silmez; yalnızca sorguyu kararlı hale
 * getirir. Eşleşme doğrulaması her zaman ürünün tam adıyla yapılır.
 */
export function normalizeProductNameForSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tam isim sonuç vermediğinde kullanılacak kısa keşif sorgusunu üretir.
 * Marka/ilk kimlik kelimesi, model-seri kelimeleri ve ürün tipi korunur;
 * "junior", "kids", "yeni" gibi aramayı gereksiz daraltan kelimeler atılır.
 */
export function buildIdentityTermsQuery(productName: string, brand?: string | null): string {
  const normalizedName = normalizeProductNameForSearch(productName)
  const nameWords = searchWords(normalizedName)
  const brandWords = searchWords(brand ?? '')
  const typeIndexes = new Set<number>()
  const selected: Array<{ original: string; folded: string }> = []
  const seen = new Set<string>()

  const addWord = (word: { original: string; folded: string }) => {
    if (!word.folded || seen.has(word.folded)) return
    seen.add(word.folded)
    selected.push(word)
  }

  for (const phrase of PRODUCT_TYPE_PHRASES) {
    for (let start = 0; start <= nameWords.length - phrase.length; start += 1) {
      if (phrase.every((token, offset) => nameWords[start + offset]?.folded === token)) {
        for (let offset = 0; offset < phrase.length; offset += 1) {
          typeIndexes.add(start + offset)
        }
      }
    }
  }

  for (const word of brandWords) addWord(word)
  if (brandWords.length === 0 && nameWords[0]) addWord(nameWords[0])

  for (let index = 0; index < nameWords.length; index += 1) {
    const word = nameWords[index]
    if (DISCOVERY_FILLER_TOKENS.has(word.folded)) continue
    if (typeIndexes.has(index)) continue
    addWord(word)
  }

  for (const index of Array.from(typeIndexes).sort((a, b) => a - b)) {
    addWord(nameWords[index])
  }

  return selected.map(word => word.original).join(' ')
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

  const productName = normalizeProductNameForSearch(identity.productName)
  const brand = normalizeProductNameForSearch(identity.brand ?? '')
  if (brand && productName && !includesBrand(productName, brand)) {
    add(`${brand} ${productName}`, 'brand_product_name')
  }
  add(productName, 'product_name')
  add(buildIdentityTermsQuery(productName, brand), 'identity_terms')

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
    case 'identity_terms':
      return 'Arama stratejisi: ayırt edici isim ve ürün tipi'
    default:
      return 'Arama stratejisi: ürün adı'
  }
}
