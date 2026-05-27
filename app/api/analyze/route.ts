import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { analyzeSchema } from '@/lib/validations'
import { runAnalysis } from '@/lib/analyzer'

export async function POST(req: NextRequest) {
  let userId: string
  try {
    const user = await requireAuth()
    userId = user.id
  } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = analyzeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { products, threshold_percent, min_sources, category_thresholds } = parsed.data
  const results = runAnalysis(products, threshold_percent, min_sources, category_thresholds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  for (const result of results) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .upsert({
        user_id: userId,
        sku: result.sku,
        product_name: result.product_name,
        brand: result.brand || null,
        category: result.category || null,
        our_price: result.our_price,
        currency: 'TRY',
      }, { onConflict: 'user_id,sku', ignoreDuplicates: false })
      .select('id')
      .single()

    if (productError || !product) continue

    await supabase.from('price_analyses').insert({
      product_id: product.id,
      user_id: userId,
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
  }

  const alertCount = results.filter(
    (r: { alert: string }) => r.alert === 'above_market' || r.alert === 'below_market'
  ).length

  return NextResponse.json({
    run_timestamp: new Date().toISOString(),
    products_checked: results.length,
    alerts_count: alertCount,
    marketwide_volatility: alertCount / results.length > 0.2,
    results,
  })
}
