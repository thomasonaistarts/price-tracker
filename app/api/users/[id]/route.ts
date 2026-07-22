import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { z } from 'zod'

const adminUserPatchSchema = z.object({
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').optional(),
  is_active: z.boolean().optional(),
  role: z.enum(['admin', 'user']).optional(),
}).strict()

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let currentAdminId: string
  try {
    currentAdminId = (await requireAdmin()).authUser.id
  } catch {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const parsed = adminUserPatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const body = parsed.data
  const { id } = params
  if (id === currentAdminId && (body.is_active === false || body.role === 'user')) {
    return NextResponse.json({ error: 'Kendi yönetici hesabınızı pasifleştiremez veya düşüremezsiniz' }, { status: 400 })
  }
  const supabase = createAdminClient() as any

  // Şifre değiştirme
  if (body.password !== undefined) {
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
