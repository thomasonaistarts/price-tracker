import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

interface Product {
  id: string
  sku: string
  product_name: string
  brand: string | null
  category: string | null
  our_price: number
  currency: string | null
  is_active: boolean
  created_at: string
}

export default async function ProductsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const productList = (products ?? []) as Product[]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Ürünler</h1>
          <p className="text-sm text-gray-500 mt-0.5">{productList.length} ürün</p>
        </div>
      </div>

      {productList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">Henüz ürün yok</h3>
          <p className="text-sm text-gray-500">Fiyat analizi yaparak ürünlerinizi sisteme ekleyin.</p>
          <a href="/dashboard/analyze" className="inline-flex items-center mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium">
            Fiyat analizi yap →
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün adı</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Marka</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kategori</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fiyat</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Eklenme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productList.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{p.sku}</td>
                    <td className="px-6 py-3 text-gray-900 font-medium">{p.product_name}</td>
                    <td className="px-6 py-3 text-gray-500">{p.brand ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-500">{p.category ?? '—'}</td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {p.our_price.toLocaleString('tr-TR', { style: 'currency', currency: p.currency ?? 'TRY' })}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${p.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {p.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-400 text-xs">
                      {new Date(p.created_at).toLocaleDateString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
