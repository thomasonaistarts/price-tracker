import { requireAdmin } from '@/lib/auth'
import WolvoxIntegrationAdmin from '@/components/admin/WolvoxIntegrationAdmin'

export default async function AdminIntegrationsPage() {
  await requireAdmin()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Entegrasyonlar</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Site arşivi ve Wolvox bağlantı hazırlığını yönetin</p>
      </div>
      <WolvoxIntegrationAdmin />
    </div>
  )
}
