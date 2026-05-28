import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { analyzeSchema } from '@/lib/validations'
import { runAnalysis } from '@/lib/analyzer'
import { getUserSettings } from '@/lib/user-settings'

// Vercel Pro: 300s max — ScraperAPI premium+render ~30s/ürün
export const maxDuration = 300

// Excel/CSV kolon adlarını normalize et:
// "SKU", " sku ", "Our Price", "our-price" → "sku", "our_price"
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.trim().toLowerCase().replace(/[\s\-]+/g, '_')
    out[normalized] = value
  }
  return out
}

export async function POST(req: NextRequest) {
  let userId: string
  try {
    const user = await requireAuth()
    userId = user.id
  } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const body = await req.json()

  // Ürün satırlarının kolon adlarını normalize et
  if (Array.isArray(body?.products)) {
    body.products = (body.products as Record<string, unknown>[]).map(normalizeRow)
  }

  const parsed = analyzeSchema.safeParse(body)
  if (!parsed.success) {
    // Hangi alanda hata olduğunu açıkça göster
    const err = parsed.error.errors[0]
    const field = err.path.join('.')
    const msg = field ? `${field}: ${err.message}` : err.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { products, threshold_percent, min_sources, category_thresholds } = parsed.data

  // Kullanıcının eşleşme hassasiyeti ayarlarını çek
  const settings = await getUserSettings(userId)
  const confidenceThresholds = {
    exact:  settings.confidence_exact  / 100,
    high:   settings.confidence_high   / 100,
    medium: settings.confidence_medium / 100,
    low:    settings.confidence_low    / 100,
  }

  const results = await runAnalysis(products, threshold_percent, min_sources, category_thresholds, confidenceThresholds)

  const supabase = await createClient() as any

  const now = new Date().toISOString()

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
        last_analyzed_at: now,
      }, { onConflict: 'user_id,sku', ignoreDuplicates: false })
      .select('id')
      .single()

    if (productError || !product) continue

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
  }

  const alertCount = results.filter(
    r => r.alert === 'above_market' || r.alert === 'below_market'
  ).length

  return NextResponse.json({
    run_timestamp: new Date().toISOString(),
    products_checked: results.length,
    alerts_count: alertCount,
    results,
  })
}
