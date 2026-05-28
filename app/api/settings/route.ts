import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings, updateUserSettings } from '@/lib/user-settings'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })

  const settings = await getUserSettings(user.id)
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })

  const body = await req.json()
  const updated = await updateUserSettings(user.id, body)
  return NextResponse.json(updated)
}
