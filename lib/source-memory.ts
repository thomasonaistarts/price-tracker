import type { ScrapedPrice } from '@/lib/scrapers'
import {
  normalizeSourceUrl,
  type SourceDecisionRule,
} from '@/lib/source-decisions'

export async function getVerifiedSourceMemory(
  supabase: any,
  userId: string,
  productIds: string[],
): Promise<SourceDecisionRule[]> {
  if (productIds.length === 0) return []

  const { data, error } = await supabase
    .from('product_source_memory')
    .select('product_id, user_id, platform, source_url, source_product_name')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .in('product_id', productIds)

  // Migration henüz uygulanmadıysa analiz akışını bozma; bellek kademeli bir iyileştirmedir.
  if (error) return []

  return (data ?? []).map((row: any) => ({
    product_id: row.product_id,
    user_id: row.user_id,
    platform: row.platform,
    source_url: row.source_url,
    source_product_name: row.source_product_name,
    decision: 'approved' as const,
  }))
}

export async function rememberProductSources(
  supabase: any,
  input: {
    productId: string
    userId: string
    sources: ScrapedPrice[]
  },
): Promise<void> {
  const eligible = input.sources.filter(source =>
    source.manualDecision === 'approved'
    || source.confidence === 'exact'
    || source.confidence === 'high'
  )

  await Promise.all(eligible.map(async source => {
    await supabase.rpc('remember_product_source', {
      p_product_id: input.productId,
      p_platform: source.site,
      p_source_url: normalizeSourceUrl(source.url),
      p_source_product_name: source.product_name,
      p_price: source.price,
      p_match_confidence: source.confidence ?? 'low',
      p_force_verified: source.manualDecision === 'approved' || source.confidence === 'exact',
    })
  }))
}
