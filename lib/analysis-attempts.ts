import type { PlatformScrapeHealth } from '@/lib/scrapers'

export type AnalysisAttemptStatus = 'success' | 'failed'

interface AnalysisAttemptInput {
  productId: string
  userId: string
  status: AnalysisAttemptStatus
  attemptedAt?: string
  failureReason?: string | null
  errorMessage?: string | null
  scraperHealth?: PlatformScrapeHealth[]
}

export async function recordAnalysisAttempt(
  supabase: any,
  input: AnalysisAttemptInput,
) {
  const attemptedAt = input.attemptedAt ?? new Date().toISOString()
  const { error } = await supabase.from('analysis_attempts').insert({
    product_id: input.productId,
    user_id: input.userId,
    status: input.status,
    attempted_at: attemptedAt,
    failure_reason: input.failureReason ?? null,
    error_message: input.errorMessage ?? null,
    scraper_health: input.scraperHealth ?? [],
  })

  if (error) throw new Error('Analiz denemesi kaydedilemedi')

  const { error: productError } = await supabase
    .from('products')
    .update({
      last_attempted_at: attemptedAt,
      last_attempt_status: input.status,
      last_attempt_failure_reason: input.failureReason ?? null,
      last_attempt_error: input.errorMessage ?? null,
    })
    .eq('id', input.productId)
    .eq('user_id', input.userId)

  if (productError) throw new Error('Ürünün son deneme zamanı güncellenemedi')
}
