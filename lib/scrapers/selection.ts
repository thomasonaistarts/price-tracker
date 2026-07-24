import type { ScrapedPrice } from './types.ts'

const CONFIDENCE_RANK: Record<NonNullable<ScrapedPrice['confidence']>, number> = {
  exact: 4,
  high: 3,
  medium: 2,
  low: 1,
}

function comparisonPrice(item: ScrapedPrice): number {
  return item.comparisonPrice ?? item.price
}

function isBetterOffer(candidate: ScrapedPrice, current: ScrapedPrice): boolean {
  const candidateRank = [
    candidate.manualDecision === 'approved' ? 1 : 0,
    CONFIDENCE_RANK[candidate.confidence ?? 'low'],
    candidate.matchScore ?? 0,
    candidate.inStock === true ? 1 : 0,
    candidate.officialSeller === true ? 1 : 0,
  ]
  const currentRank = [
    current.manualDecision === 'approved' ? 1 : 0,
    CONFIDENCE_RANK[current.confidence ?? 'low'],
    current.matchScore ?? 0,
    current.inStock === true ? 1 : 0,
    current.officialSeller === true ? 1 : 0,
  ]

  for (let index = 0; index < candidateRank.length; index += 1) {
    if (candidateRank[index] !== currentRank[index]) {
      return candidateRank[index] > currentRank[index]
    }
  }

  return comparisonPrice(candidate) < comparisonPrice(current)
}

/**
 * Stok dışı teklifleri çıkarır ve her pazaryerinden yalnızca en güvenilir
 * teklifi bırakır. Fiyat yalnızca eşleşme kalitesi tamamen eşitse kullanılır.
 */
export function selectBestOfferPerPlatform(items: ScrapedPrice[]): ScrapedPrice[] {
  const selected = new Map<string, ScrapedPrice>()

  for (const item of items) {
    if (item.inStock === false) continue

    const existing = selected.get(item.site)
    if (!existing || isBetterOffer(item, existing)) {
      selected.set(item.site, item)
    }
  }

  return Array.from(selected.values())
}

/**
 * Piyasa medyanının belirlenen yüzdesinden düşük teklifleri eler.
 * Manuel onay fiyat aykırı değer kontrolünü aşabilir; stok filtresini aşamaz.
 */
export function filterLowPriceOutliers(
  items: ScrapedPrice[],
  lowerOutlierPct: number,
): ScrapedPrice[] {
  if (items.length < 3) return items

  const sorted = items
    .map(comparisonPrice)
    .sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const floor = median * Math.min(100, Math.max(1, lowerOutlierPct)) / 100

  return items.filter(item =>
    item.manualDecision === 'approved' || comparisonPrice(item) >= floor
  )
}
