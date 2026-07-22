'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildPriceChangeEvents, type PriceHistoryPoint } from '@/lib/price-history'

const DAY_OPTIONS = [30, 90, 365] as const

const fmt = (value: number) =>
  value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

function compactPrice(value: number) {
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export default function ProductPriceHistory({ productId }: { productId: string }) {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(90)
  const [history, setHistory] = useState<PriceHistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    fetch(`/api/products/${productId}/history?days=${days}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Fiyat geçmişi yüklenemedi')
        setHistory(payload.history ?? [])
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : 'Fiyat geçmişi yüklenemedi')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [days, productId])

  const chartData = useMemo(() => history.map((point) => ({
    ...point,
    dateLabel: new Date(point.run_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
  })), [history])
  const events = useMemo(() => buildPriceChangeEvents(history).slice(0, 8), [history])
  const hasOurPriceSnapshots = history.some((point) => point.our_price != null)

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Fiyat geçmişi</h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">Bizim fiyat, piyasa ortalaması ve en düşük rakip fiyatı</p>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-slate-700">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === option
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-slate-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {option === 365 ? '1 yıl' : `${option} gün`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center text-xs text-gray-400 dark:text-slate-500">Geçmiş yükleniyor…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</div>
      ) : history.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-center text-xs text-gray-400 dark:text-slate-500">
          Bu dönem için başarılı analiz kaydı bulunmuyor.
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-gray-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-blue-500" /> Bizim fiyat</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-violet-500" /> Piyasa ort.</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-500" /> En düşük rakip</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} stroke="#94a3b8" minTickGap={24} />
                <YAxis tickFormatter={compactPrice} tick={{ fontSize: 11 }} stroke="#94a3b8" width={58} domain={['auto', 'auto']} />
                <Tooltip
                  labelFormatter={(label) => `Tarih: ${label}`}
                  formatter={(value, name) => [typeof value === 'number' ? fmt(value) : value, name]}
                  contentStyle={{ borderRadius: 8, borderColor: '#475569', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="our_price" name="Bizim fiyat" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="market_mean" name="Piyasa ort." stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                <Line type="monotone" dataKey="min_price" name="En düşük rakip" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {!hasOurPriceSnapshots && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              Bizim fiyat çizgisi, bu özellikten sonraki başarılı analizlerle oluşmaya başlayacak.
            </p>
          )}

          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-slate-700">
            <h4 className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-300">Son fiyat hareketleri</h4>
            {events.length === 0 ? (
              <p className="text-[11px] text-gray-400 dark:text-slate-500">Seçilen dönemde karşılaştırılabilir fiyat değişimi yok.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {events.map((event, index) => (
                  <div key={`${event.at}-${event.actor}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-slate-700/60">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-700 dark:text-slate-200">{event.actor}</div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500">{new Date(event.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={event.percent > 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'}>
                        {event.percent > 0 ? '+' : ''}{event.percent.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500">{fmt(event.previous)} → {fmt(event.current)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
