'use client'

import { useMemo, useState } from 'react'
import type { Product } from '@/types/database'
import { recommendPrice } from '@/lib/price-recommendation'

interface Props {
  product: Product
  marketMean: number | null
  onUpdated: (values: Partial<Product>) => void
}

type FormState = {
  purchase_cost: string
  vat_rate: string
  commission_rate: string
  shipping_cost: string
  packaging_cost: string
  target_margin_rate: string
  price_floor: string
  price_ceiling: string
}

const money = (value: number) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

function formFromProduct(product: Product): FormState {
  return {
    purchase_cost: product.purchase_cost == null ? '' : String(product.purchase_cost),
    vat_rate: String(product.vat_rate ?? 20),
    commission_rate: String(product.commission_rate ?? 0),
    shipping_cost: String(product.shipping_cost ?? 0),
    packaging_cost: String(product.packaging_cost ?? 0),
    target_margin_rate: String(product.target_margin_rate ?? 20),
    price_floor: product.price_floor == null ? '' : String(product.price_floor),
    price_ceiling: product.price_ceiling == null ? '' : String(product.price_ceiling),
  }
}

function optionalNumber(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function ProductProfitability({ product, marketMean, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => formFromProduct(product))

  const recommendation = useMemo(() => recommendPrice({
    salePrice: product.our_price,
    purchaseCost: product.purchase_cost ?? null,
    vatRate: product.vat_rate ?? 20,
    commissionRate: product.commission_rate ?? 0,
    shippingCost: product.shipping_cost ?? 0,
    packagingCost: product.packaging_cost ?? 0,
    targetMarginRate: product.target_margin_rate ?? 20,
    priceFloor: product.price_floor ?? null,
    priceCeiling: product.price_ceiling ?? null,
    marketMean,
  }), [product, marketMean])

  function setField(field: keyof FormState, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function cancel() {
    setForm(formFromProduct(product))
    setError(null)
    setEditing(false)
  }

  async function save() {
    const payload = {
      purchase_cost: optionalNumber(form.purchase_cost),
      vat_rate: optionalNumber(form.vat_rate) ?? 20,
      commission_rate: optionalNumber(form.commission_rate) ?? 0,
      shipping_cost: optionalNumber(form.shipping_cost) ?? 0,
      packaging_cost: optionalNumber(form.packaging_cost) ?? 0,
      target_margin_rate: optionalNumber(form.target_margin_rate) ?? 20,
      price_floor: optionalNumber(form.price_floor),
      price_ceiling: optionalNumber(form.price_ceiling),
    }

    const numericValues = [payload.vat_rate, payload.commission_rate, payload.shipping_cost, payload.packaging_cost, payload.target_margin_rate]
    if (payload.purchase_cost != null && payload.purchase_cost < 0) return setError('Alış maliyeti negatif olamaz.')
    if (numericValues.some(value => value < 0)) return setError('Maliyet ve oranlar negatif olamaz.')
    if (payload.vat_rate > 100 || payload.commission_rate > 100 || payload.target_margin_rate > 100) return setError('Oranlar %0–100 arasında olmalıdır.')
    if (payload.commission_rate + payload.target_margin_rate >= 100) return setError('Komisyon ve hedef marj toplamı %100’den küçük olmalıdır.')
    if (payload.price_floor != null && payload.price_floor <= 0) return setError('Minimum fiyat sıfırdan büyük olmalıdır.')
    if (payload.price_ceiling != null && payload.price_ceiling <= 0) return setError('Maksimum fiyat sıfırdan büyük olmalıdır.')
    if (payload.price_floor != null && payload.price_ceiling != null && payload.price_ceiling < payload.price_floor) return setError('Maksimum fiyat minimum fiyattan düşük olamaz.')

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Maliyet bilgileri kaydedilemedi.')
      onUpdated(payload)
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Maliyet bilgileri kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  async function applyRecommendation() {
    if (recommendation.status !== 'ready' || recommendation.recommendedPrice == null) return
    const approved = confirm(
      'Fiyatlaa hedef fiyatı ' + money(product.our_price) + ' → ' + money(recommendation.recommendedPrice) + ' olarak değişecek. Bu aşamada Wolvox ve e-ticaret fiyatı değişmeyecek. Onaylıyor musunuz?',
    )
    if (!approved) return

    setApplying(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/products/' + product.id + '/price-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_price: product.our_price,
          expected_recommended_price: recommendation.recommendedPrice,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Fiyat önerisi uygulanamadı.')
      onUpdated({ our_price: Number(data.new_price) })
      setSuccess('Fiyatlaa hedef fiyatı güncellendi ve değişiklik geçmişe kaydedildi.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fiyat önerisi uygulanamadı.')
    } finally {
      setApplying(false)
    }
  }

  const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Kârlılık ve fiyat önerisi</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">KDV dâhil tutarlar üzerinden tahmini net katkı hesaplanır.</p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Maliyetleri düzenle
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['purchase_cost', 'Alış maliyeti (₺)'],
              ['vat_rate', 'KDV (%)'],
              ['commission_rate', 'Komisyon (%)'],
              ['shipping_cost', 'Kargo (₺)'],
              ['packaging_cost', 'Paketleme (₺)'],
              ['target_margin_rate', 'Hedef marj (%)'],
              ['price_floor', 'Minimum fiyat (₺)'],
              ['price_ceiling', 'Maksimum fiyat (₺)'],
            ] as [keyof FormState, string][]).map(([field, label]) => (
              <label key={field} className="text-xs font-medium text-gray-600 dark:text-slate-300">
                {label}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[field]}
                  onChange={event => setField(field, event.target.value)}
                  className={`${inputClass} mt-1`}
                  placeholder={field === 'purchase_cost' ? 'Zorunlu' : 'İsteğe bağlı'}
                />
              </label>
            ))}
          </div>
          {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={cancel} disabled={saving} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">İptal</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {recommendation.status === 'missing_cost' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Alış maliyetini girerek güvenli fiyat önerisini ve tahmini katkıyı hesaplayın.
            </div>
          ) : recommendation.status === 'invalid_rules' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{recommendation.reason}</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Mevcut fiyat" value={money(product.our_price)} detail={recommendation.current ? `Marj %${recommendation.current.contributionMarginRate.toFixed(1)}` : undefined} />
                <Metric label="Güvenli taban" value={money(recommendation.minimumSafePrice!)} detail={`Hedef marj %${(product.target_margin_rate ?? 20).toFixed(1)}`} />
                <Metric label="Önerilen fiyat" value={money(recommendation.recommendedPrice!)} detail={recommendation.recommended ? `Marj %${recommendation.recommended.contributionMarginRate.toFixed(1)}` : undefined} accent />
                <Metric label="Tahmini net katkı" value={money(recommendation.recommended?.netContribution ?? 0)} detail="Önerilen fiyatla" />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{recommendation.reason}</p>
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Bu adım hedef fiyatı Fiyatlaa içinde onaylar. Wolvox bağlantısı tamamlanana kadar kasa ve satış kanallarına gönderilmez.</p>
                </div>
                {Math.abs((recommendation.recommendedPrice ?? 0) - product.our_price) >= 0.01 ? (
                  <button type="button" onClick={applyRecommendation} disabled={applying} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {applying ? 'Uygulanıyor…' : 'Fiyatlaa hedef fiyatına uygula'}
                  </button>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Fiyat öneriyle aynı</span>
                )}
              </div>
              {success && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">{success}</p>}
              {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' : 'border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/40'}`}>
      <p className="text-[11px] text-gray-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-semibold ${accent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-slate-100'}`}>{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">{detail}</p>}
    </div>
  )
}
