import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

async function getAdminUser() {
  try {
    return (await requireAdmin()).authUser
  } catch {
    return null
  }
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
