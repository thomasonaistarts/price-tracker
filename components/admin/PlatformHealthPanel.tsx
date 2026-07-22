import PlatformLogo from '@/components/ui/PlatformLogo'
import type { PlatformHealthSummary } from '@/lib/platform-health'

const STATE = {
  healthy: {
    label: 'Çalışıyor',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  warning: {
    label: 'Düşük sonuç',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  quota_exhausted: {
    label: 'Kredi bitti',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  },
  unhealthy: {
    label: 'Hata',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  },
  no_data: {
    label: 'Veri yok',
    badge: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
    dot: 'bg-gray-400',
  },
}

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) return '—'
  return milliseconds < 1000
    ? `${milliseconds} ms`
    : `${(milliseconds / 1000).toFixed(1)} sn`
}

export default function PlatformHealthPanel({ summaries }: { summaries: PlatformHealthSummary[] }) {
  const totalSamples = summaries.reduce((sum, item) => sum + item.samples, 0)

  return (
    <div className="mb-6 max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Platform sağlığı</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Son 24 saatteki gerçek analiz denemeleri</p>
          </div>
          <span className="text-xs text-gray-400 dark:text-slate-500">{totalSamples} platform taraması</span>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-slate-700 md:grid-cols-5 md:divide-x md:divide-y-0">
        {summaries.map(summary => {
          const state = STATE[summary.state]
          return (
            <div key={summary.platform} className="px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <PlatformLogo name={summary.platform} size={18} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-slate-200">{summary.platform}</span>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${state.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
                {state.label}
              </span>

              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400 dark:text-slate-500">Başarılı</dt>
                  <dd className="font-medium text-gray-700 dark:text-slate-300">{summary.successes}/{summary.samples}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400 dark:text-slate-500">Sonuç</dt>
                  <dd className="font-medium text-gray-700 dark:text-slate-300">{summary.resultCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-400 dark:text-slate-500">Ort. süre</dt>
                  <dd className="font-medium text-gray-700 dark:text-slate-300">{formatDuration(summary.averageDurationMs)}</dd>
                </div>
              </dl>
            </div>
          )
        })}
      </div>
    </div>
  )
}
