import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const COUNT_TABLES = [
  'users', 'user_settings', 'category_thresholds', 'products', 'price_analyses',
  'analysis_attempts', 'source_match_decisions', 'product_price_changes',
] as const

async function getCounts(supabase: any) {
  const entries = await Promise.all(COUNT_TABLES.map(async table => {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) throw error
    return [table, count ?? 0] as const
  }))
  return Object.fromEntries(entries)
}

export async function GET() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Yönetici yetkisi gerekli' }, { status: 403 })
  }
  const supabase = createAdminClient() as any
  try {
    const [counts, usersResult, connectionsResult, archivesResult] = await Promise.all([
      getCounts(supabase),
      supabase.from('users').select('id, email, full_name, role, is_active').order('full_name'),
      supabase.from('integration_connections').select('*').eq('provider', 'wolvox').order('created_at', { ascending: false }),
      supabase.from('data_archive_batches').select('*').order('created_at', { ascending: false }).limit(10),
    ])
    return NextResponse.json({
      counts,
      users: usersResult.data ?? [],
      connections: connectionsResult.data ?? [],
      archives: archivesResult.data ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Entegrasyon verileri okunamadı. Migration uygulanmış olmalıdır.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let adminId: string
  try { adminId = (await requireAdmin()).authUser.id } catch {
    return NextResponse.json({ error: 'Yönetici yetkisi gerekli' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))

  if (body.action === 'create_archive') {
    const supabase = await createClient() as any
    const { data, error } = await supabase.rpc('create_site_catalog_archive', {
      p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : 'Wolvox geçişi öncesi site arşivi',
    })
    if (error) return NextResponse.json({ error: 'Arşiv oluşturulamadı: ' + error.message }, { status: 500 })
    return NextResponse.json({ success: true, batch_id: data })
  }

  if (body.action === 'assign_connection') {
    if (typeof body.owner_user_id !== 'string' || !body.owner_user_id) {
      return NextResponse.json({ error: 'Bağlantı sahibi kullanıcı gerekli' }, { status: 400 })
    }
    const supabase = createAdminClient() as any
    const { data: owner } = await supabase
      .from('users')
      .select('id, full_name, email, is_active')
      .eq('id', body.owner_user_id)
      .maybeSingle()
    if (!owner || !owner.is_active) return NextResponse.json({ error: 'Aktif kullanıcı bulunamadı' }, { status: 404 })

    const { data, error } = await supabase
      .from('integration_connections')
      .upsert({
        owner_user_id: owner.id,
        provider: 'wolvox',
        display_name: 'Wolvox · ' + owner.full_name,
        status: 'configuring',
        created_by: adminId,
      }, { onConflict: 'owner_user_id,provider' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Wolvox bağlantısı atanamadı' }, { status: 500 })
    return NextResponse.json({ success: true, connection: data })
  }

  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })
}
