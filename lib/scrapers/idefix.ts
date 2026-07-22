import type { ScrapedPrice } from './types'
import { assertScraperResponse, proxiedUrl } from './proxy'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
}

export async function scrapeIdefix(query: string): Promise<ScrapedPrice[]> {
  try {
    const url = `https://www.idefix.com/arama?q=${encodeURIComponent(query)}`
    const res = await fetch(proxiedUrl(url), { headers: HEADERS, cache: 'no-store' })
    await assertScraperResponse(res)

    const html = await res.text()

    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!nextMatch) return []

    const nd = JSON.parse(nextMatch[1])
    const items: any[] = nd?.props?.pageProps?.data?.searchResult?.items ?? []
    if (!Array.isArray(items) || items.length === 0) return []

    const results: ScrapedPrice[] = []

    for (const item of items.slice(0, 8)) {
      const variants: any[] = item?.variants ?? []
      if (variants.length === 0) continue

      // Tüm varyantlar arasında en düşük fiyatlı olanı al
      let bestVariant: any = null
      let bestPrice = Infinity
      for (const v of variants) {
        const p = v?.discountedSalesPrice ?? v?.price ?? 0
        if (p > 0 && p < bestPrice) { bestPrice = p; bestVariant = v }
      }
      if (!bestVariant) continue

      const price = Math.round(bestPrice)
      const name: string = bestVariant?.name ?? bestVariant?.originalName ?? ''
      const handleUrl: string = bestVariant?.handleUrl ?? ''

      if (price <= 0 || price > 10_000_000) continue
      if (name.length < 10) continue

      results.push({
        site: 'İdefix',
        product_name: name,
        price,
        url: `https://www.idefix.com${handleUrl}`,
        currency: 'TRY',
      })
    }

    return results
  } catch (error) {
    throw error
  }
}
