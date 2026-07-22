export type SourceDecisionValue = 'approved' | 'rejected'

export interface SourceDecisionRule {
  id?: string
  product_id: string
  user_id?: string
  platform: string
  source_url: string
  source_product_name?: string | null
  decision: SourceDecisionValue
  created_at?: string
  updated_at?: string
}

const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'ref',
  'referrer',
  'source',
])

export function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim()

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return trimmed

    url.hash = ''
    url.hostname = url.hostname.toLocaleLowerCase('tr-TR')

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLocaleLowerCase('tr-TR').startsWith('utm_') || TRACKING_PARAMS.has(key.toLocaleLowerCase('tr-TR'))) {
        url.searchParams.delete(key)
      }
    }

    url.searchParams.sort()
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return trimmed
  }
}

export function sourceDecisionKey(platform: string, sourceUrl: string): string {
  return `${platform.trim().toLocaleLowerCase('tr-TR')}|${normalizeSourceUrl(sourceUrl)}`
}

export async function getSourceDecisions(
  supabase: any,
  userId: string,
  productIds: string[],
): Promise<SourceDecisionRule[]> {
  if (productIds.length === 0) return []

  const rows: SourceDecisionRule[] = []
  const pageSize = 500

  for (let index = 0; index < productIds.length; index += pageSize) {
    const { data, error } = await supabase
      .from('source_match_decisions')
      .select('id, product_id, user_id, platform, source_url, source_product_name, decision, created_at, updated_at')
      .eq('user_id', userId)
      .in('product_id', productIds.slice(index, index + pageSize))

    if (error) throw new Error(`Kaynak kararları okunamadı: ${error.message}`)
    rows.push(...((data ?? []) as SourceDecisionRule[]))
  }

  return rows
}

export function groupSourceDecisionsByProduct(
  decisions: SourceDecisionRule[],
): Map<string, SourceDecisionRule[]> {
  const grouped = new Map<string, SourceDecisionRule[]>()
  for (const decision of decisions) {
    const current = grouped.get(decision.product_id) ?? []
    current.push(decision)
    grouped.set(decision.product_id, current)
  }
  return grouped
}
