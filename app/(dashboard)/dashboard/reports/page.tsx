import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

interface Analysis {
  id: string
  run_at: string
  alert: string
  alert_reason: string | null
  price_diff_percent: number
  market_mean: number
  our_price: number
  confidence: string
  products: {
    sku: string
    product_name: string
  } | null
}

function alertLabel(alert: string) {
  if (alert === 'above_market') return 'Piyasa üstü'
  if (alert === 'below_market') return 'Piyasa altı'
  return 'Normal'
}

function alertColor(alert: string) {
  if (alert === 'above_market') return 'bg-red-50 text-red-700 border-red-200'
  if (alert === 'below_market') return 'bg-green-50 text-green-700 border-green-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

export default async function ReportsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: analyses } = await supabase
    .from('price_analyses')
    .select('*, products(sku, product_name)')
    .eq('user_id', user.id)
    .order('run_at', { ascending: false })
    .limit(100)

  const analysisList = (analyses ?? []) as Analysis[]

  const alertCount = analysisList.filter(a => a.alert !== 'ok').length
  const aboveCount = analysisList.filter(a => a.alert === 'above_market').length
  const belowCount = analysisList.filter(a => a.alert === 'below_market').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900">Raporlar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Son 100 fiyat analizi</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Toplam analiz</div>
          <div className="text-2xl font-semibold text-gray-900">{analysisList.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Piyasa üstü</div>
          <div className="text-2xl font-semibold text-red-600">{aboveCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Piyasa altı</div>
          <div className="text-2xl font-semibold text-green-600">{belowCount}</div>
        </div>
      </div>

      {analysisList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">Henüz analiz yok</h3>
          <p className="text-sm text-gray-500">Fiyat analizi yaparak rapor oluşturun.</p>
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
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Bizim fiyat</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Piyasa ort.</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fark</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Güven</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {analysisList.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(a.run_at).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">
                      {a.products?.sku ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-gray-900">
                      {a.products?.product_name ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {a.our_price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">
                      {a.market_mean.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                    </td>
                    <td className="px-6 py-3 text-right font-medium">
                      <span className={a.price_diff_percent > 0 ? 'text-red-600' : 'text-green-600'}>
                        {a.price_diff_percent > 0 ? '+' : ''}{a.price_diff_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${alertColor(a.alert)}`}>
                        {alertLabel(a.alert)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center text-xs text-gray-500 capitalize">
                      {a.confidence}
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
