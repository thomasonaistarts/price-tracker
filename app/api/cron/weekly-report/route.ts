import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import { computeReportData, generateWeeklyEmailHtml } from '@/lib/email-report'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
    return NextResponse.json({ error: 'RESEND_API_KEY yapılandırılmamış' }, { status: 503 })
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  // Cron güvenlik kontrolü
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient() as any

  // Ürünü olan tüm kullanıcıları bul
  const { data: userRows } = await supabase
    .from('products')
    .select('user_id')
    .eq('is_active', true)

  const userIds = Array.from(new Set((userRows ?? []).map((r: any) => r.user_id as string)))

  if (userIds.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aktif ürün sahibi kullanıcı yok' })
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const userId of userIds) {
    try {
      // Kullanıcı email adresini al
      const { data: { user } } = await supabase.auth.admin.getUserById(userId)
      if (!user?.email) continue

      // Kullanıcının son analizleri (ürün başına en son)
      const { data: rawAnalyses } = await supabase
        .from('price_analyses')
        .select(`
          product_id, run_at, alert, alert_reason, price_diff_percent,
          market_mean, min_price, sources_count, sources,
          products(sku, product_name, our_price, brand, category)
        `)
        .eq('user_id', userId)
        .order('run_at', { ascending: false })
        .limit(5000)

      if (!rawAnalyses?.length) continue

      // Trend verisi (son 90 gün)
      const { data: history } = await supabase
        .from('price_analyses')
        .select('run_at, alert, product_id')
        .eq('user_id', userId)
        .gte('run_at', since)
        .order('run_at', { ascending: false })
        .limit(10000)

      // Rapor verisi hesapla
      const reportData = computeReportData(
        rawAnalyses ?? [],
        history ?? [],
        user.email,
      )

      // Analiz edilmiş ürün yoksa e-posta gönderme
      if (reportData.summary.total === 0) continue

      // E-posta gönder
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM ?? 'Fiyat Takip <onboarding@resend.dev>',
        to: user.email,
        subject: `Haftalık Fiyat Raporu — ${reportData.generatedAt}`,
        html: generateWeeklyEmailHtml(reportData),
      })

      if (error) {
        errors.push(`${user.email}: ${error.message}`)
        failed++
      } else {
        sent++
      }
    } catch (err: any) {
      errors.push(`userId ${userId}: ${err?.message ?? 'Bilinmeyen hata'}`)
      failed++
    }
  }

  return NextResponse.json({
    sent,
    failed,
    total_users: userIds.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
