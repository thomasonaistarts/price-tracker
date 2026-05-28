import { scrapeHepsiburada } from './hepsiburada'
import { scrapeN11 } from './n11'
import { scrapePttavm } from './pttavm'
import { scrapeIdefix } from './idefix'
import { scrapeTrendyol } from './trendyol'
import { matchProduct, calcUnitPrice, type ConfidenceThresholds, DEFAULT_CONFIDENCE_THRESHOLDS } from './similarity'
import type { ScrapedPrice } from './types'

export type { ScrapedPrice }

const TIMEOUT_MS = 55000

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
  ])
}

export { type ConfidenceThresholds, DEFAULT_CONFIDENCE_THRESHOLDS }

export async function scrapeAllPlatforms(
  query: string,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): Promise<ScrapedPrice[]> {
  const [hepsiburada, n11, pttavm, idefix, trendyol] = await Promise.all([
    withTimeout(scrapeHepsiburada(query), []),
    withTimeout(scrapeN11(query), []),
    withTimeout(scrapePttavm(query), []),
    withTimeout(scrapeIdefix(query), []),
    withTimeout(scrapeTrendyol(query), []),
  ])

  const all = [...hepsiburada, ...n11, ...pttavm, ...idefix, ...trendyol]

  const results: ScrapedPrice[] = []

  for (const item of all) {
    const mr = matchProduct(query, item.product_name, thresholds)

    // Rejected → atla
    if (mr.confidence === 'rejected') continue

    const enriched: ScrapedPrice = {
      ...item,
      confidence: mr.confidence,
      matchScore: mr.score,
      matchReasons: mr.reasons,
    }

    // Miktar oranı varsa → birim fiyat hesapla (ekran boyutu için birim fiyat hesaplanmaz)
    if (
      mr.candidateBaseQty &&
      mr.candidateBaseQty > 0 &&
      mr.unitType &&
      mr.unitType !== 'screen' &&
      mr.quantityRatio !== null
    ) {
      enriched.quantityRatio = mr.quantityRatio
      if (mr.quantityRatio !== 1) {
        // Farklı miktarlar → birim fiyat göster
        const { unitPrice, label } = calcUnitPrice(item.price, mr.candidateBaseQty, mr.unitType as 'weight' | 'volume' | 'count' | 'length')
        enriched.unitPrice = unitPrice
        enriched.unitPriceLabel = label
      }
    }

    results.push(enriched)
  }

  // Her site × güven seviyesi için sadece en ucuz ürünü tut
  const deduped = cheapestPerSiteAndConfidence(results)

  // Piyasa medyanının %50'sinin altındaki fiyatları at (yanlış ürün eşleşmesi temizliği)
  return filterPriceOutliers(deduped)
}

/**
 * Piyasa medyanının %50'sinden düşük fiyatları eler.
 * Örnek: medyan ₺12.000 ise → ₺6.000 altı fiyatlar atılır.
 * Çok az sonuç varsa (<3) filtreleme uygulanmaz.
 */
function filterPriceOutliers(items: ScrapedPrice[]): ScrapedPrice[] {
  if (items.length < 3) return items
  const sorted = [...items].map(i => i.price).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const floor = median * 0.5
  return items.filter(i => i.price >= floor)
}

/**
 * site + confidence kombinasyonu başına en düşük fiyatlı ürünü döndürür.
 * Örnek: N11'de 3 HIGH sonuç varsa → en ucuz 1 tanesi kalır.
 */
function cheapestPerSiteAndConfidence(items: ScrapedPrice[]): ScrapedPrice[] {
  const map = new Map<string, ScrapedPrice>()
  for (const item of items) {
    const key = `${item.site}|${item.confidence ?? 'high'}`
    const existing = map.get(key)
    if (!existing || item.price < existing.price) {
      map.set(key, item)
    }
  }
  return Array.from(map.values())
}
