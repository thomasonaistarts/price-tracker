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

export interface RecordedPriceChange {
  id: string
  created_at: string
  old_price: number
  new_price: number
  change_source: 'manual' | 'recommendation'
  reason: string | null
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

export function buildPriceChangeEvents(points: PriceHistoryPoint[], recordedChanges: RecordedPriceChange[] = []): PriceChangeEvent[] {
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

  const recordedEvents = recordedChanges.map((change): PriceChangeEvent => ({
    at: change.created_at,
    actor: change.change_source === 'recommendation' ? 'Bizim fiyat · öneri' : 'Bizim fiyat · manuel',
    kind: 'our_price',
    previous: change.old_price,
    current: change.new_price,
    percent: Math.round(((change.new_price - change.old_price) / change.old_price) * 10_000) / 100,
  }))
  const recordedPairs = new Set(recordedEvents.map(event => event.previous.toFixed(2) + '|' + event.current.toFixed(2)))
  const withoutDuplicatedSnapshots = events.filter(event =>
    event.kind !== 'our_price' || !recordedPairs.has(event.previous.toFixed(2) + '|' + event.current.toFixed(2)),
  )

  return [...withoutDuplicatedSnapshots, ...recordedEvents].sort((a, b) => b.at.localeCompare(a.at))
}

export function buildPriceChartPoints(points: PriceHistoryPoint[], recordedChanges: RecordedPriceChange[]): PriceHistoryPoint[] {
  const changes = recordedChanges.map((change): PriceHistoryPoint => ({
    id: 'change:' + change.id,
    run_at: change.created_at,
    our_price: change.new_price,
    market_mean: null,
    min_price: null,
    max_price: null,
    price_diff_percent: null,
    sources_count: 0,
    sources: [],
  }))
  return [...points, ...changes].sort((a, b) => a.run_at.localeCompare(b.run_at))
}
