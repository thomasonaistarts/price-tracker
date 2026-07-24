export interface RobustMarketStatistics {
  acceptedPrices: number[]
  mean: number | null
  median: number | null
  reference: number | null
  standardDeviation: number | null
  min: number | null
  max: number | null
  method: 'none' | 'single' | 'median' | 'median_mad'
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

function medianOf(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function robustMarketStatistics(values: number[]): RobustMarketStatistics {
  const prices = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (prices.length === 0) {
    return {
      acceptedPrices: [],
      mean: null,
      median: null,
      reference: null,
      standardDeviation: null,
      min: null,
      max: null,
      method: 'none',
    }
  }

  const initialMedian = medianOf(prices)
  let acceptedPrices = prices
  let method: RobustMarketStatistics['method'] = prices.length === 1 ? 'single' : 'median'

  if (prices.length >= 4) {
    const deviations = prices.map(price => Math.abs(price - initialMedian)).sort((a, b) => a - b)
    const mad = medianOf(deviations)
    if (mad > 0) {
      const robustSigma = 1.4826 * mad
      acceptedPrices = prices.filter(price => Math.abs(price - initialMedian) <= 3 * robustSigma)
      method = 'median_mad'
    }
  }

  const mean = acceptedPrices.reduce((sum, price) => sum + price, 0) / acceptedPrices.length
  const median = medianOf(acceptedPrices)
  const variance = acceptedPrices.reduce((sum, price) => sum + (price - mean) ** 2, 0)
    / acceptedPrices.length

  return {
    acceptedPrices: acceptedPrices.map(round2),
    mean: round2(mean),
    median: round2(median),
    reference: round2(median),
    standardDeviation: round2(Math.sqrt(variance)),
    min: round2(Math.min(...acceptedPrices)),
    max: round2(Math.max(...acceptedPrices)),
    method,
  }
}
