import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import UserTable from '@/components/admin/UserTable'

export default async function AdminUsersPage() {
  await requireAdmin()

  const supabase = createAdminClient()
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  const userList = (users ?? []) as any[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Kullanıcı yönetimi</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{userList.length} kullanıcı</p>
        </div>
        <a
          href="/admin/users/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Yeni kullanıcı
        </a>
      </div>
      <UserTable users={userList} />
    </div>
  )
}
