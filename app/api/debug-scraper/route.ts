import { NextRequest, NextResponse } from 'next/server'
import { proxiedUrl } from '@/lib/scrapers/proxy'
import { validateDebugRequest } from '@/lib/api-security'

export async function GET(req: NextRequest) {
  const authError = await validateDebugRequest()
  if (authError) return authError

  const query = req.nextUrl.searchParams.get('q') ?? 'Sony Kulaklık'
  const site  = req.nextUrl.searchParams.get('site') ?? 'trendyol'
  const render = req.nextUrl.searchParams.get('render') === 'true'
  const premium = req.nextUrl.searchParams.get('premium') === 'true'
  const ultraPremium = req.nextUrl.searchParams.get('ultra_premium') === 'true'

  const hasKey = !!process.env.SCRAPERAPI_KEY

  let url = ''
  if (site === 'trendyol') {
    url = `https://public.trendyol.com/discovery-web-searchgw-service/api/filter?q=${encodeURIComponent(query)}&culture=tr-TR&userGenderId=0&pId=0&suggestedSearchText=${encodeURIComponent(query)}&categoryId=0&searchStrategyType=DEFAULT_SEARCH_RESULT&productStampType=TypeA&scoringAlgorithmId=2&searchAbDecider=`
  } else if (site === 'hepsiburada') {
    url = `https://www.hepsiburada.com/ara?q=${encodeURIComponent(query)}`
  } else if (site === 'hepsi-api') {
    url = `https://www.hepsiburada.com/search/api/product-listing/search?q=${encodeURIComponent(query)}&offset=0&limit=20&platform=hepsiburada`
  } else if (site === 'n11') {
    url = `https://www.n11.com/arama?q=${encodeURIComponent(query)}`
  } else if (site === 'trendyol-sr') {
    url = `https://www.trendyol.com/sr?q=${encodeURIComponent(query)}&qt=${encodeURIComponent(query)}&st=${encodeURIComponent(query)}&os=1`
  }

  try {
    const res = await fetch(proxiedUrl(url, render, premium, ultraPremium), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Referer': 'https://www.trendyol.com/',
      },
      cache: 'no-store',
    })

    const contentType = res.headers.get('content-type') ?? ''
    const isJson = contentType.includes('json')

    let bodyText: string
    let parsedInfo: Record<string, unknown> = {}

    if (isJson) {
      const json = await res.json()
      bodyText = JSON.stringify(json).slice(0, 3000)
      // Trendyol API için product count
      const products = json?.result?.products ?? json?.products ?? json?.data?.products ?? []
      parsedInfo = { type: 'json', product_count: Array.isArray(products) ? products.length : 0, first_product: products[0] ?? null }
    } else {
      bodyText = (await res.text())
      parsedInfo = {
        type: 'html',
        length: bodyText.length,
        has_next_data: bodyText.includes('__NEXT_DATA__'),
        has_json_ld: bodyText.includes('application/ld+json'),
        has_initial_state: bodyText.includes('__INITIAL_STATE__'),
        has_redux_state: bodyText.includes('__REDUX_STATE__'),
        has_price_pattern: /"\w*[Pp]rice\w*"\s*:\s*[\d.]+/.test(bodyText),
        has_item_name: bodyText.includes('"item_name"'),
        has_datalayer: bodyText.includes('dataLayer'),
        has_gtm: bodyText.includes('GTM-') || bodyText.includes('gtm.js'),
        price_pattern_sample: (() => {
          const m = /(".{0,30}[Pp]rice.{0,10}"\s*:\s*[\d.]+)/.exec(bodyText)
          return m ? m[1] : null
        })(),
      }
      bodyText = bodyText.slice(0, 3000)
    }

    return NextResponse.json({
      scraperapi_key_set: hasKey,
      site, query, render, premium, ultra_premium: ultraPremium,
      status: res.status,
      content_type: contentType,
      parsed_info: parsedInfo,
      body_preview: bodyText,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
