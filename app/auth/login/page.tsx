'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin() {
    setError('')
    setLoading(true)

    const emailVal = (document.getElementById('email-input') as HTMLInputElement).value
    const passwordVal = (document.getElementById('password-input') as HTMLInputElement).value

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: emailVal,
      password: passwordVal,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.session) {
      router.push('/dashboard')
      router.refresh()
    } else {
      setError('Oturum açılamadı, tekrar deneyin.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm w-full max-w-md">
        <h2 className="text-lg font-medium text-gray-900 mb-6">Giriş yap</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">E-posta</label>
            <input
              id="email-input"
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ad@sirket.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Şifre</label>
            <input
              id="password-input"
              type="password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş yap'}
          </button>
        </div>
      </div>
    </div>
  )
}
