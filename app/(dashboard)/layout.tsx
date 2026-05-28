import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import Sidebar from '@/components/layout/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const profile = await getUserProfile(user.id)

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar role={profile?.role ?? 'user'} user={profile} />
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
