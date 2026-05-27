'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [debug, setDebug] = useState('')

  async function handleLogin() {
    setError('')
    setDebug('handleLogin çalıştı...')
    setLoading(true)

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      setDebug(`URL: ${url ? url.slice(0,30) : 'YOK'} | KEY: ${key ? 'var' : 'YOK'}`)

      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError(authError.message)
        setDebug('Auth hatası: ' + authError.message)
        setLoading(false)
        return
      }

      if (data.session) {
        setDebug('Giriş başarılı, yönlendiriliyor...')
        window.location.href = '/dashboard'
      } else {
        setError('Oturum açılamadı.')
        setLoading(false)
      }
    } catch(err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError('Beklenmeyen hata: ' + msg)
      setDebug('catch: ' + msg)
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
      <h2 className="text-lg font-medium text-gray-900 mb-6">Giriş yap</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">E-posta</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="ad@sirket.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Şifre</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="••••••••"
          />
        </div>
        {debug && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 break-all">
            {debug}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm"
        >
          {loading ? 'Giriş yapılıyor...' : 'Giriş yap'}
        </button>
      </div>
    </div>
  )
}
