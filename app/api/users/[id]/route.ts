import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const body = await req.json()
  const { id } = params
  const supabase = createAdminClient() as any

  // Şifre değiştirme
  if (body.password !== undefined) {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'Şifre en az 8 karakter olmalı' }, { status: 400 })
    }
    const { error } = await supabase.auth.admin.updateUserById(id, {
      password: body.password,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // is_active / role güncelleme
  const profileUpdates: Record<string, unknown> = {}
  if (body.is_active !== undefined) profileUpdates.is_active = body.is_active
  if (body.role !== undefined) profileUpdates.role = body.role

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from('users')
      .update(profileUpdates)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
