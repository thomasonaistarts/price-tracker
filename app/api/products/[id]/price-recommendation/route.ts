import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { recommendPrice } from '@/lib/price-recommendation'
import { createClient } from '@/lib/supabase/server'
import {
  priceChangePercent,
  requiresLargePriceChangeConfirmation,
} from '@/lib/price-change-safety'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try { userId = (await requireAuth()).id } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const expectedPrice = Number(body.expected_price)
  const expectedRecommendation = Number(body.expected_recommended_price)
  if (!Number.isFinite(expectedPrice) || expectedPrice <= 0 || !Number.isFinite(expectedRecommendation) || expectedRecommendation <= 0) {
    return NextResponse.json({ error: 'Geçersiz fiyat onayı' }, { status: 400 })
  }

  const supabase = await createClient() as any
  const [{ data: product, error: productError }, { data: latestAnalysis }] = await Promise.all([
    supabase
      .from('products')
      .select('id, user_id, our_price, purchase_cost, vat_rate, commission_rate, shipping_cost, packaging_cost, target_margin_rate, price_floor, price_ceiling')
      .eq('id', params.id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('latest_price_analyses')
      .select('market_mean')
      .eq('product_id', params.id)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (productError || !product) return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })
  if (Math.abs(Number(product.our_price) - expectedPrice) >= 0.01) {
    return NextResponse.json({ error: 'Ürün fiyatı başka bir işlemde değişti. Sayfayı yenileyin.' }, { status: 409 })
  }

  const recommendation = recommendPrice({
    salePrice: Number(product.our_price),
    purchaseCost: product.purchase_cost == null ? null : Number(product.purchase_cost),
    vatRate: Number(product.vat_rate ?? 20),
    commissionRate: Number(product.commission_rate ?? 0),
    shippingCost: Number(product.shipping_cost ?? 0),
    packagingCost: Number(product.packaging_cost ?? 0),
    targetMarginRate: Number(product.target_margin_rate ?? 20),
    priceFloor: product.price_floor == null ? null : Number(product.price_floor),
    priceCeiling: product.price_ceiling == null ? null : Number(product.price_ceiling),
    marketMean: latestAnalysis?.market_mean == null ? null : Number(latestAnalysis.market_mean),
  })

  if (recommendation.status !== 'ready' || recommendation.recommendedPrice == null) {
    return NextResponse.json({ error: recommendation.reason }, { status: 422 })
  }
  if (Math.abs(recommendation.recommendedPrice - expectedRecommendation) >= 0.01) {
    return NextResponse.json({
      error: 'Fiyat önerisi güncellendi. Yeni öneriyi kontrol edip tekrar onaylayın.',
      recommendation,
    }, { status: 409 })
  }
  if (Math.abs(recommendation.recommendedPrice - Number(product.our_price)) < 0.01) {
    return NextResponse.json({ error: 'Ürün fiyatı zaten önerilen seviyede.' }, { status: 409 })
  }

  const changePercent = priceChangePercent(Number(product.our_price), recommendation.recommendedPrice)
  if (
    requiresLargePriceChangeConfirmation(Number(product.our_price), recommendation.recommendedPrice)
    && body.confirm_large_change !== true
  ) {
    return NextResponse.json({
      error: `Öneri mevcut fiyattan %${changePercent.toFixed(2)} farklı. %10 üzerindeki değişiklikler ek onay gerektirir.`,
      requires_large_change_confirmation: true,
      change_percent: changePercent,
      recommendation,
    }, { status: 409 })
  }

  const snapshot = {
    calculated_at: new Date().toISOString(),
    minimum_safe_price: recommendation.minimumSafePrice,
    market_mean: latestAnalysis?.market_mean ?? null,
    current: recommendation.current,
    recommended: recommendation.recommended,
    rules: {
      purchase_cost: product.purchase_cost,
      vat_rate: product.vat_rate,
      commission_rate: product.commission_rate,
      shipping_cost: product.shipping_cost,
      packaging_cost: product.packaging_cost,
      target_margin_rate: product.target_margin_rate,
      price_floor: product.price_floor,
      price_ceiling: product.price_ceiling,
    },
  }

  const { data: change, error: applyError } = await supabase.rpc('apply_product_price_change', {
    p_product_id: params.id,
    p_expected_old_price: product.our_price,
    p_new_price: recommendation.recommendedPrice,
    p_change_source: 'recommendation',
    p_reason: recommendation.reason,
    p_snapshot: snapshot,
  })

  if (applyError) {
    const stale = String(applyError.message ?? '').includes('price_changed_or_product_missing')
    return NextResponse.json({
      error: stale ? 'Ürün fiyatı başka bir işlemde değişti. Sayfayı yenileyin.' : 'Fiyat değişikliği kaydedilemedi.',
    }, { status: stale ? 409 : 500 })
  }

  return NextResponse.json({
    success: true,
    old_price: Number(product.our_price),
    new_price: recommendation.recommendedPrice,
    recommendation,
    change,
    external_sync: false,
    change_percent: changePercent,
  })
}
