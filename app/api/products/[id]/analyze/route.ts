import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { analyzeProduct } from '@/lib/analyzer'
import { getUserSettings } from '@/lib/user-settings'
import { recordAnalysisAttempt } from '@/lib/analysis-attempts'
import { getSourceDecisions } from '@/lib/source-decisions'
import { retryCooldownHours } from '@/lib/analysis-outcome'
import { getVerifiedSourceMemory, rememberProductSources } from '@/lib/source-memory'
import { saveProductReviewCandidates } from '@/lib/review-candidates'

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

  const cooldownMs = 10 * 60 * 1000
  const lastAttemptAt = product.last_attempted_at ?? product.last_analyzed_at
  if (lastAttemptAt) {
    const elapsed = Date.now() - new Date(lastAttemptAt).getTime()
    if (elapsed >= 0 && elapsed < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - elapsed) / 1000)
      return NextResponse.json(
        { error: 'Bu ürün için kısa süre önce analiz denendi', retry_after_seconds: retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      )
    }
  }

  const settings = await getUserSettings(userId)
  const { data: thresholds } = await supabase
    .from('category_thresholds')
    .select('category, threshold_percent')
    .eq('user_id', userId)

  const categoryThresholds = Object.fromEntries(
    (thresholds ?? []).map((item: any) => [item.category, Number(item.threshold_percent)]),
  )
  const [rememberedSources, sourceDecisions] = await Promise.all([
    getVerifiedSourceMemory(supabase, userId, [product.id]),
    getSourceDecisions(supabase, userId, [product.id]),
  ])

  const result = await analyzeProduct(product, {
    thresholdPercent: settings.default_threshold_percent,
    minSources: settings.min_sources,
    categoryThresholds,
    confidenceThresholds: {
      exact: settings.confidence_exact / 100,
      high: settings.confidence_high / 100,
      medium: settings.confidence_medium / 100,
      low: settings.confidence_low / 100,
    },
    upperOutlierPct: settings.outlier_upper_pct,
    lowerOutlierPct: settings.outlier_filter_pct,
    activePlatforms: settings.active_platforms,
    // Elle verilen karar son sözü söyler; bu nedenle URL belleğinden sonra eklenir.
    sourceDecisions: [...rememberedSources, ...sourceDecisions],
  })
  await saveProductReviewCandidates(supabase, {
    productId: product.id,
    userId,
    candidates: result.review_candidates,
  }).catch(() => undefined)

  if (result.technical_failure) {
    const attemptedAt = new Date().toISOString()
    try {
      await recordAnalysisAttempt(supabase, {
        productId: product.id,
        userId,
        status: 'failed',
        attemptedAt,
        failureReason: result.outcome,
        errorMessage: `Analiz tamamlanamadı: ${result.outcome}`,
        scraperHealth: result.scraper_health,
      })
    } catch {
      return NextResponse.json({ error: 'Başarısız analiz denemesi kaydedilemedi' }, { status: 500 })
    }

    return NextResponse.json(
      {
        error: 'Güvenilir yeni piyasa verisi üretilemedi. Eski başarılı analiz korundu.',
        outcome: result.outcome,
        retryable: true,
        retry_after_hours: retryCooldownHours(result.outcome),
        attempted_at: attemptedAt,
      },
      { status: 503 },
    )
  }

  const now = new Date().toISOString()

  const { error: insertError } = await supabase.from('price_analyses').insert({
    product_id: product.id,
    user_id: userId,
    run_at: now,
    our_price: result.our_price,
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
  if (insertError) {
    return NextResponse.json({ error: 'Analiz sonucu kaydedilemedi' }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('products')
    .update({ last_analyzed_at: now })
    .eq('id', product.id)
  if (updateError) {
    return NextResponse.json({ error: 'Analiz zamanı güncellenemedi' }, { status: 500 })
  }

  await recordAnalysisAttempt(supabase, {
    productId: product.id,
    userId,
    status: 'success',
    attemptedAt: now,
    failureReason: result.outcome === 'insufficient_sources' ? result.outcome : null,
    scraperHealth: result.scraper_health,
  }).catch(() => undefined)
  await rememberProductSources(supabase, {
    productId: product.id,
    userId,
    sources: result.sources,
  }).catch(() => undefined)

  return NextResponse.json({
    success: true,
    outcome: result.outcome,
    alert: result.alert,
    price_diff_percent: result.price_diff_percent,
  })
}
