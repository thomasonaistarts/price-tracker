import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import ScrapingCanaryClient from '@/components/admin/ScrapingCanaryClient'

export default async function ScrapingCanaryPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  await requireAuth()

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">
            Scraping canary
          </h1>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Yalnızca lokal
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Seçilen WOLVOX ürünlerini veri yazmadan ve fiyat değiştirmeden sırayla doğrulayın.
        </p>
      </div>

      <ScrapingCanaryClient />
    </div>
  )
}
