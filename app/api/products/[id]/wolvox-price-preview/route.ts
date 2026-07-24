import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { buildWolvoxPriceWritePreview } from '@/lib/integrations/wolvox-price-write'

const requestSchema = z.object({
  target_price: z.number().positive().finite(),
  proposal_id: z.string().uuid().nullable().optional(),
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
    return NextResponse.json({ error: 'Geçersiz WOLVOX fiyat önizlemesi' }, { status: 400 })
  }

  const supabase = await createClient() as any
  const { data: product } = await supabase
    .from('products')
    .select('id, our_price')
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!product) return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })

  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id')
    .eq('owner_user_id', userId)
    .eq('provider', 'wolvox')
    .maybeSingle()
  if (!connection) {
    return NextResponse.json({ error: 'WOLVOX bağlantısı bulunamadı' }, { status: 409 })
  }

  const { data: mapping } = await supabase
    .from('external_product_mappings')
    .select('external_id')
    .eq('connection_id', connection.id)
    .eq('product_id', params.id)
    .eq('status', 'active')
    .maybeSingle()
  if (!mapping?.external_id) {
    return NextResponse.json({ error: 'Ürünün WOLVOX eşlemesi bulunamadı' }, { status: 409 })
  }

  const preview = buildWolvoxPriceWritePreview({
    connectionId: connection.id,
    productId: params.id,
    externalId: mapping.external_id,
    currentPrice: Number(product.our_price),
    targetPrice: parsed.data.target_price,
    proposalId: parsed.data.proposal_id,
  })

  return NextResponse.json({
    preview,
    queued: false,
    written: false,
    message: 'Yazma komutu doğrulanana kadar yalnızca önizleme üretilebilir.',
  })
}
