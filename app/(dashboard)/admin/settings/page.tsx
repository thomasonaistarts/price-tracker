import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/user-settings'
import SettingsClient from '@/components/admin/SettingsClient'
import type { CategoryThreshold } from '@/types/database'
import { fetchAllRows } from '@/lib/supabase/paginate'
import {
  summarizePlatformHealth,
  summarizeScrapeUsage,
  type AnalysisHealthRow,
} from '@/lib/platform-health'
import PlatformHealthPanel from '@/components/admin/PlatformHealthPanel'

export default async function AdminSettingsPage() {
  const { authUser } = await requireAdmin()
  const supabase = createAdminClient() as any

  const healthCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [settings, thresholdsResult, categoryRows, healthRows] = await Promise.all([
    getUserSettings(authUser.id),
    supabase
      .from('category_thresholds')
      .select('*')
      .eq('user_id', authUser.id)
      .order('category'),
    fetchAllRows<{ category: string }>(async (from, to) => supabase
      .from('products')
      .select('category')
      .eq('user_id', authUser.id)
      .not('category', 'is', null)
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows<AnalysisHealthRow>(async (from, to) => supabase
      .from('analysis_attempts')
      .select('attempted_at, scraper_health')
      .eq('user_id', authUser.id)
      .gte('attempted_at', healthCutoff)
      .order('attempted_at', { ascending: false })
      .range(from, to)),
  ])

  const productCategories = Array.from(new Set(categoryRows.map(row => row.category))).sort()
  const platformHealth = summarizePlatformHealth(healthRows)
  const dailyCreditLimit = Number(process.env.SCRAPER_API_DAILY_CREDIT_LIMIT)
  const scrapeUsage = summarizeScrapeUsage(
    healthRows,
    Number.isFinite(dailyCreditLimit) ? dailyCreditLimit : null,
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Sistem ayarları</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Fiyat analizi parametreleri, aktif platformlar ve bildirim tercihlerinizi yönetin
        </p>
      </div>
      <PlatformHealthPanel summaries={platformHealth} usage={scrapeUsage} />
      <SettingsClient
        initialSettings={settings}
        initialThresholds={(thresholdsResult.data ?? []) as CategoryThreshold[]}
        productCategories={productCategories}
      />
    </div>
  )
}
