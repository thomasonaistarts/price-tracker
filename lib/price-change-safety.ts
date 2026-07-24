export const DEFAULT_MAX_SINGLE_PRICE_CHANGE_PERCENT = 10

export function priceChangePercent(oldPrice: number, newPrice: number): number {
  if (!Number.isFinite(oldPrice) || oldPrice <= 0 || !Number.isFinite(newPrice) || newPrice <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.round((Math.abs(newPrice - oldPrice) / oldPrice) * 10_000) / 100
}

export function requiresLargePriceChangeConfirmation(
  oldPrice: number,
  newPrice: number,
  limitPercent = DEFAULT_MAX_SINGLE_PRICE_CHANGE_PERCENT,
): boolean {
  return priceChangePercent(oldPrice, newPrice) > limitPercent
}
