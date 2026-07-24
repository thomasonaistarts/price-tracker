import type { ScrapedPrice } from '@/lib/scrapers'

export async function saveProductReviewCandidates(
  supabase: any,
  input: {
    productId: string
    userId: string
    candidates: ScrapedPrice[]
    observedAt?: string
  },
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      last_review_candidates: input.candidates,
      last_review_candidates_at: input.observedAt ?? new Date().toISOString(),
    })
    .eq('id', input.productId)
    .eq('user_id', input.userId)

  if (!error) return

  // Migration henüz uygulanmadıysa temel analiz akışını bozma. Deploy öncesi
  // migration zorunludur; bu tolerans yalnızca yerel/kademeli geçiş içindir.
  const missingColumn = error.code === '42703'
    || error.code === 'PGRST204'
    || /last_review_candidates/i.test(error.message ?? '')

  if (!missingColumn) throw error
}
