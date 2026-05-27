export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}
