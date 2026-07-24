import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const routePath = new URL('../app/api/products/[id]/ecommerce-pricing/route.ts', import.meta.url)

test('ecommerce pricing API keeps channel costs separate and requires extra approval', async () => {
  const source = await readFile(routePath, 'utf8')
  assert.match(source, /requireAuth/)
  assert.match(source, /ecommerce_commission_rate/)
  assert.match(source, /ecommerce_payment_fee_rate/)
  assert.match(source, /ecommerce_shipping_cost/)
  assert.match(source, /safety_stock/)
  assert.match(source, /requiresLargePriceChangeConfirmation/)
  assert.match(source, /confirm_large_change/)
  assert.match(source, /apply_ecommerce_pricing_configuration/)
  assert.match(source, /wolvox_written: false/)
  assert.doesNotMatch(source, /\.from\('products'\)\s*\.update/s)
})

test('ecommerce feed stays secret protected and owner scoped', async () => {
  const source = await readFile(
    new URL('../app/api/feeds/ecommerce/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /ECOMMERCE_FEED_SECRET/)
  assert.match(source, /ECOMMERCE_OWNER_USER_ID/)
  assert.match(source, /\.eq\('user_id', ownerUserId\)/)
  assert.match(source, /\.eq\('ecommerce_enabled', true\)/)
})
