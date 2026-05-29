'use client'

import { useState } from 'react'
import type { CategoryThreshold } from '@/types/database'

interface Props {
  initialThresholds: CategoryThreshold[]
}

const CATEGORY_SUGGESTIONS = [
  'Kalem', 'Defter', 'Silgi', 'Kalemtıraş', 'Not Kağıdı',
  'Ambalaj', 'Klasör', 'Bant', 'Genel',
]

export default function CategoryThresholds({ initialThresholds }: Props) {
  const [thresholds, setThresholds] = useState(initialThresholds)
  const [form, setForm] = useState({ category: '', threshold_percent: 10 })
  const [loading, setLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category.trim()) { setError('Kategori adı zorunlu'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: form.category.trim(), threshold_percent: form.threshold_percent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Upsert: replace existing if same category
      setThresholds(prev => {
        const filtered = prev.filter(t => t.category !== data.category)
        return [...filtered, data].sort((a, b) => a.category.localeCompare(b.category))
      })
      setForm({ category: '', threshold_percent: 10 })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(id)
    try {
      const res = await fetch(`/api/thresholds/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Silinemedi')
      setThresholds(prev => prev.filter(t => t.id !== id))
    } catch {
      // silent
    } finally {
      setDeleteLoading(null)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Mevcut eşikler */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Kategori eşikleri</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Fiyat analizi sırasında kategori bazlı uyarı eşiği uygulanır. Tanımlanmamış kategoriler için genel eşik kullanılır.
          </p>
        </div>

        {thresholds.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Henüz kategori eşiği tanımlanmamış.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kategori</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Eşik (%)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {thresholds.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{t.category}</td>
                  <td className="px-6 py-3 text-right text-gray-700">%{t.threshold_percent}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleteLoading === t.id}
                      className="text-xs text-red-500 hover:text-red-700 px-2.5 py-1 rounded border border-red-200 hover:border-red-300 transition-colors disabled:opacity-40"
                    >
                      {deleteLoading === t.id ? '...' : 'Sil'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Yeni eşik ekle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Yeni eşik ekle</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kategori</label>
              <input
                type="text"
                list="category-suggestions"
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder="örn. Kalem"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Eşik: %{form.threshold_percent}
              </label>
              <input
                type="range"
                min={1}
                max={50}
                value={form.threshold_percent}
                onChange={e => setForm(prev => ({ ...prev, threshold_percent: Number(e.target.value) }))}
                className="w-full mt-2"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>%1</span>
                <span>%50</span>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </form>
      </div>
    </div>
  )
}
