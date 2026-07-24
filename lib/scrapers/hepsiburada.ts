import type { ScrapedPrice } from './types.ts'
import { assertScraperResponse, proxiedUrl, ScraperProxyError } from './proxy.ts'
import { extractGenericCommerceMetadata, extractProductBarcode } from './metadata.ts'

const HEADERS_HTML = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
}

const HEADERS_JSON = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'Referer': 'https://www.hepsiburada.com/',
}

// Hepsiburada'nın iç API'si — React uygulaması bu endpoint'i çağırıyor
async function tryInternalApi(query: string, signal?: AbortSignal): Promise<ScrapedPrice[]> {
  const candidates = [
    `https://www.hepsiburada.com/search/api/product-listing/search?q=${encodeURIComponent(query)}&offset=0&limit=20&platform=hepsiburada`,
  ]

  for (const url of candidates) {
    try {
      const res = await fetch(proxiedUrl(url), {
        headers: HEADERS_JSON,
        cache: 'no-store',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(7_000)])
          : AbortSignal.timeout(7_000),
      })
      if (!res.ok) {
        try {
          await assertScraperResponse(res)
        } catch (error) {
          if (error instanceof ScraperProxyError && error.code === 'quota_exhausted') throw error
        }
        continue
      }
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('json')) continue
      const data = await res.json()
      const items: any[] =
        data?.products ?? data?.items ?? data?.data?.products ?? data?.result?.products ?? []
      if (!Array.isArray(items) || items.length === 0) continue
      return items.slice(0, 8).flatMap((item): ScrapedPrice[] => {
        const price = Number(item?.price ?? item?.salePrice ?? item?.listPrice ?? 0)
        if (price <= 0) return []
        const sku = item?.sku ?? item?.productGroupId ?? ''
        return [{
          site: 'Hepsiburada',
          product_name: item?.name ?? item?.displayName ?? query,
          price,
          url: sku ? `https://www.hepsiburada.com/${sku}-pm-${sku}` : `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`,
          currency: 'TRY',
          barcode: extractProductBarcode(item),
          ...extractGenericCommerceMetadata(item, price),
        }]
      })
    } catch (error) {
      if (error instanceof ScraperProxyError) throw error
    }
  }
  return []
}

// Render edilmiş sayfadaki window.__INITIAL_STATE__ veya benzeri JSON blob'ları
function extractEmbeddedState(html: string, query: string): ScrapedPrice[] {
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
    /window\.__REDUX_STATE__\s*=\s*({[\s\S]*?});/,
    /window\.HB\s*=\s*({[\s\S]*?});/,
    /__hb_data__\s*=\s*({[\s\S]*?});/,
  ]

  for (const pattern of patterns) {
    const m = html.match(pattern)
    if (!m) continue
    try {
      const state = JSON.parse(m[1])
      // Durum objesinde ürün listesini bul
      const searchResult =
        state?.search?.productListing ??
        state?.productListing ??
        state?.search ??
        null
      const items: any[] = searchResult?.products ?? searchResult?.items ?? []
      if (!Array.isArray(items) || items.length === 0) continue
      return items.slice(0, 8).flatMap((item): ScrapedPrice[] => {
        const price = Number(item?.price ?? item?.salePrice ?? 0)
        if (price <= 0) return []
        return [{
          site: 'Hepsiburada',
          product_name: item?.name ?? item?.displayName ?? query,
          price,
          url: item?.url ?? `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`,
          currency: 'TRY',
          barcode: extractProductBarcode(item),
          ...extractGenericCommerceMetadata(item, price),
        }]
      })
    } catch { }
  }
  return []
}

function extractFromRenderedHtml(html: string, query: string): ScrapedPrice[] {
  const results: ScrapedPrice[] = []
  const searchUrl = `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`
  let m: RegExpExecArray | null

  // URL'yi match segmentinden çıkar (HB URL'leri "/" ile başlar)
  const extractHbUrl = (segment: string): string => {
    const u = /"url"\s*:\s*"(\/[^"]+)"/.exec(segment)
    return u ? `https://www.hepsiburada.com${u[1]}` : searchUrl
  }

  // 1. Hepsiburada listing format: "name":"X" ... "url":"/..." ... "priceInfo":{"price":26499}
  const hbListing = /"(?:name|displayName)"\s*:\s*"([^"]{5,150})"([\s\S]{0,3000}?)"priceInfo"\s*:\s*\{"price"\s*:\s*([\d.]+)/g
  while ((m = hbListing.exec(html)) !== null && results.length < 8) {
    const price = parseFloat(m[3])
    if (price > 0 && price < 10_000_000)
      results.push({ site: 'Hepsiburada', product_name: m[1], price, url: extractHbUrl(m[2]), currency: 'TRY' })
  }
  if (results.length > 0) return results

  // 2. GA4 dataLayer: {"item_name":"X","price":1299}
  const ga4 = /"item_name"\s*:\s*"([^"]{5,150})"[^}]{0,300}"price"\s*:\s*([\d.]+)/g
  while ((m = ga4.exec(html)) !== null && results.length < 8) {
    const price = parseFloat(m[2])
    if (price > 0 && price < 10_000_000)
      results.push({ site: 'Hepsiburada', product_name: m[1], price, url: searchUrl, currency: 'TRY' })
  }
  if (results.length > 0) return results

  // 3. Generic JSON blob fallback
  const wide = /"(?:name|displayName|productName)"\s*:\s*"([^"]{10,150})"([\s\S]{1,2000}?)"(?:price|salePrice|listPrice)"\s*:\s*([\d.]+)/g
  while ((m = wide.exec(html)) !== null && results.length < 8) {
    const price = parseFloat(m[3])
    if (price > 0 && price < 10_000_000)
      results.push({ site: 'Hepsiburada', product_name: m[1], price, url: extractHbUrl(m[2]), currency: 'TRY' })
  }
  return results
}

export async function scrapeHepsiburada(query: string, signal?: AbortSignal): Promise<ScrapedPrice[]> {
  // Önce daha ucuz iç API isteğini dene; sonuç yoksa render edilmiş sayfaya düş.
  const apiResults = dedup(await tryInternalApi(query, signal))
  if (apiResults.length > 0) return apiResults

  // render=true ile tam sayfa render (JavaScript çalıştırır — 10 kredi)
  try {
    const url = `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`
    const res = await fetch(proxiedUrl(url, true, false), {
      headers: HEADERS_HTML,
      cache: 'no-store',
      signal,
    })
    await assertScraperResponse(res)

    const html = await res.text()

    // __NEXT_DATA__ (bazı Hepsiburada sayfalarında mevcut)
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1])
        const items: any[] =
          data?.props?.pageProps?.searchResult?.products ??
          data?.props?.pageProps?.products ?? []
        if (items.length > 0) {
          return items.slice(0, 8).flatMap((item): ScrapedPrice[] => {
            const price = Number(item?.price ?? item?.salePrice ?? 0)
            if (price <= 0) return []
            return [{
              site: 'Hepsiburada',
              product_name: item?.name ?? query,
              price,
              url: `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`,
              currency: 'TRY',
              barcode: extractProductBarcode(item),
              ...extractGenericCommerceMetadata(item, price),
            }]
          })
        }
      } catch { }
    }

    // Gömülü JS state
    const fromState = extractEmbeddedState(html, query)
    if (fromState.length > 0) return dedup(fromState)

    // Regex fallback
    return dedup(extractFromRenderedHtml(html, query))
  } catch (error) {
    throw error
  }
}

function dedup(items: ScrapedPrice[]): ScrapedPrice[] {
  const seen = new Set<string>()
  return items.filter(item => {
    // Kategori adı gibi kısa/genel isimleri ele
    if (item.product_name.length < 25) return false
    const key = `${item.product_name.toLowerCase()}|${item.price}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
