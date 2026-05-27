'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  async function handleLogin() {
    const emailInput = document.getElementById('email-input') as HTMLInputElement
    const passwordInput = document.getElementById('password-input') as HTMLInputElement

    const emailVal = emailInput?.value ?? ''
    const passwordVal = passwordInput?.value ?? ''

    alert(`email: "${emailVal}" | şifre: ${passwordVal.length} karakter`)

    if (!emailVal || !passwordVal) {
      alert('Email veya şifre boş!')
      return
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailVal,
        password: passwordVal,
      })

      if (error) {
        alert('Hata: ' + error.message)
        return
      }

      if (data.session) {
        alert('Başarılı! Yönlendiriliyor...')
        window.location.href = '/dashboard'
      } else {
        alert('Session yok')
      }
    } catch(e) {
      alert('Exception: ' + String(e))
    }
  }

  return (
    <div style={{padding: '2rem', maxWidth: '400px', margin: '2rem auto', border: '1px solid #ccc', borderRadius: '8px'}}>
      <h2>Giriş yap</h2>
      <div style={{marginBottom: '1rem'}}>
        <label>E-posta</label><br/>
        <input id="email-input" type="text" style={{width:'100%', padding:'8px', marginTop:'4px'}} />
      </div>
      <div style={{marginBottom: '1rem'}}>
        <label>Şifre</label><br/>
        <input id="password-input" type="password" style={{width:'100%', padding:'8px', marginTop:'4px'}} />
      </div>
      <button onClick={handleLogin} style={{width:'100%', padding:'10px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer'}}>
        Giriş yap
      </button>
    </div>
  )
}
