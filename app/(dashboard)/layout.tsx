import { requireAuth, getUserProfile } from '@/lib/auth'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authUser = await requireAuth()
  const profile = await getUserProfile(authUser.id)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar role={profile?.role ?? 'user'} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={profile} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
