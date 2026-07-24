import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const routeSource = fs.readFileSync(
  new URL('../app/api/debug-scraper/canary/route.ts', import.meta.url),
  'utf8',
)
const pageSource = fs.readFileSync(
  new URL('../app/(dashboard)/admin/scraping-canary/page.tsx', import.meta.url),
  'utf8',
)
const clientSource = fs.readFileSync(
  new URL('../components/admin/ScrapingCanaryClient.tsx', import.meta.url),
  'utf8',
)
const runnerSource = fs.readFileSync(
  new URL('../scripts/run-local-canary.ps1', import.meta.url),
  'utf8',
)

test('scraping canary is authenticated, owner-scoped, local-only and performs no database writes', () => {
  assert.match(routeSource, /NODE_ENV\s*===\s*'production'/)
  assert.match(routeSource, /supabase\.auth\.getUser\(\)/)
  assert.match(routeSource, /authorization/)
  assert.match(routeSource, /CRON_SECRET/)
  assert.match(routeSource, /\.eq\('provider', 'wolvox'\)/)
  assert.equal((routeSource.match(/\.eq\('user_id', auth\.userId\)/g) ?? []).length, 2)
  assert.doesNotMatch(routeSource, /\.(?:insert|upsert|update|delete)\s*\(/)
  assert.match(routeSource, /writes_performed:\s*0/)
  assert.match(pageSource, /NODE_ENV\s*===\s*'production'/)
  assert.match(pageSource, /notFound\(\)/)
  assert.match(pageSource, /requireAuth\(\)/)
})

test('canary client runs selected products sequentially rather than in parallel', () => {
  assert.match(clientSource, /for \(const productId of Array\.from\(selected\)\)/)
  assert.doesNotMatch(clientSource, /Promise\.all\(Array\.from\(selected\)/)
  assert.match(clientSource, /Tahmini \{data\.estimated_provider_calls\} sağlayıcı çağrısı/)
})

test('local canary runner enforces the 20-product ceiling and reports zero writes', () => {
  assert.match(runnerSource, /\[ValidateRange\(1,\s*20\)\]/)
  assert.match(runnerSource, /\[int\]\$MaxProducts\s*=\s*20/)
  assert.match(runnerSource, /\[string\[\]\]\$Skus/)
  assert.match(runnerSource, /Group-Object\s*\{/)
  assert.match(runnerSource, /priceBand/)
  assert.match(runnerSource, /max_allowed\s*=\s*20/)
  assert.match(runnerSource, /writes_performed/)
  assert.match(runnerSource, /products_with_accepted_source/)
  assert.match(runnerSource, /products_with_usable_market/)
  assert.doesNotMatch(runnerSource, /api\/cron\/reanalyze/)
})
