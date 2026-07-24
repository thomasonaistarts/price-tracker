import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const routePath = new URL('../app/api/products/[id]/identity/route.ts', import.meta.url)
const componentPath = new URL('../components/products/ProductIdentityEditor.tsx', import.meta.url)

test('identity suggestion endpoint is owner scoped, evidence only and read-only', async () => {
  const source = await readFile(routePath, 'utf8')
  const getHandler = source.split('export async function POST')[0]

  assert.match(getHandler, /\.eq\('user_id', userId\)/)
  assert.match(getHandler, /\.eq\('status', 'verified'\)/)
  assert.match(getHandler, /writes_performed:\s*0/)
  assert.doesNotMatch(getHandler, /\.update\(/)
  assert.doesNotMatch(getHandler, /\.insert\(/)
  assert.doesNotMatch(getHandler, /\.rpc\(/)
})

test('identity suggestion UI requires a second explicit save action', async () => {
  const source = await readFile(componentPath, 'utf8')

  assert.match(source, /Kimlik önerisi getir/)
  assert.match(source, /Öneriyi forma al/)
  assert.match(source, /hiçbir değer otomatik kaydedilmez/)
  assert.match(source, /method:\s*'POST'/)
})
