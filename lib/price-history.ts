export interface PriceHistorySource {
  site: string
  price: number
  comparisonPrice?: number
}

export interface PriceHistoryPoint {
  id: string
  run_at: string
  our_price: number | null
  market_mean: number | null
  min_price: number | null
  max_price: number | null
  price_diff_percent: number | null
  sources_count: number
  sources: PriceHistorySource[] | null
}

export interface PriceChangeEvent {
  at: string
  actor: string
  kind: 'our_price' | 'market' | 'platform'
  previous: number
  current: number
  percent: number
}

function sourcePriceMap(sources: PriceHistorySource[] | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const source of sources ?? []) {
    const value = source.comparisonPrice ?? source.price
    const current = map.get(source.site)
    if (Number.isFinite(value) && value > 0 && (current == null || value < current)) {
      map.set(source.site, value)
    }
  }
  return map
}

function createEvent(
  at: string,
  actor: string,
  kind: PriceChangeEvent['kind'],
  previous: number | null,
  current: number | null,
): PriceChangeEvent | null {
  if (previous == null || current == null || previous <= 0) return null
  if (Math.abs(current - previous) < 0.01) return null
  return {
    at,
    actor,
    kind,
    previous,
    current,
    percent: Math.round(((current - previous) / previous) * 10_000) / 100,
  }
}

export function buildPriceChangeEvents(points: PriceHistoryPoint[]): PriceChangeEvent[] {
  const ordered = [...points].sort((a, b) => a.run_at.localeCompare(b.run_at))
  const events: PriceChangeEvent[] = []

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]

    const ourEvent = createEvent(current.run_at, 'Bizim fiyat', 'our_price', previous.our_price, current.our_price)
    if (ourEvent) events.push(ourEvent)

    const marketEvent = createEvent(current.run_at, 'Piyasa ortalaması', 'market', previous.market_mean, current.market_mean)
    if (marketEvent) events.push(marketEvent)

    const previousSources = sourcePriceMap(previous.sources)
    const currentSources = sourcePriceMap(current.sources)
    currentSources.forEach((currentPrice, site) => {
      const platformEvent = createEvent(
        current.run_at,
        site,
        'platform',
        previousSources.get(site) ?? null,
        currentPrice,
      )
      if (platformEvent) events.push(platformEvent)
    })
  }

  return events.sort((a, b) => b.at.localeCompare(a.at))
}
