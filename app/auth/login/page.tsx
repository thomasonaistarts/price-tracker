'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    setLoading(true)
    const email = (document.getElementById('email-input') as HTMLInputElement).value
    const password = (document.getElementById('password-input') as HTMLInputElement).value
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }
    if (data.session) { window.location.href = '/dashboard' }
    else { setError('Oturum açılamadı, tekrar deneyin.'); setLoading(false) }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Sol Panel ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[56%] bg-slate-900 flex-col p-12 relative overflow-hidden">

        {/* Arka plan ışıkları */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-600 rounded-full -translate-x-72 -translate-y-72 opacity-[0.12] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-500 rounded-full translate-x-64 translate-y-64 opacity-[0.12] blur-3xl pointer-events-none" />

        {/* Marka */}
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/50">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold text-[15px] leading-none">Fiyatlaa</p>
              <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[9px] font-bold tracking-wider border border-blue-500/30">BETA</span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">Türkiye pazar analizi</p>
          </div>
        </div>

        {/* Başlık */}
        <div className="relative mt-14 mb-10">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-3">
            fiyatlaa.com
          </p>
          <h2 className="text-[2rem] font-bold text-white leading-tight tracking-tight">
            Rakiplerinizi her zaman<br />bir adım önünden görün
          </h2>
          <p className="text-slate-400 text-sm mt-4 max-w-xs leading-relaxed">
            Türkiye&apos;nin büyük marketplace&apos;lerini otomatik tarıyoruz. Fiyat sapması olduğu anda sizi haberdar ediyoruz.
          </p>
        </div>

        {/* ── Grafik Kartı ── */}
        <div className="relative flex-1 flex items-start">
          <div className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">

            {/* Kart başlığı */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-300 text-xs font-semibold tracking-wide uppercase">
                Piyasa Fiyat Karşılaştırması
              </span>
              <span className="inline-flex items-center gap-1.5 bg-red-500/15 text-red-400 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-red-500/20">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                12 fiyat uyarısı
              </span>
            </div>

            {/* SVG Bar Chart */}
            <svg viewBox="0 0 300 148" className="w-full" aria-hidden="true">
              {/* Grid yatay çizgiler */}
              {[28, 72, 116].map(y => (
                <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="#1e293b" strokeWidth="1.5" />
              ))}

              {/* Rakip fiyat çubukları */}
              {[
                { x: 15,  h: 65  },
                { x: 62,  h: 103 },
                { x: 109, h: 48  },
                { x: 156, h: 90  },
                { x: 203, h: 74  },
                { x: 250, h: 96  },
              ].map((bar, i) => (
                <rect
                  key={i}
                  x={bar.x}
                  y={148 - bar.h}
                  width="38"
                  height={bar.h}
                  rx="5"
                  fill={bar.h > 72 ? '#3b82f6' : '#60a5fa'}
                  fillOpacity={bar.h > 72 ? '0.55' : '0.80'}
                />
              ))}

              {/* Bizim fiyat çizgisi (kesik - amber) */}
              <line x1="0" y1="72" x2="300" y2="72"
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />

              {/* Piyasa trend çizgisi (emerald) */}
              <polyline
                points="34,136 81,110 128,120 175,94 222,104 269,80"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Trend nokta noktaları */}
              {[[34,136],[81,110],[128,120],[175,94],[222,104],[269,80]].map(([cx,cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="3.5" fill="#10b981" />
              ))}
            </svg>

            {/* Grafik açıklaması */}
            <div className="flex items-center gap-5 mt-3 mb-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-500/70" />
                <span className="text-slate-500 text-[10px]">Rakip fiyatları</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-[6px]" viewBox="0 0 20 4">
                  <line x1="0" y1="2" x2="20" y2="2" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 3" />
                </svg>
                <span className="text-slate-500 text-[10px]">Bizim fiyatımız</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-[6px]" viewBox="0 0 20 4">
                  <line x1="0" y1="2" x2="20" y2="2" stroke="#10b981" strokeWidth="2" />
                </svg>
                <span className="text-slate-500 text-[10px]">Piyasa trendi</span>
              </div>
            </div>

            {/* İstatistik kartları */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Ürün',     value: '1.284', color: 'text-blue-400'   },
                { label: 'Platform', value: '5',     color: 'text-purple-400' },
                { label: 'Uyarı',    value: '47',    color: 'text-red-400'    },
              ].map(s => (
                <div key={s.label} className="bg-slate-700/40 border border-slate-700/40 rounded-xl py-3 text-center">
                  <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Özellik listesi */}
        <div className="relative mt-8 space-y-3">
          {[
            { dot: 'bg-blue-500',    text: 'Anlık fiyat takibi ve otomatik uyarılar'    },
            { dot: 'bg-purple-500',  text: '5 büyük Türkiye marketplace entegrasyonu'   },
            { dot: 'bg-emerald-500', text: 'Kategori ve SKU bazlı detaylı raporlar'     },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.dot}`} />
              <span className="text-slate-400 text-xs">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sağ Panel (Form) ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-white">

        {/* Mobil başlık (lg'de gizli) */}
        <div className="lg:hidden text-center mb-10">
          <div className="inline-flex items-center justify-center gap-2.5 mb-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-xl">Fiyatlaa</span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold tracking-wider border border-blue-200">BETA</span>
          </div>
          <p className="text-gray-500 text-sm">Türkiye pazar fiyat analizi</p>
        </div>

        <div className="w-full max-w-[340px]">

          {/* Form başlığı */}
          <div className="mb-8">
            <p className="text-blue-600 text-xs font-semibold uppercase tracking-widest mb-2">Fiyatlaa&apos;ya hoş geldiniz</p>
            <h2 className="text-2xl font-bold text-gray-900">Tekrar merhaba! 👋</h2>
            <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">
              Rakipleriniz fiyat değiştirirken siz habersiz kalmayın.
            </p>
          </div>

          <div className="space-y-5">
            {/* E-posta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-posta</label>
              <input
                id="email-input"
                type="email"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder:text-gray-400"
                placeholder="ad@sirket.com"
              />
            </div>

            {/* Şifre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Şifre</label>
              <input
                id="password-input"
                type="password"
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder:text-gray-400"
                placeholder="••••••••"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {/* Hata mesajı */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Giriş butonu */}
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Giriş yapılıyor...
                </>
              ) : (
                <>
                  Giriş yap
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
