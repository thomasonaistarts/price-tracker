import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
  redirect('/auth/login')  // ← /login değil, /auth/login
}

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <span className="font-semibold text-gray-900">Price Tracker</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-sm text-red-600 hover:text-red-700"
              >
                Çıkış
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="p-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
