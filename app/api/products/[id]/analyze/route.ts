import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { analyzeProduct } from '@/lib/analyzer'

export const maxDuration = 300

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try { userId = (await requireAuth()).id } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const supabase = await createClient() as any

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single()

  if (error || !product) return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })

  const result = await analyzeProduct(product, 10, 2)
  const now = new Date().toISOString()

  await supabase.from('price_analyses').insert({
    product_id: product.id,
    user_id: userId,
    run_at: now,
    market_mean: result.market_mean,
    market_median: result.market_median,
    market_std: result.market_std,
    min_price: result.min_price,
    max_price: result.max_price,
    price_diff_percent: result.price_diff_percent,
    alert: result.alert,
    alert_reason: result.alert_reason,
    sources_count: result.sources_count,
    sources: result.sources,
    confidence: result.confidence,
    threshold_used: result.threshold_used,
    notes: result.notes,
    follow_up: result.follow_up,
  })

  await supabase.from('products').update({ last_analyzed_at: now }).eq('id', product.id)

  return NextResponse.json({ success: true, alert: result.alert, price_diff_percent: result.price_diff_percent })
}
