import { NextRequest, NextResponse } from 'next/server'
import { scrapeAllPlatforms } from '@/lib/scrapers'
import { validateDebugRequest } from '@/lib/api-security'

export async function GET(req: NextRequest) {
  const authError = await validateDebugRequest()
  if (authError) return authError

  const query = req.nextUrl.searchParams.get('q') ?? 'Ariel 3kg Toz Deterjan'
  const items = await scrapeAllPlatforms(query).catch(() => [])
  return NextResponse.json({ query, count: items.length, items })
}
