import type { ScrapedPrice } from './types'
import { assertScraperResponse, proxiedUrl } from './proxy'
import { extractSchemaOfferMetadata } from './metadata'
import { parseMarketplacePrice } from './price'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
}

export async function scrapePttavm(query: string, signal?: AbortSignal): Promise<ScrapedPrice[]> {
  try {
    const url = `https://www.pttavm.com/arama?q=${encodeURIComponent(query)}`
    const res = await fetch(proxiedUrl(url), { headers: HEADERS, cache: 'no-store', signal })
    await assertScraperResponse(res)

    const html = await res.text()
    const results: ScrapedPrice[] = []

    // JSON-LD ItemList — PTTAvm arama sonuçlarını schema.org formatında sunuyor
    const ldPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    let m
    while ((m = ldPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(m[1])
        if (data['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement)) continue

        for (const item of data.itemListElement.slice(0, 8)) {
          const product = item?.item
          if (!product) continue

          const rawPrice = product?.offers?.price ?? 0
          const price = parseMarketplacePrice(rawPrice)
          if (!price || price <= 0 || price > 10_000_000) continue

          const name: string = product?.name ?? ''
          if (name.length < 10) continue

          results.push({
            site: 'PTTAvm',
            product_name: name,
            price,
            url: product?.url ?? url,
            currency: 'TRY',
            ...extractSchemaOfferMetadata(product.offers, price),
          })
        }
      } catch { /* devam */ }
    }

    return results
  } catch (error) {
    throw error
  }
}
