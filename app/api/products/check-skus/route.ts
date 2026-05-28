import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  let userId: string
  try { userId = (await requireAuth()).id } catch {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }

  const { skus } = await req.json() as { skus: string[] }
  if (!Array.isArray(skus) || skus.length === 0) {
    return NextResponse.json({ existing: [], new_skus: skus ?? [] })
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('sku')
    .eq('user_id', userId)
    .in('sku', skus)

  const existingSet = new Set((data ?? []).map(p => p.sku))
  return NextResponse.json({
    existing: skus.filter(s => existingSet.has(s)),
    new_skus: skus.filter(s => !existingSet.has(s)),
  })
}
