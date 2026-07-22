import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try { userId = (await requireAuth()).id } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const supabase = await createClient() as any
  await supabase.from('price_analyses').delete().eq('product_id', params.id).eq('user_id', userId)
  const { error } = await supabase.from('products').delete().eq('id', params.id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try { userId = (await requireAuth()).id } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const body = await req.json()
  const supabase = await createClient() as any
  const update: Record<string, unknown> = {}
  let requestedPrice: number | null = null
  if (body.our_price !== undefined) {
    const price = Number(body.our_price)
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: 'Fiyat sıfırdan büyük olmalıdır' }, { status: 400 })
    requestedPrice = price
  }
  if (body.product_name !== undefined) {
    if (typeof body.product_name !== 'string' || !body.product_name.trim()) return NextResponse.json({ error: 'Ürün adı boş olamaz' }, { status: 400 })
    update.product_name = body.product_name.trim()
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return NextResponse.json({ error: 'Geçersiz ürün durumu' }, { status: 400 })
    update.is_active = body.is_active
  }

  const nullableMoneyFields = ['purchase_cost', 'price_floor', 'price_ceiling'] as const
  const nonNegativeFields = ['vat_rate', 'commission_rate', 'shipping_cost', 'packaging_cost', 'target_margin_rate'] as const
  for (const field of nullableMoneyFields) {
    if (body[field] === undefined) continue
    if (body[field] === null || body[field] === '') {
      update[field] = null
      continue
    }
    const value = Number(body[field])
    if (!Number.isFinite(value) || value < 0 || (field !== 'purchase_cost' && value === 0)) {
      return NextResponse.json({ error: 'Geçersiz ' + field + ' değeri' }, { status: 400 })
    }
    update[field] = value
  }
  for (const field of nonNegativeFields) {
    if (body[field] === undefined) continue
    const value = Number(body[field])
    if (!Number.isFinite(value) || value < 0 || ((field === 'vat_rate' || field === 'commission_rate' || field === 'target_margin_rate') && value > 100)) {
      return NextResponse.json({ error: 'Geçersiz ' + field + ' değeri' }, { status: 400 })
    }
    update[field] = value
  }

  if (typeof update.commission_rate === 'number' && typeof update.target_margin_rate === 'number' && update.commission_rate + update.target_margin_rate >= 100) {
    return NextResponse.json({ error: 'Komisyon ve hedef marj toplamı %100’den küçük olmalıdır' }, { status: 400 })
  }
  if (typeof update.price_floor === 'number' && typeof update.price_ceiling === 'number' && update.price_ceiling < update.price_floor) {
    return NextResponse.json({ error: 'Maksimum fiyat minimum fiyattan düşük olamaz' }, { status: 400 })
  }
  if (Object.keys(update).length === 0 && requestedPrice == null) return NextResponse.json({ error: 'Güncellenecek alan bulunamadı' }, { status: 400 })

  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString()
    const { error } = await supabase.from('products').update(update).eq('id', params.id).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let priceChange = null
  if (requestedPrice != null) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('our_price')
      .eq('id', params.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (productError || !product) return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })
    const oldPrice = Number(product.our_price)
    if (Math.abs(oldPrice - requestedPrice) >= 0.01) {
      const { data, error } = await supabase.rpc('apply_product_price_change', {
        p_product_id: params.id,
        p_expected_old_price: oldPrice,
        p_new_price: requestedPrice,
        p_change_source: 'manual',
        p_reason: 'Ürün listesinden manuel fiyat güncellemesi',
        p_snapshot: {},
      })
      if (error) return NextResponse.json({ error: 'Fiyat değişikliği kaydedilemedi' }, { status: 500 })
      priceChange = data
    }
  }

  return NextResponse.json({ success: true, price_change: priceChange })
}
