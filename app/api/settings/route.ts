import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getUserSettings, updateUserSettings } from '@/lib/user-settings'
import { userSettingsPatchSchema } from '@/lib/validations'

async function getAuthUser() {
  try {
    return await requireAuth()
  } catch {
    return null
  }
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
  const parsed = userSettingsPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const current = await getUserSettings(user.id)
  const candidate = { ...current, ...parsed.data }
  if (!(
    candidate.confidence_exact > candidate.confidence_high &&
    candidate.confidence_high > candidate.confidence_medium &&
    candidate.confidence_medium > candidate.confidence_low
  )) {
    return NextResponse.json(
      { error: 'Eşleşme eşikleri Tam > Yüksek > Orta > Düşük sırasını izlemelidir' },
      { status: 400 },
    )
  }

  const updated = await updateUserSettings(user.id, parsed.data)
  return NextResponse.json(updated)
}
