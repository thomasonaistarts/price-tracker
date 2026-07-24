/**
 * Pazaryeri JSON verilerindeki sayı ve Türkçe/uluslararası fiyat metinlerini
 * kuruş kaybetmeden ortak number değerine dönüştürür.
 */
export function parseMarketplacePrice(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
  }

  const raw = String(value ?? '')
    .trim()
    .replace(/[^\d.,-]/g, '')
  if (!raw) return null

  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')
  let normalized = raw

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '')
  } else if (lastComma >= 0) {
    normalized = raw.replace(/\./g, '').replace(',', '.')
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null
}
