import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { analyzeProduct } from '@/lib/analyzer'
import { getUserSettings } from '@/lib/user-settings'
import type { ConfidenceThresholds } from '@/lib/scrapers'

export const maxDuration = 300

// Kaç ürünü aynı anda paralel işle
const CONCURRENT = 3
// Bir batch'in ortalama süresi (saniye) — 5 platform paralel scrapiyor
const SECONDS_PER_BATCH = 25
// Timeout bitmeden kaç saniye önce dur
const SAFETY_BUFFER_S = 20
// Minimum yenileme aralığı (gün) — gerçek aralık ürün sayısına göre otomatik artar
const MIN_REFRESH_DAYS = 7

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const budgetMs = (maxDuration - SAFETY_BUFFER_S) * 1000

  const supabase = createAdminClient()

  // Toplam aktif ürün sayısına göre döngü süresi hesapla
  // Günlük kapasite: 12 çalışma × CONCURRENT × (280s / SECONDS_PER_BATCH) ürün
  const dailyCapacity = 12 * CONCURRENT * Math.floor((maxDuration - SAFETY_BUFFER_S) / SECONDS_PER_BATCH)
  const { count: totalActive } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  const cycleDays = Math.ceil((totalActive ?? 0) / dailyCapacity)
  const refreshDays = Math.max(MIN_REFRESH_DAYS, cycleDays + 1) // döngü + 1 gün tampon

  const cutoff = new Date(Date.now() - refreshDays * 24 * 60 * 60 * 1000).toISOString()

  // refreshDays içinde analiz edilmemiş aktif ürünler, en eskisi önce
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${cutoff}`)
    .order('last_analyzed_at', { ascending: true, nullsFirst: true })

  if (!products?.length) {
    return NextResponse.json({ processed: 0, skipped: 0, message: 'Tüm ürünler güncel' })
  }

  // Her kullanıcının eşleşme hassasiyeti ayarlarını önceden çek (cache)
  const uniqueUserIds = Array.from(new Set(products.map((p: { user_id: string }) => p.user_id)))
  const userConfidenceMap = new Map<string, ConfidenceThresholds>()
  await Promise.all(
    uniqueUserIds.map(async (uid: string) => {
      const s = await getUserSettings(uid)
      userConfidenceMap.set(uid, {
        exact:  s.confidence_exact  / 100,
        high:   s.confidence_high   / 100,
        medium: s.confidence_medium / 100,
        low:    s.confidence_low    / 100,
      })
    })
  )

  let processed = 0
  let failed = 0
  let skipped = 0

  // 3'lü paralel batch'ler halinde işle
  for (let i = 0; i < products.length; i += CONCURRENT) {
    const elapsed = Date.now() - startedAt
    if (elapsed + SECONDS_PER_BATCH * 1000 > budgetMs) {
      skipped = products.length - i
      break
    }

    const batch = products.slice(i, i + CONCURRENT)

    const results = await Promise.allSettled(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batch.map((product: any) => {
        const confThr = userConfidenceMap.get(product.user_id)
        return analyzeProduct(product, 10, 2, confThr)
      })
    )

    const now = new Date().toISOString()

    await Promise.allSettled(
      results.map(async (res, idx) => {
        const product = batch[idx]
        if (res.status === 'rejected') { failed++; return }

        const result = res.value
        await supabase.from('price_analyses').insert({
          product_id: product.id,
          user_id: product.user_id,
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
        processed++
      })
    )
  }

  const elapsed_s = Math.round((Date.now() - startedAt) / 1000)
  const remaining = products.length - processed - failed

  return NextResponse.json({
    processed,
    failed,
    skipped,
    total_pending: products.length,
    total_active: totalActive,
    daily_capacity: dailyCapacity,
    cycle_days: cycleDays,
    refresh_days: refreshDays,
    elapsed_s,
    next_run_in: '2 saat',
    message: skipped > 0
      ? `${remaining} ürün kalan — sonraki çalışmada devam edilecek`
      : `Tüm bekleyen ${processed} ürün güncellendi`,
  })
}
