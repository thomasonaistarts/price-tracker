'use client'

import { useState } from 'react'

interface IdentityEvidenceView {
  source: 'manual' | 'supplier' | 'wolvox' | 'verified_marketplace'
  sourceLabel: string
  sourceUrl?: string | null
  productName: string
}

interface IdentitySuggestion {
  brand: string | null
  manufacturer_code: string | null
  product_type: string | null
  confidence: 'authoritative' | 'corroborated' | 'insufficient'
  approval_required: boolean
}

interface Props {
  productId: string
  initialBrand: string | null
  initialManufacturerCode: string | null
  initialProductType: string | null
  onUpdated?: (identity: {
    brand: string | null
    manufacturer_code: string | null
    product_type: string | null
  }) => void
}

export default function ProductIdentityEditor({
  productId,
  initialBrand,
  initialManufacturerCode,
  initialProductType,
  onUpdated,
}: Props) {
  const [brand, setBrand] = useState(initialBrand ?? '')
  const [manufacturerCode, setManufacturerCode] = useState(initialManufacturerCode ?? '')
  const [productType, setProductType] = useState(initialProductType ?? '')
  const [saving, setSaving] = useState(false)
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [suggestion, setSuggestion] = useState<IdentitySuggestion | null>(null)
  const [evidence, setEvidence] = useState<IdentityEvidenceView[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadSuggestion() {
    setLoadingSuggestion(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/products/${productId}/identity`, {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage({ type: 'error', text: result?.error ?? 'Kimlik kanıtları okunamadı.' })
        return
      }
      setSuggestion(result.proposal ?? null)
      setEvidence(Array.isArray(result.evidence) ? result.evidence : [])
      if (result.proposal?.confidence === 'insufficient') {
        setMessage({
          type: 'error',
          text: 'Henüz güvenilir ve bağımsız kaynaklarla doğrulanmış bir kimlik önerisi yok.',
        })
      }
    } catch {
      setMessage({ type: 'error', text: 'Kimlik kanıtları okunamadı.' })
    } finally {
      setLoadingSuggestion(false)
    }
  }

  function useSuggestion() {
    if (!suggestion) return
    if (suggestion.brand) setBrand(suggestion.brand)
    if (suggestion.manufacturer_code) setManufacturerCode(suggestion.manufacturer_code)
    if (suggestion.product_type) setProductType(suggestion.product_type)
    setMessage({
      type: 'success',
      text: 'Öneri forma alındı. Kaydedilmedi; doğruladıktan sonra “Kimliği doğrula” düğmesine basın.',
    })
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/products/${productId}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: brand.trim() || null,
          manufacturer_code: manufacturerCode.trim() || null,
          product_type: productType.trim() || null,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage({ type: 'error', text: result?.error ?? 'Ürün kimliği kaydedilemedi.' })
        return
      }
      const identity = {
        brand: result.identity?.brand ?? null,
        manufacturer_code: result.identity?.manufacturer_code ?? null,
        product_type: result.identity?.product_type ?? null,
      }
      setBrand(identity.brand ?? '')
      setManufacturerCode(identity.manufacturer_code ?? '')
      setProductType(identity.product_type ?? '')
      onUpdated?.(identity)
      setMessage({
        type: 'success',
        text: 'Kimlik doğrulandı. WOLVOX’a otomatik yazılmadı.',
      })
    } catch {
      setMessage({ type: 'error', text: 'Ürün kimliği kaydedilemedi.' })
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Ürün kimliği</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
          Yalnızca doğruladığınız değerleri kaydedin. Bu işlem WOLVOX kaydını değiştirmez.
        </p>
      </div>
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
              Güvenilir kaynaklardan kimlik önerisi
            </p>
            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
              Yalnızca doğrulanmış bağlantılar ve onay geçmişi kullanılır; hiçbir değer otomatik kaydedilmez.
            </p>
          </div>
          <button
            type="button"
            onClick={loadSuggestion}
            disabled={loadingSuggestion}
            className="rounded-lg border border-blue-500 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            {loadingSuggestion ? 'Kanıtlar okunuyor…' : 'Kimlik önerisi getir'}
          </button>
        </div>
        {suggestion && (
          <div className="mt-3 border-t border-blue-200 pt-3 dark:border-blue-900">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 font-semibold ${
                suggestion.confidence === 'authoritative'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : suggestion.confidence === 'corroborated'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {suggestion.confidence === 'authoritative'
                  ? 'Otoritatif kanıt'
                  : suggestion.confidence === 'corroborated'
                    ? 'Bağımsız kaynaklarla doğrulandı'
                    : 'Kanıt yetersiz'}
              </span>
              <span className="text-gray-600 dark:text-slate-300">
                {[suggestion.brand, suggestion.manufacturer_code, suggestion.product_type]
                  .filter(Boolean).join(' · ') || 'Önerilecek alan bulunamadı'}
              </span>
              {suggestion.confidence !== 'insufficient' && (
                <button
                  type="button"
                  onClick={useSuggestion}
                  className="rounded-md bg-blue-600 px-2.5 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Öneriyi forma al
                </button>
              )}
            </div>
            {evidence.length > 0 && (
              <ul className="mt-2 grid gap-1 text-xs text-gray-600 dark:text-slate-300">
                {evidence.map((item, index) => (
                  <li key={`${item.sourceLabel}-${item.sourceUrl ?? index}`}>
                    <span className="font-semibold">{item.sourceLabel}:</span>{' '}
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-300"
                      >
                        {item.productName}
                      </a>
                    ) : item.productName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs text-gray-500 dark:text-slate-400">
          Marka
          <input value={brand} onChange={event => setBrand(event.target.value)} className={inputClass} maxLength={160} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500 dark:text-slate-400">
          Üretici / model kodu
          <input value={manufacturerCode} onChange={event => setManufacturerCode(event.target.value)} className={inputClass} maxLength={160} />
        </label>
        <label className="grid gap-1 text-xs text-gray-500 dark:text-slate-400">
          Ürün tipi
          <input value={productType} onChange={event => setProductType(event.target.value)} className={inputClass} maxLength={160} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kimliği doğrula'}
        </button>
        {message && (
          <span className={`text-xs ${message.type === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  )
}
