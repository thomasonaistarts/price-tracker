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
  const { error } = await supabase.from('analysis_attempts').insert({
    product_id: input.productId,
    user_id: input.userId,
    status: input.status,
    attempted_at: input.attemptedAt ?? new Date().toISOString(),
    failure_reason: input.failureReason ?? null,
    error_message: input.errorMessage ?? null,
    scraper_health: input.scraperHealth ?? [],
  })

  if (error) throw new Error('Analiz denemesi kaydedilemedi')
}
