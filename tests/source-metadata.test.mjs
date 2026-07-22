import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractGenericCommerceMetadata,
  extractSchemaOfferMetadata,
  extractTrendyolMetadata,
} from '../lib/scrapers/metadata.ts'

test('Trendyol metadata exposes stock, fulfillment, promotion and previous price', () => {
  const metadata = extractTrendyolMetadata({
    pricing: { price: { original_price: 200 } },
    availability: { stock: { is_sold_out: false } },
    fulfillment: { free_shipping: true, fast_delivery: true },
    promotions: { has_collectable_coupon: true, single_promotion: { short_name: 'Sepette indirim' } },
    badges: { official_seller: true },
  }, 150)

  assert.deepEqual(metadata, {
    originalPrice: 200,
    inStock: true,
    shipping: ['Ücretsiz kargo', 'Hızlı teslimat'],
    campaigns: ['Sepette indirim', 'Kupon var'],
    officialSeller: true,
  })
})

test('Schema.org offer metadata reads seller, availability and free shipping', () => {
  assert.deepEqual(extractSchemaOfferMetadata({
    seller: { name: 'Kırtasiye A' },
    availability: 'https://schema.org/InStock',
    highPrice: 120,
    shippingDetails: { shippingRate: { value: 0 } },
  }, 100), {
    seller: 'Kırtasiye A',
    originalPrice: 120,
    inStock: true,
    shipping: ['Ücretsiz kargo'],
  })
})

test('generic metadata does not show an old price below the current price', () => {
  const metadata = extractGenericCommerceMetadata({ listPrice: 90, salePrice: 100, isSoldOut: true }, 100)
  assert.equal(metadata.originalPrice, undefined)
  assert.equal(metadata.inStock, false)
})
