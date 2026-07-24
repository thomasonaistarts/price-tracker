import type { ScrapedPrice } from './types'
import { assertScraperResponse, proxiedUrl } from './proxy'
import { extractGenericCommerceMetadata, mergeCommerceMetadata } from './metadata'
import { parseMarketplacePrice } from './price'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
}

export async function scrapeIdefix(query: string, signal?: AbortSignal): Promise<ScrapedPrice[]> {
  try {
    const url = `https://www.idefix.com/arama?q=${encodeURIComponent(query)}`
    const res = await fetch(proxiedUrl(url), { headers: HEADERS, cache: 'no-store', signal })
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

      // Varyantları merkezi ürün eşleştiriciye ayrı adaylar olarak gönder.
      // En ucuz fakat yanlış varyantın doğru ürünü gölgelemesini engeller.
      for (const variant of variants) {
        const price = parseMarketplacePrice(
          variant?.discountedSalesPrice ?? variant?.price ?? 0
        )
        const name: string = variant?.name ?? variant?.originalName ?? ''
        const handleUrl: string = variant?.handleUrl ?? ''

        if (!price || price <= 0 || price > 10_000_000) continue
        if (name.length < 10) continue

        results.push({
          site: 'İdefix',
          product_name: name,
          price,
          url: `https://www.idefix.com${handleUrl}`,
          currency: 'TRY',
          ...mergeCommerceMetadata(
            extractGenericCommerceMetadata(variant, price),
            extractGenericCommerceMetadata(item, price),
          ),
        })

        if (results.length >= 12) break
      }
      if (results.length >= 12) break
    }

    return results
  } catch (error) {
    throw error
  }
}
