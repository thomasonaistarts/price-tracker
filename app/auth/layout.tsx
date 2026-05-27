export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Fiyat İzleme Sistemi</h1>
          <p className="text-sm text-gray-500 mt-1">Türkiye pazar fiyat analizi</p>
        </div>
        {children}
      </div>
    </div>
  )
}
