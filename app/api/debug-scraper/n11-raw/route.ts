import { NextRequest, NextResponse } from 'next/server'
import { proxiedUrl } from '@/lib/scrapers/proxy'
import { validateDebugRequest } from '@/lib/api-security'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
}

export async function GET(req: NextRequest) {
  const authError = await validateDebugRequest()
  if (authError) return authError

  const query = req.nextUrl.searchParams.get('q') ?? 'BIC Velleda Tahta Kalemi Siyah 4lü'

  const url = `https://www.n11.com/arama?q=${encodeURIComponent(query)}`
  const res = await fetch(proxiedUrl(url), { headers: HEADERS, cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` })

  const html = await res.text()

  // JSON-LD blokları
  const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  const jsonLdBlocks: unknown[] = []
  let jMatch: RegExpExecArray | null
  while ((jMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      jsonLdBlocks.push(JSON.parse(jMatch[1]))
    } catch { jsonLdBlocks.push({ parseError: jMatch[1].slice(0, 200) }) }
  }

  // displayPrice etrafındaki HTML (ilk 2 eşleşme, 5000 char öncesi)
  const dpPattern = /"displayPrice"\s*:\s*(\d+)/g
  const dpContexts: { price: number; before5000: string; after5000: string }[] = []
  let m: RegExpExecArray | null
  while ((m = dpPattern.exec(html)) !== null && dpContexts.length < 2) {
    dpContexts.push({
      price: parseInt(m[1], 10),
      before5000: html.slice(Math.max(0, m.index - 5000), m.index),
      after5000: html.slice(m.index + m[0].length, m.index + m[0].length + 5000),
    })
  }

  return NextResponse.json({
    query,
    htmlLength: html.length,
    jsonLdBlocks,
    dpContexts,
  })
}
