export const MARKET_TRACKING_MIN_PRICE = 150
export const MARKET_TRACKING_REFRESH_DAYS = 15

export type MarketTrackingProduct = {
  our_price: number
  stock_quantity: number | null
  market_tracking_override: boolean | null
}

export function isMarketTrackingEligible(product: MarketTrackingProduct) {
  if (typeof product.market_tracking_override === 'boolean') {
    return product.market_tracking_override
  }

  return product.our_price >= MARKET_TRACKING_MIN_PRICE
    && product.stock_quantity !== null
    && product.stock_quantity > 0
}

export const MARKET_TRACKING_POSTGREST_FILTER =
  `market_tracking_override.eq.true,and(market_tracking_override.is.null,our_price.gte.${MARKET_TRACKING_MIN_PRICE},stock_quantity.gt.0)`
