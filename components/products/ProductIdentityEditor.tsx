'use client'

import { useState } from 'react'

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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
