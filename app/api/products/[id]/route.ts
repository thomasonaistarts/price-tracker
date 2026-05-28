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
  if (body.our_price !== undefined) update.our_price = body.our_price
  if (body.product_name !== undefined) update.product_name = body.product_name
  if (body.is_active !== undefined) update.is_active = body.is_active

  const { error } = await supabase
    .from('products')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
