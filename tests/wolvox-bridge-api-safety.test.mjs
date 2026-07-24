import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const routePath = new URL('../app/api/bridge/wolvox/business-data/route.ts', import.meta.url)

test('Wolvox bridge API is secret protected and strictly batch limited', async () => {
  const source = await readFile(routePath, 'utf8')
  assert.match(source, /WOLVOX_BRIDGE_SECRET/)
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /\.max\(250\)/)
  assert.match(source, /\.strict\(\)/)
  assert.doesNotMatch(source, /password/i)
})

test('Wolvox bridge API uses idempotent conflict keys', async () => {
  const source = await readFile(routePath, 'utf8')
  assert.match(source, /connection_id,external_product_id,depot_code,snapshot_at/)
  assert.match(source, /connection_id,summary_date,analysis_time/)
  assert.match(source, /valid_count \+ body\.invalid_count !== body\.received_count/)
})
