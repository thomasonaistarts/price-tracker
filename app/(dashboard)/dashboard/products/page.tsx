import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import ProductsClient from '@/components/products/ProductsClient'
import type { Product } from '@/types/database'

export default async function ProductsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const [{ data: products }, { data: analyses }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('price_analyses')
      .select('product_id, run_at, alert, alert_reason, price_diff_percent, market_mean, min_price, max_price, sources_count, sources')
      .eq('user_id', user.id)
      .order('run_at', { ascending: false }),
  ])

  // Her ürün için sadece en son analizi tut
  const latestMap = new Map<string, any>()
  for (const a of (analyses ?? []) as any[]) {
    if (a && !latestMap.has(a.product_id)) latestMap.set(a.product_id, a)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Ürünler</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{(products ?? []).length} ürün</p>
        </div>
        <a
          href="/dashboard/analyze"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Ürün ekle
        </a>
      </div>
      <ProductsClient
        products={(products ?? []) as Product[]}
        latestAnalyses={[...latestMap.values()] as any}
      />
    </div>
  )
}
