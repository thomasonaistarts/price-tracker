import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import UserTable from '@/components/admin/UserTable'

export default async function AdminUsersPage() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Kullanıcı yönetimi</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users?.length ?? 0} kullanıcı</p>
        </div>
        <a
          href="/admin/users/new"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Yeni kullanıcı
        </a>
      </div>
      <UserTable users={users ?? []} />
    </div>
  )
}
