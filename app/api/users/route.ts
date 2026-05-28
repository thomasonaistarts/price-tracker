import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { createUserSchema } from '@/lib/validations'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { email, password, full_name, role } = parsed.data
  const supabase = createAdminClient() as any

  // public.users'da aynı email varsa (trigger çakışmasını önlemek için) temizle
  // Bu durum: auth.users'da olmayan ama public.users'da kalan stale kayıt
  const { data: existingProfile } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile) {
    // auth.users'da bu id var mı kontrol et
    const { data: authCheck } = await supabase.auth.admin.getUserById(existingProfile.id)
    if (!authCheck?.user) {
      // auth.users'da yok ama public.users'da var → stale satır, temizle
      await supabase.from('users').delete().eq('id', existingProfile.id)
    } else {
      return NextResponse.json({ error: 'Bu e-posta adresi zaten kullanımda.' }, { status: 409 })
    }
  }

  // Auth kullanıcısını oluştur
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Trigger zaten public.users satırını oluşturmuş olabilir.
  // Upsert ile role'ü garantiyle set et (UPDATE da yapar, INSERT da).
  const { error: profileError } = await supabase
    .from('users')
    .upsert(
      { id: authData.user.id, email, full_name, role },
      { onConflict: 'id' }
    )

  if (profileError) {
    // Profil oluşturulamadıysa auth kullanıcısını geri al
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: authData.user.id }, { status: 201 })
}

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
