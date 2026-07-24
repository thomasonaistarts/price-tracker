'use client'

import { useMemo, useState } from 'react'
import type { Product } from '@/types/database'
import { recommendPrice } from '@/lib/price-recommendation'
import {
  priceChangePercent,
  requiresLargePriceChangeConfirmation,
} from '@/lib/price-change-safety'

interface Props {
  product: Product
  marketMean: number | null
  onUpdated: (values: Partial<Product>) => void
}

function numeric(value: string, fallback = 0) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function nullableNumeric(value: string) {
  if (!value.trim()) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

const money = (value: number) =>
  value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

export default function ProductEcommercePricing({ product, marketMean, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(Boolean(product.ecommerce_enabled))
  const [price, setPrice] = useState(String(product.ecommerce_price ?? product.our_price))
  const [commission, setCommission] = useState(String(product.ecommerce_commission_rate ?? 0))
  const [paymentFee, setPaymentFee] = useState(String(product.ecommerce_payment_fee_rate ?? 0))
  const [shipping, setShipping] = useState(String(product.ecommerce_shipping_cost ?? 0))
  const [packaging, setPackaging] = useState(String(product.ecommerce_packaging_cost ?? 0))
  const [margin, setMargin] = useState(String(product.ecommerce_target_margin_rate ?? 20))
  const [floor, setFloor] = useState(product.ecommerce_price_floor == null ? '' : String(product.ecommerce_price_floor))
  const [ceiling, setCeiling] = useState(product.ecommerce_price_ceiling == null ? '' : String(product.ecommerce_price_ceiling))
  const [safetyStock, setSafetyStock] = useState(String(product.safety_stock ?? 0))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const recommendation = useMemo(() => recommendPrice({
    salePrice: numeric(price, product.our_price),
    purchaseCost: product.purchase_cost,
    vatRate: product.vat_rate ?? 20,
    commissionRate: numeric(commission) + numeric(paymentFee),
    shippingCost: numeric(shipping),
    packagingCost: numeric(packaging),
    targetMarginRate: numeric(margin, 20),
    priceFloor: nullableNumeric(floor),
    priceCeiling: nullableNumeric(ceiling),
    marketMean,
  }), [
    price, product.our_price, product.purchase_cost, product.vat_rate,
    commission, paymentFee, shipping, packaging, margin, floor, ceiling, marketMean,
  ])

  async function save(useRecommendedPrice = false) {
    const nextPrice = useRecommendedPrice && recommendation.recommendedPrice != null
      ? recommendation.recommendedPrice
      : nullableNumeric(price)
    const currentPrice = Number(product.ecommerce_price ?? product.our_price)
    let confirmLargeChange = false
    if (nextPrice != null && requiresLargePriceChangeConfirmation(currentPrice, nextPrice)) {
      const percent = priceChangePercent(currentPrice, nextPrice)
      confirmLargeChange = confirm(
        `E-ticaret fiyatı %${Math.abs(percent).toFixed(2)} değişecek. %10 güvenlik sınırı aşılıyor. Onaylıyor musunuz?`,
      )
      if (!confirmLargeChange) return
    }

    const payload = {
      ecommerce_enabled: enabled,
      ecommerce_price: nextPrice,
      ecommerce_commission_rate: numeric(commission),
      ecommerce_payment_fee_rate: numeric(paymentFee),
      ecommerce_shipping_cost: numeric(shipping),
      ecommerce_packaging_cost: numeric(packaging),
      ecommerce_target_margin_rate: numeric(margin, 20),
      ecommerce_price_floor: nullableNumeric(floor),
      ecommerce_price_ceiling: nullableNumeric(ceiling),
      safety_stock: numeric(safetyStock),
      confirm_large_change: confirmLargeChange,
    }

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/products/${product.id}/ecommerce-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error ?? 'E-ticaret ayarı kaydedilemedi.')
      setPrice(String(nextPrice ?? ''))
      onUpdated(result.values)
      setMessage({
        type: 'success',
        text: enabled
          ? 'E-ticaret fiyatı XML yayını için kaydedildi. WOLVOX değişmedi.'
          : 'E-ticaret yayını kapalı olarak kaydedildi.',
      })
    } catch (caught) {
      setMessage({
        type: 'error',
        text: caught instanceof Error ? caught.message : 'E-ticaret ayarı kaydedilemedi.',
      })
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-gray-900 dark:text-slate-100">E-ticaret fiyatı</span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-slate-400">
            Komisyon, ödeme, kargo ve güvenlik stoğu fiziksel mağazadan ayrı hesaplanır.
          </span>
        </span>
        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
          {open ? 'Kapat' : (product.ecommerce_enabled ? 'Yayında · Düzenle' : 'Ayarla')}
        </span>
      </button>

      {open && (
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-700">
          <label className="mb-3 flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
            <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
            XML e-ticaret yayınında göster
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['E-ticaret fiyatı', price, setPrice],
              ['Komisyon (%)', commission, setCommission],
              ['Ödeme maliyeti (%)', paymentFee, setPaymentFee],
              ['Kargo (₺)', shipping, setShipping],
              ['Paketleme (₺)', packaging, setPackaging],
              ['Hedef marj (%)', margin, setMargin],
              ['Güvenlik stoğu', safetyStock, setSafetyStock],
              ['Minimum fiyat (₺)', floor, setFloor],
              ['Maksimum fiyat (₺)', ceiling, setCeiling],
            ].map(([label, value, setter]) => (
              <label key={String(label)} className="grid gap-1 text-xs text-gray-500 dark:text-slate-400">
                {String(label)}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(value)}
                  onChange={event => (setter as (value: string) => void)(event.target.value)}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          {recommendation.status === 'ready' && recommendation.recommendedPrice != null && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-900/20">
              <div className="text-xs text-blue-800 dark:text-blue-300">
                Güvenli e-ticaret önerisi: <strong>{money(recommendation.recommendedPrice)}</strong>
                {' · '}Tahmini net katkı: {money(recommendation.recommended?.netContribution ?? 0)}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => save(true)}
                className="rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:text-blue-300"
              >
                Öneriyi kaydet
              </button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'E-ticaret ayarını kaydet'}
            </button>
            {message && (
              <span className={`text-xs ${message.type === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                {message.text}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
