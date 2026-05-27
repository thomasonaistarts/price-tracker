import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User } from '@/types/database'

// Oturum açmış kullanıcıyı al; yoksa login'e yönlendir
export async function requireAuth() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')
  return user
}

// Kullanıcı profilini al (public.users tablosundan)
export async function getUserProfile(userId: string): Promise<User | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}

// Admin yetkisi kontrolü
export async function requireAdmin() {
  const authUser = await requireAuth()
  const profile = await getUserProfile(authUser.id)
  if (profile?.role !== 'admin') redirect('/dashboard')
  return { authUser, profile }
}

// Giriş
export async function signIn(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

// Çıkış
export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
