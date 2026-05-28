'use client'
import { useState } from 'react'

interface AnalysisResult {
  sku: string
  product_name: string
  our_price: number
  market_mean: number
  price_diff_percent: number
  alert: string
  alert_reason: string
  confidence: string
}

export default function AnalyzePage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [error, setError] = useState('')
  const [threshold, setThreshold] = useState(10)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')
    setResults([])

    try {
      const Papa = (await import('papaparse')).default
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (parsed) => {
          try {
            const res = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                products: parsed.data,
                threshold_percent: threshold,
                min_sources: 2,
              }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setResults(data.results)
          } catch (err: any) {
            setError(err.message)
          } finally {
            setLoading(false)
          }
        },
        error: () => {
          setError('CSV dosyası okunamadı.')
          setLoading(false)
        },
      })
    } catch {
      setError('Dosya işlenirken hata oluştu.')
      setLoading(false)
    }
  }

  function alertColor(alert: string) {
    if (alert === 'above_market') return 'bg-red-50 text-red-700 border-red-200'
    if (alert === 'below_market') return 'bg-green-50 text-green-700 border-green-200'
    return 'bg-gray-50 text-gray-600 border-gray-200'
  }

  function alertLabel(alert: string) {
    if (alert === 'above_market') return 'Piyasa üstü'
    if (alert === 'below_market') return 'Piyasa altı'
    return 'Normal'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium text-gray-900">Fiyat analizi</h1>
        <p className="text-sm text-gray-500 mt-0.5">CSV dosyası yükleyerek piyasa karşılaştırması yapın</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">CSV Dosyası</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-400 mt-1">Kolonlar: sku, product_name, our_price, competitor_price, source</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Eşik değeri: %{threshold}
            </label>
            <input
              type="range"
              min={5}
              max={30}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">Bu yüzde farkın üzerindeki ürünler uyarı alır</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Analiz yapılıyor...
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{results.length} ürün analiz edildi</span>
            <span className="text-sm text-gray-500">
              {results.filter(r => r.alert !== 'ok').length} uyarı
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Bizim fiyat</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Piyasa ort.</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fark</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{r.sku}</td>
                    <td className="px-6 py-3 text-gray-900">{r.product_name}</td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {r.our_price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">
                      {r.market_mean.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                    </td>
                    <td className="px-6 py-3 text-right font-medium">
                      <span className={r.price_diff_percent > 0 ? 'text-red-600' : 'text-green-600'}>
                        {r.price_diff_percent > 0 ? '+' : ''}{r.price_diff_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${alertColor(r.alert)}`}>
                        {alertLabel(r.alert)}
                      </span>
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
