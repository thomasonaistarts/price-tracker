import { extractProductBarcode, extractSchemaOfferMetadata } from './metadata.ts'
import { parseMarketplacePrice } from './price.ts'
import { assertScraperResponse, proxiedUrl } from './proxy.ts'
import type { ScrapedPrice } from './types.ts'

const PLATFORM_HOSTS: Record<string, string[]> = {
  Hepsiburada: ['hepsiburada.com', 'www.hepsiburada.com'],
  N11: ['n11.com', 'www.n11.com'],
  PTTAvm: ['pttavm.com', 'www.pttavm.com'],
  'İdefix': ['idefix.com', 'www.idefix.com'],
}

export function isAllowedVerifiedSourceUrl(platform: string, value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && (PLATFORM_HOSTS[platform] ?? []).includes(url.hostname.toLocaleLowerCase('tr-TR'))
  } catch {
    return false
  }
}

export async function scrapeVerifiedProductUrl(
  platform: string,
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<ScrapedPrice[]> {
  if (!isAllowedVerifiedSourceUrl(platform, sourceUrl)) return []

  const response = await fetch(proxiedUrl(sourceUrl), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'tr-TR,tr;q=0.9',
    },
    cache: 'no-store',
    signal,
  })
  await assertScraperResponse(response)
  return parseVerifiedProductHtml(platform, sourceUrl, await response.text())
}

export function parseVerifiedProductHtml(
  platform: string,
  sourceUrl: string,
  html: string,
): ScrapedPrice[] {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed?.['@graph'] && Array.isArray(parsed['@graph'])
          ? parsed['@graph']
          : [parsed]

      for (const candidate of candidates) {
        if (String(candidate?.['@type'] ?? '').toLocaleLowerCase('tr-TR') !== 'product') continue
        const offers = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.offers
        const price = parseMarketplacePrice(
          offers?.price ?? offers?.lowPrice ?? candidate.price,
        )
        const name = String(candidate.name ?? '').trim()
        if (!price || price <= 0 || name.length < 5) continue

        return [{
          site: platform,
          product_name: name,
          price,
          url: String(candidate.url ?? sourceUrl),
          currency: String(offers?.priceCurrency ?? 'TRY'),
          barcode: extractProductBarcode(candidate),
          ...extractSchemaOfferMetadata(offers, price),
        }]
      }
    } catch {
      // Bir bozuk JSON-LD bloğu diğer yapılandırılmış veri bloklarını engellemez.
    }
  }
  return []
}
