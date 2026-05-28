'use client'

import { useState } from 'react'
import type { User } from '@/types/database'

interface Props {
  profile: User | null
}

export default function ProfileForm({ profile }: Props) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (fullName.trim().length < 2) {
      setMessage({ type: 'error', text: 'Ad soyad en az 2 karakter olmalı' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage({ type: 'success', text: 'Profil güncellendi.' })
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Bir hata oluştu.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Profil bilgileri</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">E-posta</label>
          <input
            type="text"
            value={profile?.email ?? ''}
            disabled
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">E-posta adresi değiştirilemez</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Ad soyad</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Ahmet Yılmaz"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Rol</label>
          <input
            type="text"
            value={profile?.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
            disabled
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 cursor-not-allowed"
          />
        </div>
        {message && (
          <div className={`rounded-lg px-3 py-2 text-sm border ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
          }`}>
            {message.text}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Kaydediliyor...' : 'Değişiklikleri kaydet'}
        </button>
      </form>
    </div>
  )
}
