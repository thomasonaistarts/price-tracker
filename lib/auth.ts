import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User } from '@/types/database'

export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')
  return user
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}

export async function requireAdmin() {
  const authUser = await requireAuth()
  const profile = await getUserProfile(authUser.id)
  if (profile?.role !== 'admin') redirect('/dashboard')
  return { authUser, profile }
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
