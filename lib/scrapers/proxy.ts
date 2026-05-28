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
