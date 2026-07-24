import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  canWriteIdentityToWolvox,
  proposeProductIdentity,
} from '@/lib/product-identity-enrichment'

const nullableIdentityField = z.union([
  z.string().trim().min(1).max(160),
  z.null(),
])

const requestSchema = z.object({
  brand: nullableIdentityField.optional(),
  manufacturer_code: nullableIdentityField.optional(),
  product_type: nullableIdentityField.optional(),
}).strict().refine(
  value => Object.values(value).some(item => item !== undefined),
  'En az bir kimlik alanı gerekli',
)

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
    return NextResponse.json({ error: 'Geçersiz ürün kimliği' }, { status: 400 })
  }

  const supabase = await createClient() as any
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, product_name, brand, manufacturer_code, product_type')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (productError) {
    const migrationMissing = productError.code === '42703'
      || /manufacturer_code|product_type/i.test(productError.message ?? '')
    return NextResponse.json({
      error: migrationMissing
        ? 'Ürün kimliği veri modeli henüz kurulmamış'
        : 'Ürün kimliği okunamadı',
    }, { status: migrationMissing ? 503 : 500 })
  }
  if (!product) {
    return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })
  }

  const identity = {
    brand: parsed.data.brand === undefined ? product.brand : parsed.data.brand,
    manufacturerCode: parsed.data.manufacturer_code === undefined
      ? product.manufacturer_code
      : parsed.data.manufacturer_code,
    productType: parsed.data.product_type === undefined
      ? product.product_type
      : parsed.data.product_type,
  }
  const proposal = proposeProductIdentity([{
    source: 'manual',
    sourceLabel: 'Fiyatlaa ürün yönetimi',
    productName: product.product_name,
    brand: identity.brand,
    manufacturerCode: identity.manufacturerCode,
    productType: identity.productType,
    verified: true,
  }])

  const { data, error } = await supabase.rpc('apply_manual_product_identity', {
    p_product_id: params.id,
    p_brand: proposal.brand,
    p_manufacturer_code: proposal.manufacturerCode,
    p_product_type: proposal.productType,
    p_evidence: proposal.evidence,
  })

  if (error) {
    const migrationMissing = error.code === '42883'
      || error.code === '42703'
      || /apply_manual_product_identity|manufacturer_code|product_type/i.test(error.message ?? '')
    return NextResponse.json({
      error: migrationMissing
        ? 'Ürün kimliği veri modeli henüz kurulmamış'
        : 'Ürün kimliği kaydedilemedi',
    }, { status: migrationMissing ? 503 : 500 })
  }

  return NextResponse.json({
    success: true,
    identity: data,
    wolvox_write_eligible: canWriteIdentityToWolvox(proposal),
    wolvox_written: false,
  })
}
