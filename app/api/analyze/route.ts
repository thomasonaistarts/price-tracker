import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { analyzeSchema } from '@/lib/validations'
import { runAnalysis } from '@/lib/analyzer'
import { getUserSettings } from '@/lib/user-settings'
import { recordAnalysisAttempt } from '@/lib/analysis-attempts'

// Vercel Pro: 300s max — ScraperAPI premium+render ~30s/ürün
export const maxDuration = 300

const BUDGET_MS = 255_000  // 255s — 45s güvenlik tamponu bırak

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
  const supabase = await createClient() as any

  // Kullanıcının eşleşme hassasiyeti ayarlarını çek
  const settings = await getUserSettings(userId)
  const confidenceThresholds = {
    exact:  settings.confidence_exact  / 100,
    high:   settings.confidence_high   / 100,
    medium: settings.confidence_medium / 100,
    low:    settings.confidence_low    / 100,
  }
  const { data: storedThresholds } = category_thresholds
    ? { data: null }
    : await supabase
      .from('category_thresholds')
      .select('category, threshold_percent')
      .eq('user_id', userId)
  const effectiveCategoryThresholds = category_thresholds ?? Object.fromEntries(
    (storedThresholds ?? []).map((item: any) => [item.category, Number(item.threshold_percent)]),
  )

  const startedAt = Date.now()
  const BATCH = 5
  const results: Awaited<ReturnType<typeof runAnalysis>> = []
  let skipped = 0

  // Zaman bütçesine göre batch batch işle — timeout'tan önce dur
  for (let i = 0; i < products.length; i += BATCH) {
    if (Date.now() - startedAt > BUDGET_MS) {
      skipped = products.length - i
      break
    }
    const batch = products.slice(i, i + BATCH)
    const batchResults = await runAnalysis(batch, {
      thresholdPercent: threshold_percent ?? settings.default_threshold_percent,
      minSources: min_sources ?? settings.min_sources,
      categoryThresholds: effectiveCategoryThresholds,
      confidenceThresholds,
      upperOutlierPct: settings.outlier_upper_pct,
      lowerOutlierPct: settings.outlier_filter_pct,
      activePlatforms: settings.active_platforms,
    })
    results.push(...batchResults)
  }

  const isPartial = skipped > 0
  const completedResults = results.filter((result) => !result.technical_failure)
  const technicalFailures = results.length - completedResults.length

  const now = new Date().toISOString()

  for (const result of results.filter((item) => item.technical_failure)) {
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', userId)
      .eq('sku', result.sku)
      .maybeSingle()

    if (existingProduct) {
      await recordAnalysisAttempt(supabase, {
        productId: existingProduct.id,
        userId,
        status: 'failed',
        attemptedAt: now,
        failureReason: 'no_sources',
        errorMessage: 'Pazar yerlerinden fiyat kaynağı alınamadı',
        scraperHealth: result.scraper_health,
      }).catch(() => undefined)
    }
  }

  for (const result of completedResults) {
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

    const { error: analysisError } = await supabase.from('price_analyses').insert({
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
      scraper_health: result.scraper_health,
    })

    if (!analysisError) {
      await recordAnalysisAttempt(supabase, {
        productId: product.id,
        userId,
        status: 'success',
        attemptedAt: now,
        scraperHealth: result.scraper_health,
      }).catch(() => undefined)
    }
  }

  const alertCount = completedResults.filter(
    r => r.alert === 'above_market' || r.alert === 'below_market'
  ).length

  return NextResponse.json({
    run_timestamp: new Date().toISOString(),
    products_checked: completedResults.length,
    alerts_count: alertCount,
    results: completedResults,
    failed: technicalFailures,
    partial: isPartial,
    skipped,
  })
}
