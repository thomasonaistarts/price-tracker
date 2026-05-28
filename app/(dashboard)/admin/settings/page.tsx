import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/user-settings'
import SettingsClient from '@/components/admin/SettingsClient'
import type { CategoryThreshold } from '@/types/database'

export default async function AdminSettingsPage() {
  const { authUser } = await requireAdmin()
  const supabase = createAdminClient() as any

  const [settings, thresholdsResult, categoriesResult] = await Promise.all([
    getUserSettings(authUser.id),
    supabase
      .from('category_thresholds')
      .select('*')
      .eq('user_id', authUser.id)
      .order('category'),
    supabase
      .from('products')
      .select('category')
      .eq('user_id', authUser.id)
      .not('category', 'is', null),
  ])

  const rawCategories: string[] = (categoriesResult.data ?? [])
    .map((p: { category: string }) => p.category)
    .filter(Boolean)
  const productCategories = Array.from(new Set(rawCategories)).sort() as string[]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Sistem ayarları</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Fiyat analizi parametreleri, aktif platformlar ve bildirim tercihlerinizi yönetin
        </p>
      </div>
      <SettingsClient
        initialSettings={settings}
        initialThresholds={(thresholdsResult.data ?? []) as CategoryThreshold[]}
        productCategories={productCategories}
      />
    </div>
  )
}
