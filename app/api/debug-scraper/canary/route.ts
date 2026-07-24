import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { analyzeProduct } from '@/lib/analyzer'
import { getUserSettings } from '@/lib/user-settings'
import { getSourceDecisions } from '@/lib/source-decisions'
import { getVerifiedSourceMemory } from '@/lib/source-memory'
import { summarizeProductDiscovery } from '@/lib/product-discovery-benchmark'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const revalidate = 0

const runSchema = z.object({
  product_id: z.string().uuid(),
}).strict()

const CANDIDATE_COLUMNS = [
  'id',
  'user_id',
  'sku',
  'barcode',
  'product_name',
  'brand',
  'manufacturer_code',
  'product_type',
  'category',
  'our_price',
  'stock_quantity',
  'external_source',
].join(', ')

async function requireLocalCanaryUser(req: NextRequest): Promise<
  { userId: string; error?: never } | { userId?: never; error: NextResponse }
> {
  if (process.env.NODE_ENV === 'production') {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) {
    const admin = createAdminClient() as any
    const { data: connection } = await admin
      .from('integration_connections')
      .select('owner_user_id')
      .eq('provider', 'wolvox')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (connection?.owner_user_id) return { userId: connection.owner_user_id }
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 }) }
  }

  return { userId: user.id }
}

export async function GET(req: NextRequest) {
  const auth = await requireLocalCanaryUser(req)
  if (auth.error) return auth.error

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('products')
    .select(CANDIDATE_COLUMNS)
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .eq('external_source', 'wolvox')
    .gt('stock_quantity', 0)
    .gte('our_price', 150)
    .order('product_name', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'Canary ürünleri okunamadı' }, { status: 500 })
  }

  return NextResponse.json({
    dry_run: true,
    max_selection: 20,
    candidates: data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireLocalCanaryUser(req)
  if (auth.error) return auth.error

  const parsed = runSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçerli bir product_id gerekli' }, { status: 400 })
  }

  const supabase = createAdminClient() as any
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', parsed.data.product_id)
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .eq('external_source', 'wolvox')
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: 'Canary ürünü bulunamadı' }, { status: 404 })
  }

  const [settings, { data: thresholds }, rememberedSources, sourceDecisions] = await Promise.all([
    getUserSettings(product.user_id),
    supabase
      .from('category_thresholds')
      .select('category, threshold_percent')
      .eq('user_id', product.user_id),
    getVerifiedSourceMemory(supabase, product.user_id, [product.id]),
    getSourceDecisions(supabase, product.user_id, [product.id]),
  ])

  const categoryThresholds = Object.fromEntries(
    (thresholds ?? []).map((item: any) => [item.category, Number(item.threshold_percent)]),
  )
  const startedAt = Date.now()
  const result = await analyzeProduct(product, {
    thresholdPercent: settings.default_threshold_percent,
    minSources: settings.min_sources,
    categoryThresholds,
    confidenceThresholds: {
      exact: settings.confidence_exact / 100,
      high: settings.confidence_high / 100,
      medium: settings.confidence_medium / 100,
      low: settings.confidence_low / 100,
    },
    upperOutlierPct: settings.outlier_upper_pct,
    lowerOutlierPct: settings.outlier_filter_pct,
    activePlatforms: settings.active_platforms,
    sourceDecisions: [...rememberedSources, ...sourceDecisions],
    // Canary'nin ana amacı ürün keşfini ölçmektir. İlk güvenilir kaynak
    // bulunduğunda daha geniş sorgulara geçmeyerek süreyi ve sağlayıcı
    // tüketimini sınırlı tutarız. Fiyatlandırma yeterliliği ayrıca raporlanır.
    discoveryTargetSources: 1,
  })
  const discovery = summarizeProductDiscovery(result, settings.min_sources)

  return NextResponse.json({
    dry_run: true,
    writes_performed: 0,
    minimum_sources: settings.min_sources,
    elapsed_seconds: Math.round((Date.now() - startedAt) / 100) / 10,
    estimated_provider_calls: result.search_attempts.reduce(
      (sum, attempt) => sum + attempt.platforms.length,
      0,
    ),
    product: {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      product_name: product.product_name,
      category: product.category,
      our_price: product.our_price,
      stock_quantity: product.stock_quantity,
    },
    discovery,
    result,
  })
}
