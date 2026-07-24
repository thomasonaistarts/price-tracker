import type { ScrapedPrice } from './types'
import { assertScraperResponse, proxiedUrl } from './proxy'
import { extractSchemaOfferMetadata } from './metadata'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
}

function parseN11Html(html: string, query: string): ScrapedPrice[] {
  const results: ScrapedPrice[] = []
  const searchUrl = `https://www.n11.com/arama?q=${encodeURIComponent(query)}`

  // JSON-LD — en güvenilir yöntem
  const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  let jMatch: RegExpExecArray | null
  while ((jMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(jMatch[1])
      if (json['@type'] === 'ItemList' && Array.isArray(json.itemListElement)) {
        for (const el of json.itemListElement.slice(0, 8)) {
          const item = el.item ?? el
          // price string ("17.999,00") veya number olabilir
          const rawPrice = item?.offers?.price ?? item?.offers?.lowPrice ?? 0
          const price = typeof rawPrice === 'string'
            ? parseFloat(rawPrice.replace(/\./g, '').replace(',', '.'))
            : Number(rawPrice)
          if (price > 0) {
            results.push({
              site: 'N11',
              product_name: item.name ?? '',
              price,
              url: item.url ?? searchUrl,
              currency: 'TRY',
              ...extractSchemaOfferMetadata(item.offers, price),
            })
          }
        }
      }
    } catch { }
  }
  if (results.length > 0) return results

  // N11 JSON blob: displayPrice sonrasında URL ve title arar
  // Yapı: {..., "displayPrice":399, ...(~2000 char)..., "title":"X", "url":"/urun/x-123", "urlWithoutSellerShop":"/urun/x-123"}
  const dpPattern = /"displayPrice"\s*:\s*(\d+)/g
  let m: RegExpExecArray | null
  while ((m = dpPattern.exec(html)) !== null && results.length < 8) {
    const price = parseInt(m[1], 10)
    if (price <= 0 || price > 10_000_000) continue

    // displayPrice'dan sonra 5000 char — URL ve ürün adı buradadır
    const after = html.slice(m.index + m[0].length, m.index + m[0].length + 5000)

    // urlWithoutSellerShop: "/urun/product-name-12345" (satıcı filtresi olmadan)
    const urlMatch =
      /"urlWithoutSellerShop"\s*:\s*"(\/urun\/[^"]+)"/.exec(after) ??
      /"url"\s*:\s*"(\/urun\/[^"]+)"/.exec(after)
    const productUrl = urlMatch ? `https://www.n11.com${urlMatch[1]}` : searchUrl

    const titleMatch =
      /"title"\s*:\s*"([^"]{10,150})"/.exec(after) ??
      /"subtitle"\s*:\s*"([^"]{10,150})"/.exec(after) ??
      /"productName"\s*:\s*"([^"]{10,150})"/.exec(after) ??
      /"displayName"\s*:\s*"([^"]{10,150})"/.exec(after) ??
      /"name"\s*:\s*"([^"]{25,150})"/.exec(after)

    if (titleMatch) {
      results.push({ site: 'N11', product_name: titleMatch[1], price, url: productUrl, currency: 'TRY' })
    }
  }
  if (results.length > 0) return results

  // Son çare: name geriye bak
  const revPattern = /"name"\s*:\s*"([^"]{10,150})"[\s\S]{0,2000}?"displayPrice"\s*:\s*(\d+)/g
  while ((m = revPattern.exec(html)) !== null && results.length < 8) {
    const price = parseInt(m[2], 10)
    if (price > 0 && price < 10_000_000)
      results.push({ site: 'N11', product_name: m[1], price, url: searchUrl, currency: 'TRY' })
  }
  return results
}

export async function scrapeN11(query: string, signal?: AbortSignal): Promise<ScrapedPrice[]> {
  try {
    const url = `https://www.n11.com/arama?q=${encodeURIComponent(query)}`
    const res = await fetch(proxiedUrl(url), { headers: HEADERS, cache: 'no-store', signal })
    await assertScraperResponse(res)
    const html = await res.text()
    return parseN11Html(html, query)
  } catch (error) {
    throw error
  }
}
