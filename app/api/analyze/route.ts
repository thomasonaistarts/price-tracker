import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { analyzeSchema } from '@/lib/validations'
import { runAnalysis } from '@/lib/analyzer'

export async function POST(req: NextRequest) {
  let userId: string
  try {
    const user = await requireAuth()
    userId = user.id
  } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = analyzeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { products, threshold_percent, min_sources, category_thresholds } = parsed.data
  const results = runAnalysis(products, threshold_percent, min_sources, category_thresholds)

  const supabase = await createClient() as any

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
      }, { onConflict: 'user_id,sku', ignoreDuplicates: false })
      .select('id')
      .single()

    if (productError || !product) continue

    await supaba
