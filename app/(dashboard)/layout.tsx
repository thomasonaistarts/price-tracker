import { getUserProfile, requireAuth } from '@/lib/auth'
import DashboardShell from '@/components/layout/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAuth()
  const profile = await getUserProfile(user.id)

  return (
    <DashboardShell role={profile?.role ?? 'user'} user={profile}>
      {children}
    </DashboardShell>
  )
}
