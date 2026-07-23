import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isMarketTrackingEligible,
  MARKET_TRACKING_MIN_PRICE,
  MARKET_TRACKING_POSTGREST_FILTER,
  MARKET_TRACKING_REFRESH_DAYS,
} from '../lib/market-tracking.ts'

test('automatic tracking requires positive stock and the 150 TL price threshold', () => {
  assert.equal(MARKET_TRACKING_MIN_PRICE, 150)
  assert.equal(isMarketTrackingEligible({
    our_price: 150,
    stock_quantity: 1,
    market_tracking_override: null,
  }), true)
  assert.equal(isMarketTrackingEligible({
    our_price: 149.99,
    stock_quantity: 1,
    market_tracking_override: null,
  }), false)
  assert.equal(isMarketTrackingEligible({
    our_price: 500,
    stock_quantity: 0,
    market_tracking_override: null,
  }), false)
})

test('manual tracking choice overrides both price and stock rules', () => {
  assert.equal(isMarketTrackingEligible({
    our_price: 10,
    stock_quantity: 0,
    market_tracking_override: true,
  }), true)
  assert.equal(isMarketTrackingEligible({
    our_price: 1000,
    stock_quantity: 10,
    market_tracking_override: false,
  }), false)
})

test('tracking refreshes every 15 days and cron filter mirrors the policy', () => {
  assert.equal(MARKET_TRACKING_REFRESH_DAYS, 15)
  assert.match(MARKET_TRACKING_POSTGREST_FILTER, /market_tracking_override\.eq\.true/)
  assert.match(MARKET_TRACKING_POSTGREST_FILTER, /market_tracking_override\.is\.null/)
  assert.match(MARKET_TRACKING_POSTGREST_FILTER, /our_price\.gte\.150/)
  assert.match(MARKET_TRACKING_POSTGREST_FILTER, /stock_quantity\.gt\.0/)
})
