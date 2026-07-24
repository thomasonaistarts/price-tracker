import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isAllowedVerifiedSourceUrl,
  parseVerifiedProductHtml,
} from '../lib/scrapers/direct.ts'
import { scrapeAllPlatforms } from '../lib/scrapers/index.ts'

test('verified source URLs are HTTPS and restricted to the expected marketplace', () => {
  assert.equal(isAllowedVerifiedSourceUrl('N11', 'https://www.n11.com/urun/test-123'), true)
  assert.equal(isAllowedVerifiedSourceUrl('N11', 'http://www.n11.com/urun/test-123'), false)
  assert.equal(isAllowedVerifiedSourceUrl('N11', 'https://attacker.example/?next=n11.com'), false)
  assert.equal(isAllowedVerifiedSourceUrl('Trendyol', 'https://www.trendyol.com/test'), false)
})

test('verified product page parser reads a Product JSON-LD offer', () => {
  const html = `
    <html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Adel ALX-806 Üçlü Kalem Seti",
          "url": "https://www.n11.com/urun/adel-alx-806-123",
          "offers": {
            "@type": "Offer",
            "price": "349,90",
            "priceCurrency": "TRY",
            "availability": "https://schema.org/InStock"
          }
        }
      </script>
    </head></html>`

  const result = parseVerifiedProductHtml(
    'N11',
    'https://www.n11.com/urun/adel-alx-806-123',
    html,
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].price, 349.9)
  assert.equal(result[0].inStock, true)
})

test('non-product JSON-LD cannot become a remembered product offer', () => {
  const html = '<script type="application/ld+json">{"@type":"BreadcrumbList","name":"Adel"}</script>'
  assert.deepEqual(
    parseVerifiedProductHtml('N11', 'https://www.n11.com/urun/test', html),
    [],
  )
})

test('verified URL is checked before marketplace discovery', async () => {
  const previousFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async value => {
    requested.push(String(value))
    return new Response(`
      <script type="application/ld+json">
        {
          "@type":"Product",
          "name":"Adel ALX-806 Üçlü Kalem Seti",
          "url":"https://www.n11.com/urun/adel-alx-806-123",
          "offers":{"price":"349.90","priceCurrency":"TRY","availability":"https://schema.org/InStock"}
        }
      </script>
    `, { status: 200, headers: { 'content-type': 'text/html' } })
  }

  try {
    const results = await scrapeAllPlatforms('Adel ALX-806 Üçlü Kalem Seti', {
      activePlatforms: ['N11'],
      sourceDecisions: [{
        product_id: 'product',
        platform: 'N11',
        source_url: 'https://www.n11.com/urun/adel-alx-806-123',
        decision: 'approved',
      }],
    })
    assert.equal(requested.length, 1)
    assert.equal(requested[0], 'https://www.n11.com/urun/adel-alx-806-123')
    assert.equal(results[0].manualDecision, 'approved')
  } finally {
    globalThis.fetch = previousFetch
  }
})
