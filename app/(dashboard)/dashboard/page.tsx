import { requireAuth, getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AlertType } from '@/types/database'

interface AnalysisSummary {
  alert: AlertType
  run_at: string
}

async function getStats(userId: string) {
  const supabase = await createClient()
  const [productsRes, analysesRes] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact' }).eq('user_id', userId).eq('is_active', true),
    supabase.from('price_analyses').select('alert, run_at').eq('user_id', userId).gte('run_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ])
  const analyses = (analysesRes.data ?? []) as AnalysisSummary[]
  return {
    totalProducts: productsRes.count ?? 0,
    alertsThisWeek: analyses.filter(a => a.alert === 'above_market' || a.alert === 'below_market').length,
    analysesThisWeek: analyses.length,
    lastRun: analyses.sort((a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime())[0]?.run_at ?? null,
  }
}

export default async function DashboardPage() {
  const authUser = await requireAuth()
  const profile = await getUserProfile(authUser.id)
  const stats = await getStats(authUser.id)

  const cards = [
    { label: 'Aktif ürün', value: stats.totalProducts, sub: 'toplam katalog' },
    { label: 'Bu hafta analiz', value: stats.analysesThisWeek, sub: 'son 7 gün' },
    { label: 'Fiyat uyarısı', value: stats.alertsThisWeek, sub: 'bu hafta' },
    { label: 'Son analiz', value: stats.lastRun ? new Date(stats.lastRun).toLocaleDateString('tr-TR') : '—', sub: 'tarih' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900">
          Merhaba, {profile?.full_name?.split(' ')[0] ?? 'Kullanıcı'} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Fiyat izleme paneline hoş geldiniz.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className="text-2xl font-semibold text-gray-900">{c.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-700 mb-4">Hızlı başlangıç</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { href: '/dashboard/analyze', icon: '🔍', title: 'Fiyat analizi yap', desc: 'CSV/XLSX yükleyerek piyasa analizi başlatın' },
            { href: '/dashboard/products', icon: '📦', title: 'Ürünleri yönet', desc: 'Ürün ekleyin, düzenleyin veya silin' },
            { href: '/dashboard/reports', icon: '📊', title: 'Raporlar', desc: 'Geçmiş analizleri ve trend grafikleri görün' },
          ].map(item => (
            <a key={item.href} href={item.href} className="flex gap-3 p-4 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-800">{item.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
