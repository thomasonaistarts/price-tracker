import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/paginate'
import type { PriceHistoryPoint, RecordedPriceChange } from '@/lib/price-history'

const ALLOWED_DAYS = new Set([30, 90, 365])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try { userId = (await requireAuth()).id } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const requestedDays = Number(req.nextUrl.searchParams.get('days') ?? 90)
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 90
  const supabase = await createClient() as any

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, sku, product_name, our_price')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (productError || !product) {
    return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  try {
    const [history, priceChanges] = await Promise.all([
      fetchAllRows<PriceHistoryPoint>(async (from, to) => supabase
        .from('price_analyses')
        .select('id, run_at, our_price, market_mean, min_price, max_price, price_diff_percent, sources_count, sources')
        .eq('product_id', params.id)
        .eq('user_id', userId)
        .gte('run_at', since)
        .order('run_at', { ascending: true })
        .range(from, to)),
      fetchAllRows<RecordedPriceChange>(async (from, to) => supabase
        .from('product_price_changes')
        .select('id, created_at, old_price, new_price, change_source, reason')
        .eq('product_id', params.id)
        .eq('user_id', userId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, to)),
    ])

    return NextResponse.json({ product, days, history, priceChanges })
  } catch {
    return NextResponse.json({ error: 'Fiyat geçmişi okunamadı' }, { status: 500 })
  }
}
