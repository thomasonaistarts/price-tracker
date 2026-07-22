import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import ProductsClient from '@/components/products/ProductsClient'
import { fetchAllRows } from '@/lib/supabase/paginate'
import type { Product } from '@/types/database'
import type { SourceDecisionRule } from '@/lib/source-decisions'

export default async function ProductsPage() {
  const user = await requireAuth()
  const supabase = await createClient() as any

  const [products, latestAnalyses, sourceDecisions] = await Promise.all([
    fetchAllRows<Product>(async (from, to) => supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to)),
    fetchAllRows<any>(async (from, to) => supabase
      .from('latest_price_analyses')
      .select('product_id, run_at, alert, alert_reason, price_diff_percent, market_mean, min_price, max_price, sources_count, sources')
      .eq('user_id', user.id)
      .order('run_at', { ascending: false })
      .range(from, to)),
    fetchAllRows<SourceDecisionRule>(async (from, to) => supabase
      .from('source_match_decisions')
      .select('id, product_id, user_id, platform, source_url, source_product_name, decision, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(from, to)),
  ])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-gray-900 dark:text-slate-100">Ürünler</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{products.length} ürün</p>
        </div>
        <a
          href="/dashboard/analyze"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Ürün ekle
        </a>
      </div>
      <ProductsClient products={products} latestAnalyses={latestAnalyses} sourceDecisions={sourceDecisions} />
    </div>
  )
}
