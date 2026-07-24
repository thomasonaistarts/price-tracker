import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildWolvoxPriceWritePreview,
  verifyWolvoxPriceReadback,
} from '../lib/integrations/wolvox-price-write.ts'

test('Wolvox price write remains preview-only until the write command is verified', () => {
  const preview = buildWolvoxPriceWritePreview({
    connectionId: 'connection',
    productId: 'product',
    externalId: 'ST0001',
    currentPrice: 100,
    targetPrice: 115,
    proposalId: 'proposal',
  })
  assert.equal(preview.executable, false)
  assert.equal(preview.blockedReason, 'wolvox_write_command_not_verified')
  assert.equal(preview.requiresExtraApproval, true)
  assert.equal(preview.rollbackPrice, 100)
  assert.match(preview.idempotencyKey, /proposal/)
})

test('Wolvox price readback requires cent-level equality', () => {
  assert.equal(verifyWolvoxPriceReadback({ expectedTargetPrice: 115, actualPrice: 115 }), true)
  assert.equal(verifyWolvoxPriceReadback({ expectedTargetPrice: 115, actualPrice: 114.98 }), false)
})

test('Wolvox price preview endpoint cannot queue or execute a write', async () => {
  const source = await readFile(
    new URL('../app/api/products/[id]/wolvox-price-preview/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /requireAuth/)
  assert.match(source, /external_product_mappings/)
  assert.match(source, /buildWolvoxPriceWritePreview/)
  assert.match(source, /queued: false/)
  assert.match(source, /written: false/)
  assert.doesNotMatch(source, /xmlpost/i)
})
