import type { ScrapedPrice } from './types'

// Apify "Trendyol Scraper | All-In-One" — fatihtahta/trendyol-scraper
// Actor ID: AoPP8ru9uKws5t80G
// Docs: https://apify.com/fatihtahta/trendyol-scraper
// Pricing: $1 / 1.000 sonuç
const ACTOR_ID = 'fatihtahta~trendyol-scraper'
const APIFY_TIMEOUT_S = 40  // run-sync max bekleme süresi

export async function scrapeTrendyol(query: string): Promise<ScrapedPrice[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) return []

  const searchUrl = `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}`

  try {
    // run-sync-get-dataset-items: tek çağrıda çalıştır + sonuçları döndür
    const url =
      `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
      `?token=${token}&timeout=${APIFY_TIMEOUT_S}&format=json`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: [query],
        limit: 10,           // minimum 10 (actor şartı), 8'ini kullanacağız
        enrich_data: false,  // temel veriler yeterli, daha hızlı
        getReviews: false,
        getQna: false,
      }),
    })

    if (!res.ok) {
      console.error('[Trendyol/Apify] HTTP', res.status, await res.text().catch(() => ''))
      return []
    }

    const items: unknown[] = await res.json()
    if (!Array.isArray(items) || items.length === 0) return []

    return items.slice(0, 8).flatMap((item): ScrapedPrice[] => {
      const p = item as Record<string, unknown>

      // Fiyat: pricing.current_price (ana alan) → pricing.price.current (yedek)
      const pricing = (p.pricing ?? {}) as Record<string, unknown>
      const priceNested = (pricing.price ?? {}) as Record<string, unknown>
      const rawPrice =
        pricing.current_price ??
        priceNested.current ??
        priceNested.discounted_price ??
        0
      const price = Number(rawPrice)
      if (price <= 0 || price > 100_000_000) return []

      const name = String(p.title ?? p.name ?? p.displayName ?? '')
      if (name.length < 5) return []

      const productUrl = String(p.url ?? p.link ?? searchUrl)

      return [{
        site: 'Trendyol',
        product_name: name,
        price,
        url: productUrl.startsWith('http') ? productUrl : `https://www.trendyol.com${productUrl}`,
        currency: 'TRY',
      }]
    })
  } catch (err) {
    console.error('[Trendyol/Apify] error:', err)
    return []
  }
}
