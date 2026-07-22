import { NextRequest, NextResponse } from 'next/server'
import { validateDebugRequest } from '@/lib/api-security'

const ACTOR_ID = 'fatihtahta~trendyol-scraper'

export async function GET(req: NextRequest) {
  const authError = await validateDebugRequest()
  if (authError) return authError

  const query = req.nextUrl.searchParams.get('q') ?? 'BIC Velleda Tahta Kalemi Siyah'
  const token = process.env.APIFY_TOKEN
  if (!token) return NextResponse.json({ error: 'APIFY_TOKEN eksik' }, { status: 500 })

  const url =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${token}&timeout=40&format=json`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries: [query], limit: 10, enrich_data: false, getReviews: false, getQna: false }),
  })

  if (!res.ok) return NextResponse.json({ error: `Apify HTTP ${res.status}`, body: await res.text() })

  const items: unknown[] = await res.json()
  // Return first item's full structure so we can see all field names
  return NextResponse.json({ count: items.length, first_item: items[0] ?? null, items })
}
