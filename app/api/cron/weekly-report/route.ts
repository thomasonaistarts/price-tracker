import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { validateCronRequest } from '@/lib/api-security'
import { computeReportData, generateWeeklyEmailHtml } from '@/lib/email-report'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserSettings, updateUserSettings } from '@/lib/user-settings'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const revalidate = 0

function getIstanbulSchedule() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const dayByName: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return { day: dayByName[weekday] ?? 1, hour }
}

export async function GET(req: NextRequest) {
  const authError = validateCronRequest(req)
  if (authError) return authError

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
    return NextResponse.json({ error: 'RESEND_API_KEY yapılandırılmamış' }, { status: 503 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = createAdminClient() as any
  const { day, hour } = getIstanbulSchedule()

  const { data: userRows } = await supabase
    .from('products')
    .select('user_id, users!inner(is_active)')
    .eq('is_active', true)
    .eq('users.is_active', true)

  const userIds: string[] = Array.from(
    new Set<string>((userRows ?? []).map((row: any) => row.user_id as string)),
  )
  if (userIds.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aktif ürün sahibi kullanıcı yok' })
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const duplicateCutoff = Date.now() - 6 * 24 * 60 * 60 * 1000
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const userId of userIds) {
    try {
      const settings = await getUserSettings(userId)
      const lastSent = settings.weekly_report_last_sent_at
        ? new Date(settings.weekly_report_last_sent_at).getTime()
        : 0

      if (
        !settings.weekly_report_enabled
        || settings.weekly_report_day !== day
        || settings.weekly_report_hour !== hour
        || lastSent > duplicateCutoff
      ) {
        skipped += 1
        continue
      }

      const { data: { user } } = await supabase.auth.admin.getUserById(userId)
      if (!user?.email) {
        skipped += 1
        continue
      }

      const [{ data: rawAnalyses }, { data: history }] = await Promise.all([
        supabase
          .from('price_analyses')
          .select(`
            product_id, run_at, alert, alert_reason, price_diff_percent,
            market_mean, min_price, sources_count, sources,
            products(sku, product_name, our_price, brand, category)
          `)
          .eq('user_id', userId)
          .order('run_at', { ascending: false })
          .limit(5000),
        supabase
          .from('price_analyses')
          .select('run_at, alert, product_id')
          .eq('user_id', userId)
          .gte('run_at', since)
          .order('run_at', { ascending: false })
          .limit(10000),
      ])

      if (!rawAnalyses?.length) {
        skipped += 1
        continue
      }

      const reportData = computeReportData(rawAnalyses, history ?? [], user.email)
      if (reportData.summary.total === 0) {
        skipped += 1
        continue
      }

      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM ?? 'Fiyat Takip <onboarding@resend.dev>',
        to: user.email,
        subject: `Haftalık Fiyat Raporu — ${reportData.generatedAt}`,
        html: generateWeeklyEmailHtml(reportData),
      })

      if (error) {
        failed += 1
        continue
      }

      await updateUserSettings(userId, { weekly_report_last_sent_at: new Date().toISOString() })
      sent += 1
    } catch {
      failed += 1
    }
  }

  return NextResponse.json({
    sent,
    failed,
    skipped,
    eligible_users: userIds.length,
    schedule_timezone: 'Europe/Istanbul',
  })
}
