import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { normalizeSourceUrl } from '@/lib/source-decisions'

const decisionSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  source_url: z.string().trim().url(),
  source_product_name: z.string().trim().max(500).optional().nullable(),
  decision: z.enum(['approved', 'rejected']),
})

const deleteSchema = decisionSchema.pick({ platform: true, source_url: true })

async function getContext(productId: string) {
  const user = await requireAuth()
  const supabase = await createClient() as any
  const { data: product, error } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !product) return null
  return { userId: user.id, supabase }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let context
  try { context = await getContext(params.id) } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }
  if (!context) return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })

  const parsed = decisionSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Kaynak kararı geçersiz' }, { status: 400 })

  const sourceUrl = normalizeSourceUrl(parsed.data.source_url)
  const { data, error } = await context.supabase
    .from('source_match_decisions')
    .upsert({
      product_id: params.id,
      user_id: context.userId,
      platform: parsed.data.platform,
      source_url: sourceUrl,
      source_product_name: parsed.data.source_product_name || null,
      decision: parsed.data.decision,
    }, { onConflict: 'product_id,platform,source_url' })
    .select('id, product_id, user_id, platform, source_url, source_product_name, decision, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: 'Kaynak kararı kaydedilemedi' }, { status: 500 })
  return NextResponse.json({ decision: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let context
  try { context = await getContext(params.id) } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }
  if (!context) return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 })

  const parsed = deleteSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Kaynak kararı geçersiz' }, { status: 400 })

  const { error } = await context.supabase
    .from('source_match_decisions')
    .delete()
    .eq('product_id', params.id)
    .eq('user_id', context.userId)
    .eq('platform', parsed.data.platform)
    .eq('source_url', normalizeSourceUrl(parsed.data.source_url))

  if (error) return NextResponse.json({ error: 'Kaynak kararı kaldırılamadı' }, { status: 500 })
  return NextResponse.json({ success: true })
}
