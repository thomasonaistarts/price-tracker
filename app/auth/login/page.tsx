'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.replace('/dashboard')
      }
    })
  }, [])

  async function handleLogin() {
    setError('')
    setLoading(true)

    const emailVal = (document.getElementById('email-input') as HTMLInputElement).value
    const passwordVal = (document.getElementById('password-input') as HTMLInputElement).value

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailVal,
      password: passwordVal,
    })

    if (authError) {
      setError(authError.message)
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
  )
}
