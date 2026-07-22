import { NextRequest, NextResponse } from 'next/server'
import { scrapeN11 } from '@/lib/scrapers/n11'
import { scrapeHepsiburada } from '@/lib/scrapers/hepsiburada'
import { scrapePttavm } from '@/lib/scrapers/pttavm'
import { scrapeIdefix } from '@/lib/scrapers/idefix'
import { scrapeTrendyol } from '@/lib/scrapers/trendyol'
import { validateDebugRequest } from '@/lib/api-security'

export async function GET(req: NextRequest) {
  const authError = await validateDebugRequest()
  if (authError) return authError

  const query = req.nextUrl.searchParams.get('q') ?? 'Sony WH-1000XM5 Kulaklık'
  const site = req.nextUrl.searchParams.get('site') ?? 'n11'

  const scrapers: Record<string, (q: string) => Promise<unknown[]>> = {
    n11: scrapeN11,
    hepsiburada: scrapeHepsiburada,
    pttavm: scrapePttavm,
    idefix: scrapeIdefix,
    trendyol: scrapeTrendyol,
  }

  const fn = scrapers[site]
  if (!fn) return NextResponse.json({ error: `Bilinmeyen site: ${site}. Geçerli: ${Object.keys(scrapers).join(', ')}` }, { status: 400 })

  const items = await fn(query).catch(() => [])
  return NextResponse.json({ site, query, count: items.length, items })
}
