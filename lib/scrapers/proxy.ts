export type ScraperProxyErrorCode =
  | 'quota_exhausted'
  | 'provider_timeout'
  | 'http_4xx'
  | 'http_5xx'

export class ScraperProxyError extends Error {
  readonly code: ScraperProxyErrorCode

  constructor(code: ScraperProxyErrorCode) {
    super(code)
    this.name = 'ScraperProxyError'
    this.code = code
  }
}

export async function assertScraperResponse(response: Response) {
  if (response.ok) return

  const body = await response.text().catch(() => '')
  if (body.toLowerCase().includes('exhausted the api credits')) {
    throw new ScraperProxyError('quota_exhausted')
  }
  if (body.toLowerCase().includes('timed-out') || body.toLowerCase().includes('timed out')) {
    throw new ScraperProxyError('provider_timeout')
  }

  throw new ScraperProxyError(response.status >= 500 ? 'http_5xx' : 'http_4xx')
}

/**
 * ScraperAPI proxy helper.
 * render=true       → JS çalıştırır (SPA sayfalar) — 10 kredi/istek
 * premium=true      → Cloudflare/korumalı siteler — 25 kredi/istek
 * ultraPremium=true → Çok güçlü koruma (Trendyol vb.) — 75 kredi/istek
 */
export function proxiedUrl(
  targetUrl: string,
  render = false,
  premium = false,
  ultraPremium = false,
): string {
  const key = process.env.SCRAPERAPI_KEY
  if (!key) return targetUrl

  const params = new URLSearchParams({ api_key: key, url: targetUrl })
  if (render) params.set('render', 'true')
  if (ultraPremium) params.set('ultra_premium', 'true')
  else if (premium) params.set('premium', 'true')
  return `http://api.scraperapi.com?${params.toString()}`
}
