import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminSupabase = createAdminClient() as any
  const { data: profile } = await adminSupabase
    .from('users').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') return null
  return user
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('category_thresholds')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
