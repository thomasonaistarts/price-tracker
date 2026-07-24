import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { requiresLargePriceChangeConfirmation } from '@/lib/price-change-safety'

const nullablePositive = z.union([z.number().positive().finite(), z.null()])
const requestSchema = z.object({
  ecommerce_enabled: z.boolean(),
  ecommerce_price: nullablePositive,
  ecommerce_commission_rate: z.number().min(0).max(100).finite(),
  ecommerce_payment_fee_rate: z.number().min(0).max(100).finite(),
  ecommerce_shipping_cost: z.number().min(0).finite(),
  ecommerce_packaging_cost: z.number().min(0).finite(),
  ecommerce_target_margin_rate: z.number().min(0).max(100).finite(),
  ecommerce_price_floor: nullablePositive,
  ecommerce_price_ceiling: nullablePositive,
  safety_stock: z.number().min(0).finite(),
  confirm_large_change: z.boolean().default(false),
}).strict()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try {
    userId = (await requireAuth()).id
  } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz e-ticaret fiyat ayarı' }, { status: 400 })
  }
  const input = parsed.data
  if (
    input.ecommerce_commission_rate
      + input.ecommerce_payment_fee_rate
      + input.ecommerce_target_margin_rate
    >= 100
  ) {
    return NextResponse.json({
      error: 'Komisyon, ödeme maliyeti ve hedef marj toplamı %100’den küçük olmalıdır',
    }, { status: 400 })
  }
  if (
    input.ecommerce_price_floor != null
      && input.ecommerce_price_ceiling != null
      && input.ecommerce_price_ceiling < input.ecommerce_price_floor
  ) {
    return NextResponse.json({ error: 'Maksimum fiyat minimum fiyattan düşük olamaz' }, { status: 400 })
  }
  if (input.ecommerce_enabled && input.ecommerce_price == null) {
    return NextResponse.json({ error: 'E-ticaret yayını için satış fiyatı gerekli' }, { status: 400 })
  }

  const supabase = await createClient() as any
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, our_price, ecommerce_price')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (productError || !product) {
    const migrationMissing = productError?.code === '42703'
      || /ecommerce_price/i.test(productError?.message ?? '')
    return NextResponse.json({
      error: migrationMissing
        ? 'E-ticaret fiyat veri modeli henüz kurulmamış'
        : 'Ürün bulunamadı',
    }, { status: migrationMissing ? 503 : 404 })
  }

  const currentPrice = Number(product.ecommerce_price ?? product.our_price)
  if (
    input.ecommerce_price != null
      && requiresLargePriceChangeConfirmation(currentPrice, input.ecommerce_price)
      && !input.confirm_large_change
  ) {
    return NextResponse.json({
      error: '%10 üzerindeki e-ticaret fiyat değişikliği için ek onay gerekli',
      requires_extra_approval: true,
    }, { status: 409 })
  }

  const { data: values, error } = await supabase.rpc(
    'apply_ecommerce_pricing_configuration',
    {
      p_product_id: params.id,
      p_ecommerce_enabled: input.ecommerce_enabled,
      p_ecommerce_price: input.ecommerce_price,
      p_commission_rate: input.ecommerce_commission_rate,
      p_payment_fee_rate: input.ecommerce_payment_fee_rate,
      p_shipping_cost: input.ecommerce_shipping_cost,
      p_packaging_cost: input.ecommerce_packaging_cost,
      p_target_margin_rate: input.ecommerce_target_margin_rate,
      p_price_floor: input.ecommerce_price_floor,
      p_price_ceiling: input.ecommerce_price_ceiling,
      p_safety_stock: input.safety_stock,
      p_confirm_large_change: input.confirm_large_change,
    },
  )
  if (error) {
    const migrationMissing = error.code === '42883'
      || /apply_ecommerce_pricing_configuration/i.test(error.message ?? '')
    const extraApprovalRequired = /large_price_change_requires_confirmation/i.test(
      error.message ?? '',
    )
    return NextResponse.json({
      error: migrationMissing
        ? 'E-ticaret fiyat veri modeli henüz kurulmamış'
        : extraApprovalRequired
          ? '%10 üzerindeki e-ticaret fiyat değişikliği için ek onay gerekli'
          : 'E-ticaret fiyat ayarı kaydedilemedi',
      ...(extraApprovalRequired ? { requires_extra_approval: true } : {}),
    }, {
      status: migrationMissing ? 503 : extraApprovalRequired ? 409 : 500,
    })
  }

  return NextResponse.json({
    success: true,
    values,
    wolvox_written: false,
    feed_ready: input.ecommerce_enabled && input.ecommerce_price != null,
  })
}
