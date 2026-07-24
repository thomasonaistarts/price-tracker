import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  buildProductIdentityEvidence,
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  let userId: string
  try {
    userId = (await requireAuth()).id
  } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const supabase = await createClient() as any
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, product_name, brand, manufacturer_code, product_type, external_source')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (productError || !product) {
    return NextResponse.json(
      { error: productError ? 'Ürün kimliği okunamadı' : 'Ürün bulunamadı' },
      { status: productError ? 500 : 404 },
    )
  }

  const [profileResult, memoryResult, analysisResult] = await Promise.all([
    supabase
      .from('product_identity_profiles')
      .select('status, evidence')
      .eq('product_id', product.id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('product_source_memory')
      .select('platform, source_url, source_product_name')
      .eq('product_id', product.id)
      .eq('user_id', userId)
      .eq('status', 'verified'),
    supabase
      .from('price_analyses')
      .select('sources')
      .eq('product_id', product.id)
      .eq('user_id', userId)
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const migrationMissing = [profileResult.error, memoryResult.error]
    .some(error => error && (
      error.code === '42P01'
      || /product_identity_profiles|product_source_memory/i.test(error.message ?? '')
    ))
  if (migrationMissing) {
    return NextResponse.json({
      error: 'Ürün kimliği kanıt tabloları henüz kurulmamış',
    }, { status: 503 })
  }
  if (profileResult.error || memoryResult.error || analysisResult.error) {
    return NextResponse.json({
      error: 'Ürün kimliği kanıtları okunamadı',
    }, { status: 500 })
  }

  const latestSources = Array.isArray(analysisResult.data?.sources)
    ? analysisResult.data.sources
    : []
  const evidence = buildProductIdentityEvidence({
    product: {
      productName: product.product_name,
      brand: product.brand,
      manufacturerCode: product.manufacturer_code,
      productType: product.product_type,
      externalSource: product.external_source,
    },
    profile: profileResult.data,
    rememberedSources: (memoryResult.data ?? []).map((source: any) => ({
      platform: source.platform,
      sourceUrl: source.source_url,
      productName: source.source_product_name,
    })),
    latestSources,
  })
  const proposal = proposeProductIdentity(evidence)

  return NextResponse.json({
    current: {
      brand: product.brand,
      manufacturer_code: product.manufacturer_code,
      product_type: product.product_type,
    },
    proposal: {
      brand: proposal.brand,
      manufacturer_code: proposal.manufacturerCode,
      product_type: proposal.productType,
      confidence: proposal.confidence,
      approval_required: proposal.approvalRequired,
    },
    evidence,
    writes_performed: 0,
  })
}

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
