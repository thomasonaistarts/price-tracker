'use client'

import { useState } from 'react'
import type { UserSettings, CategoryThreshold } from '@/types/database'
import PlatformLogo from '@/components/ui/PlatformLogo'

const PLATFORMS = ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol']
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

interface Props {
  initialSettings: UserSettings
  initialThresholds: CategoryThreshold[]
  productCategories: string[]
}

type SectionKey = 'analiz' | 'platformlar' | 'email' | 'eslesme'

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function SettingsClient({ initialSettings, initialThresholds, productCategories }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null)
  const [savedSection, setSavedSection] = useState<SectionKey | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [thresholds, setThresholds] = useState(initialThresholds)
  const [thresholdForm, setThresholdForm] = useState({ category: '', threshold_percent: 10 })
  const [thresholdLoading, setThresholdLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [thresholdError, setThresholdError] = useState('')

  async function saveSettings(section: SectionKey, patch: Partial<UserSettings>) {
    setSavingSection(section)
    setSaveError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kaydetme hatası')
      setSettings(data)
      setSavedSection(section)
      setTimeout(() => setSavedSection(s => (s === section ? null : s)), 2000)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setSavingSection(null)
    }
  }

  async function handleAddThreshold(e: React.FormEvent) {
    e.preventDefault()
    if (!thresholdForm.category.trim()) { setThresholdError('Kategori adı zorunlu'); return }
    setThresholdLoading(true)
    setThresholdError('')
    try {
      const res = await fetch('/api/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: thresholdForm.category.trim(),
          threshold_percent: thresholdForm.threshold_percent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setThresholds(prev => {
        const filtered = prev.filter(t => t.category !== data.category)
        return [...filtered, data].sort((a, b) => a.category.localeCompare(b.category))
      })
      setThresholdForm({ category: '', threshold_percent: 10 })
    } catch (err: unknown) {
      setThresholdError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setThresholdLoading(false)
    }
  }

  async function handleDeleteThreshold(id: string) {
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

  const categorySuggestions = Array.from(
    new Set([...productCategories, ...thresholds.map(t => t.category)])
  ).sort()

  const confidenceValid =
    settings.confidence_exact > settings.confidence_high &&
    settings.confidence_high > settings.confidence_medium &&
    settings.confidence_medium > settings.confidence_low &&
    settings.confidence_low >= 1

  function SaveRow({ section }: { section: SectionKey }) {
    const isDisabled = section === 'eslesme' && !confidenceValid
    return (
      <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex items-center gap-3">
        <button
          onClick={() => {
            const patch: Partial<UserSettings> =
              section === 'analiz'
                ? {
                    default_threshold_percent: settings.default_threshold_percent,
                    min_sources: settings.min_sources,
                    outlier_filter_pct: settings.outlier_filter_pct,
                    outlier_upper_pct: settings.outlier_upper_pct ?? 250,
                  }
                : section === 'platformlar'
                ? { active_platforms: settings.active_platforms }
                : section === 'email'
                ? {
                    weekly_report_enabled: settings.weekly_report_enabled,
                    weekly_report_day: settings.weekly_report_day,
                    weekly_report_hour: settings.weekly_report_hour,
                  }
                : {
                    confidence_exact: settings.confidence_exact,
                    confidence_high: settings.confidence_high,
                    confidence_medium: settings.confidence_medium,
                    confidence_low: settings.confidence_low,
                  }
            saveSettings(section, patch)
          }}
          disabled={savingSection === section || isDisabled}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {savingSection === section ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        {savedSection === section && (
          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Kaydedildi
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── 1. Analiz Ayarları ─────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Analiz ayarları</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Fiyat analizi hesaplamalarında kullanılan temel parametreler
          </p>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Varsayılan uyarı eşiği</label>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                %{settings.default_threshold_percent}
              </span>
            </div>
            <input
              type="range" min={1} max={50}
              value={settings.default_threshold_percent}
              onChange={e => setSettings(s => ({ ...s, default_threshold_percent: Number(e.target.value) }))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              <span>%1</span><span>%50</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
              Kategori eşiği tanımlanmamış ürünler için kullanılır
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              Minimum kaynak sayısı
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, min_sources: n }))}
                  className={`w-10 h-10 rounded-lg text-sm font-medium border transition-colors ${
                    settings.min_sources === n
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
              Bu sayıdan az kaynakla bulunan ürünler &ldquo;yetersiz veri&rdquo; olarak işaretlenir
            </p>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Aykırı fiyat filtresi</label>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Medyanın %{settings.outlier_filter_pct} altı
              </span>
            </div>
            <input
              type="range" min={10} max={80}
              value={settings.outlier_filter_pct}
              onChange={e => setSettings(s => ({ ...s, outlier_filter_pct: Number(e.target.value) }))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              <span>%10 (katı)</span><span>%80 (gevşek)</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
              Medyan fiyatın bu yüzdesinin altındaki fiyatlar analiz dışı bırakılır
            </p>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Üst fiyat sapma eşiği</label>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Piyasa ort. %{settings.outlier_upper_pct ?? 250} üstü
              </span>
            </div>
            <input
              type="range" min={100} max={500} step={25}
              value={settings.outlier_upper_pct ?? 250}
              onChange={e => setSettings(s => ({ ...s, outlier_upper_pct: Number(e.target.value) }))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              <span>%100 (katı)</span><span>%500 (gevşek)</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
              Bizim fiyatımız piyasa ortalamasının bu kadar üzerindeyse yanlış ürün eşleşmesi sayılır
            </p>
          </div>
        </div>

        <SaveRow section="analiz" />
      </div>

      {/* ── 2. Aktif Platformlar ───────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Aktif platformlar</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Fiyat analizinde taranacak alışveriş platformları
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(platform => {
              const active = settings.active_platforms.includes(platform)
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() =>
                    setSettings(s => {
                      const next = active
                        ? s.active_platforms.filter(x => x !== platform)
                        : [...s.active_platforms, platform]
                      return next.length === 0 ? s : { ...s, active_platforms: next }
                    })
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500'
                  }`}
                >
                  <PlatformLogo name={platform} size={16} />
                  {platform}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-3">
            {settings.active_platforms.length} / {PLATFORMS.length} platform aktif — en az 1 seçili olmalıdır
          </p>
        </div>

        <SaveRow section="platformlar" />
      </div>

      {/* ── 3. E-posta Bildirimleri ────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">E-posta bildirimleri</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Haftalık fiyat raporu e-posta zamanlaması
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Haftalık rapor</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                Seçili gün ve saatte otomatik olarak gönderilir
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings(s => ({ ...s, weekly_report_enabled: !s.weekly_report_enabled }))
              }
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                settings.weekly_report_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.weekly_report_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.weekly_report_enabled && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Gün</label>
                <select
                  value={settings.weekly_report_day}
                  onChange={e => setSettings(s => ({ ...s, weekly_report_day: Number(e.target.value) }))}
                  className={inputCls}
                >
                  {DAYS.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Saat</label>
                <select
                  value={settings.weekly_report_hour}
                  onChange={e => setSettings(s => ({ ...s, weekly_report_hour: Number(e.target.value) }))}
                  className={inputCls}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <SaveRow section="email" />
      </div>

      {/* ── 4. Kategori Eşikleri ───────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Kategori eşikleri</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Kategori bazlı uyarı eşikleri; tanımlanmamış kategoriler için varsayılan eşik kullanılır
          </p>
        </div>

        {thresholds.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400 dark:text-slate-500">
            Henüz kategori eşiği tanımlanmamış.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  Kategori
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  Eşik
                </th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
              {thresholds.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                  <td className="px-6 py-3 font-medium text-gray-900 dark:text-slate-100">{t.category}</td>
                  <td className="px-6 py-3 text-right text-gray-700 dark:text-slate-300">%{t.threshold_percent}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteThreshold(t.id)}
                      disabled={deleteLoading === t.id}
                      className="text-xs text-red-500 hover:text-red-700 px-2.5 py-1 rounded border border-red-200 dark:border-red-900/50 hover:border-red-300 transition-colors disabled:opacity-40"
                    >
                      {deleteLoading === t.id ? '...' : 'Sil'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-6 py-5 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-4">
            Yeni eşik ekle
          </p>
          <form onSubmit={handleAddThreshold} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Kategori</label>
                <input
                  type="text"
                  list="cat-suggestions"
                  value={thresholdForm.category}
                  onChange={e => setThresholdForm(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="örn. Elektronik"
                  className={inputCls}
                />
                <datalist id="cat-suggestions">
                  {categorySuggestions.map(c => <option key={c} value={c} />)}
                </datalist>
                {productCategories.length > 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                    Ürünlerden:{' '}
                    {productCategories.slice(0, 4).join(', ')}
                    {productCategories.length > 4 ? ` +${productCategories.length - 4} daha` : ''}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Eşik: %{thresholdForm.threshold_percent}
                </label>
                <input
                  type="range" min={1} max={50}
                  value={thresholdForm.threshold_percent}
                  onChange={e => setThresholdForm(prev => ({ ...prev, threshold_percent: Number(e.target.value) }))}
                  className="w-full mt-2 accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  <span>%1</span><span>%50</span>
                </div>
              </div>
            </div>
            {thresholdError && (
              <p className="text-sm text-red-600 dark:text-red-400">{thresholdError}</p>
            )}
            <button
              type="submit"
              disabled={thresholdLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {thresholdLoading ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </form>
        </div>
      </div>

      {/* ── 5. Eşleşme Hassasiyeti ────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Eşleşme hassasiyeti</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Ürün adı benzerlik skoruna göre eşleşme seviyelerinin minimum eşikleri
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {[
            {
              key: 'confidence_exact' as const,
              label: '⭐ Tam eşleşme',
              color: 'text-amber-600 dark:text-amber-400',
              desc: 'Neredeyse aynı ürün — fiyat doğrudan karşılaştırılabilir',
            },
            {
              key: 'confidence_high' as const,
              label: '✓ Yüksek eşleşme',
              color: 'text-green-600 dark:text-green-400',
              desc: 'Aynı ürün, küçük farklılık olabilir',
            },
            {
              key: 'confidence_medium' as const,
              label: '⚠ Orta eşleşme',
              color: 'text-yellow-600 dark:text-yellow-400',
              desc: 'Benzer ürün, dikkatli yorumlanmalı',
            },
            {
              key: 'confidence_low' as const,
              label: '↓ Düşük eşleşme',
              color: 'text-orange-500 dark:text-orange-400',
              desc: 'Zayıf benzerlik — bu altı tamamen reddedilir',
            },
          ].map(({ key, label, color, desc }) => (
            <div key={key}>
              <div className="flex justify-between mb-1.5">
                <label className={`text-sm font-medium ${color}`}>{label}</label>
                <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  %{settings[key]}
                </span>
              </div>
              <input
                type="range" min={1} max={99}
                value={settings[key]}
                onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{desc}</p>
            </div>
          ))}

          {!confidenceValid && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
              <span className="text-amber-500 mt-0.5">⚠</span>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Sıralamanın geçerli olması için:{' '}
                <strong>Tam &gt; Yüksek &gt; Orta &gt; Düşük</strong> olmalıdır.
                Kaydet butonu bu kural sağlanana kadar devre dışıdır.
              </p>
            </div>
          )}
        </div>

        <SaveRow section="eslesme" />
      </div>

      {saveError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          {saveError}
        </div>
      )}
    </div>
  )
}
