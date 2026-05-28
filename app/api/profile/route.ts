import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  full_name: z.string().min(2, 'Ad soyad en az 2 karakter olmalı'),
})

export async function PATCH(req: NextRequest) {
  let userId: string
  try {
    const user = await requireAuth()
    userId = user.id
  } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('users')
    .update({ full_name: parsed.data.full_name })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
