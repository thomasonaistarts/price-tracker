import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { z } from 'zod'

const thresholdSchema = z.object({
  category: z.string().min(1, 'Kategori adı zorunlu'),
  threshold_percent: z.number().min(1).max(50),
})

async function getAdminUser() {
  try {
    return (await requireAdmin()).authUser
  } catch {
    return null
  }
}

export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('category_thresholds')
    .select('*')
    .eq('user_id', user.id)
    .order('category')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })

  const body = await req.json()
  const parsed = thresholdSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('category_thresholds')
    .upsert(
      {
        user_id: user.id,
        category: parsed.data.category,
        threshold_percent: parsed.data.threshold_percent,
      },
      { onConflict: 'user_id,category' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
