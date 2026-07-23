import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { analyzeProduct, type AnalysisOptions } from '@/lib/analyzer'
import { validateCronRequest } from '@/lib/api-security'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/user-settings'
import { recordAnalysisAttempt } from '@/lib/analysis-attempts'
import { getSourceDecisions, groupSourceDecisionsByProduct } from '@/lib/source-decisions'
import {
  MARKET_TRACKING_POSTGREST_FILTER,
  MARKET_TRACKING_REFRESH_DAYS,
} from '@/lib/market-tracking'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const revalidate = 0

const REFRESH_DAYS = MARKET_TRACKING_REFRESH_DAYS
const RETRY_COOLDOWN_HOURS = 6
const HOURLY_TARGET = 20
const CONCURRENT = 5

export async function GET(req: NextRequest) {
  const authError = validateCronRequest(req)
  if (authError) return authError

  const startedAt = Date.now()
  const cutoff = new Date(
    Date.now() - REFRESH_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const retryCutoff = new Date(
    Date.now() - RETRY_COOLDOWN_HOURS * 60 * 60 * 1000,
  ).toISOString()
  const supabase = createAdminClient() as any

  const [{ count: totalActive }, { data: products, error: productsError }] = await Promise.all([
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(MARKET_TRACKING_POSTGREST_FILTER),
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .or(MARKET_TRACKING_POSTGREST_FILTER)
      .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${cutoff}`)
      .or(`last_attempted_at.is.null,last_attempted_at.lt.${retryCutoff}`)
      .order('last_attempted_at', { ascending: true, nullsFirst: true })
      .order('last_analyzed_at', { ascending: true, nullsFirst: true })
      .limit(HOURLY_TARGET),
  ])

  if (productsError) {
    return NextResponse.json({ error: 'Ürün kuyruğu okunamadı' }, { status: 500 })
  }

  if (!products?.length) {
    return NextResponse.json({
      processed: 0,
      failed: 0,
      message: `${REFRESH_DAYS} günlük süresi dolmuş ürün yok`,
    })
  }

  const userIds: string[] = Array.from(
    new Set<string>(products.map((product: any) => product.user_id as string)),
  )
  const optionsByUser = new Map<string, AnalysisOptions>()

  await Promise.all(userIds.map(async (userId) => {
    const [settings, { data: thresholds }] = await Promise.all([
      getUserSettings(userId),
      supabase
        .from('category_thresholds')
        .select('category, threshold_percent')
        .eq('user_id', userId),
    ])

    optionsByUser.set(userId, {
      thresholdPercent: settings.default_threshold_percent,
      minSources: settings.min_sources,
      categoryThresholds: Object.fromEntries(
        (thresholds ?? []).map((item: any) => [item.category, Number(item.threshold_percent)]),
      ),
      confidenceThresholds: {
        exact: settings.confidence_exact / 100,
        high: settings.confidence_high / 100,
        medium: settings.confidence_medium / 100,
        low: settings.confidence_low / 100,
      },
      upperOutlierPct: settings.outlier_upper_pct,
      lowerOutlierPct: settings.outlier_filter_pct,
      activePlatforms: settings.active_platforms,
    })
  }))

  const decisions = (await Promise.all(userIds.map((userId) =>
    getSourceDecisions(
      supabase,
      userId,
      products.filter((product: any) => product.user_id === userId).map((product: any) => product.id),
    ),
  ))).flat()
  const decisionsByProduct = groupSourceDecisionsByProduct(decisions)

  let processed = 0
  let failed = 0

  for (let index = 0; index < products.length; index += CONCURRENT) {
    const batch = products.slice(index, index + CONCURRENT)
    const results = await Promise.allSettled(batch.map((product: any) => {
      const options = optionsByUser.get(product.user_id)
      if (!options) throw new Error('Kullanıcı ayarları yüklenemedi')
      return analyzeProduct(product, {
        ...options,
        sourceDecisions: decisionsByProduct.get(product.id) ?? [],
      })
    }))

    await Promise.all(results.map(async (settled, resultIndex) => {
      if (settled.status === 'rejected') {
        const product = batch[resultIndex]
        await recordAnalysisAttempt(supabase, {
          productId: product.id,
          userId: product.user_id,
          status: 'failed',
          failureReason: 'scraper_error',
          errorMessage: 'Pazar yeri taraması tamamlanamadı',
        }).catch(() => undefined)
        failed += 1
        return
      }

      const product = batch[resultIndex]
      const result = settled.value
      if (result.technical_failure) {
        await recordAnalysisAttempt(supabase, {
          productId: product.id,
          userId: product.user_id,
          status: 'failed',
          failureReason: 'no_sources',
          errorMessage: 'Pazar yerlerinden fiyat kaynağı alınamadı',
          scraperHealth: result.scraper_health,
        }).catch(() => undefined)
        failed += 1
        return
      }

      const analyzedAt = new Date().toISOString()
      const { error: insertError } = await supabase.from('price_analyses').insert({
        product_id: product.id,
        user_id: product.user_id,
        run_at: analyzedAt,
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
        failed += 1
        return
      }

      const { error: updateError } = await supabase
        .from('products')
        .update({ last_analyzed_at: analyzedAt })
        .eq('id', product.id)

      if (updateError) {
        failed += 1
        return
      }

      await recordAnalysisAttempt(supabase, {
        productId: product.id,
        userId: product.user_id,
        status: 'success',
        attemptedAt: analyzedAt,
        scraperHealth: result.scraper_health,
      }).catch(() => undefined)

      processed += 1
    }))
  }

  return NextResponse.json({
    processed,
    failed,
    selected: products.length,
    total_active: totalActive ?? 0,
    hourly_target: HOURLY_TARGET,
    daily_capacity: HOURLY_TARGET * 24,
    refresh_window_capacity: HOURLY_TARGET * 24 * REFRESH_DAYS,
    refresh_days: REFRESH_DAYS,
    retry_cooldown_hours: RETRY_COOLDOWN_HOURS,
    elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    next_run_in: '1 saat',
  })
}
