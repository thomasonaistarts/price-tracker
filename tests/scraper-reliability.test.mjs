import test from 'node:test'
import assert from 'node:assert/strict'
import { platformsEligibleForFallback } from '../lib/scrapers/fallback.ts'
import { runAbortable, runInNamedQueue, runSequentialUntil } from '../lib/scrapers/execution.ts'
import { matchProduct } from '../lib/scrapers/similarity.ts'

test('scraper timeout aborts the underlying provider request', async () => {
  let aborted = false

  const result = await runAbortable(
    signal => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    }),
    10,
  )

  assert.equal(aborted, true)
  assert.equal(result.outcome, 'timeout')
})

test('ScraperAPI queue stops after the first quota exhaustion response', async () => {
  const called = []
  const makeJob = (platform, errorCode) => async () => {
    called.push(platform)
    return {
      items: [],
      health: {
        platform,
        status: 'error',
        resultCount: 0,
        durationMs: 1,
        errorCode,
      },
    }
  }

  const results = await runSequentialUntil([
    makeJob('Hepsiburada', 'quota_exhausted'),
    makeJob('N11'),
    makeJob('PTTAvm'),
  ], result => result.health.errorCode === 'quota_exhausted')

  assert.deepEqual(called, ['Hepsiburada'])
  assert.equal(results.length, 1)
})

test('named provider queue never runs two jobs concurrently', async () => {
  let active = 0
  let peak = 0
  const order = []

  const run = id => runInNamedQueue('test-provider', async () => {
    active += 1
    peak = Math.max(peak, active)
    order.push(`start-${id}`)
    await new Promise(resolve => setTimeout(resolve, 5))
    order.push(`end-${id}`)
    active -= 1
  })

  await Promise.all([run(1), run(2), run(3)])

  assert.equal(peak, 1)
  assert.deepEqual(order, [
    'start-1', 'end-1',
    'start-2', 'end-2',
    'start-3', 'end-3',
  ])
})

test('fallback retries only clean empty or unmatched successful platforms', () => {
  const remaining = platformsEligibleForFallback(
    ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol'],
    [
      { platform: 'Hepsiburada', status: 'error', resultCount: 0, durationMs: 10, errorCode: 'quota_exhausted' },
      { platform: 'N11', status: 'timeout', resultCount: 0, durationMs: 10 },
      { platform: 'PTTAvm', status: 'empty', resultCount: 0, durationMs: 10 },
      { platform: 'İdefix', status: 'success', resultCount: 3, durationMs: 10 },
      { platform: 'Trendyol', status: 'success', resultCount: 1, durationMs: 10 },
    ],
    new Set(['Trendyol']),
  )

  assert.deepEqual(remaining, ['PTTAvm', 'İdefix'])
})

test('single product does not match a multi-item bundle', () => {
  const result = matchProduct(
    'Adel Junior Love Corgi Sırt Çantası',
    "Junior Backpack I Love Corgi Okul Çantası Beslenme Çantası ve Kalemlik 3'lü Set",
  )

  assert.equal(result.confidence, 'rejected')
  assert.match(result.reasons.join(' '), /Çoklu paket uyumsuzluğu|Ürün tipi uyuşmuyor/)
})

test('distinctive model words reject a different backpack variant', () => {
  const result = matchProduct(
    'Adel Junior Love Corgi Sırt Çantası',
    'Adel Mini Anaokul Sırt Çantası Junior Happy Girl 2177 000182',
  )

  assert.equal(result.confidence, 'rejected')
  assert.match(result.reasons.join(' '), /Ayırt edici kimlik uyuşmuyor/)
})

test('matching distinctive model word keeps the correct Corgi candidate', () => {
  const result = matchProduct(
    'Adel Junior Love Corgi Sırt Çantası',
    'Adel Sırt Çantası Junior Corgi 2177000123000',
  )

  assert.notEqual(result.confidence, 'rejected')
  assert.match(result.reasons.join(' '), /Kimlik: 1\/2/)
})

test('different Kuromi edition is rejected when publisher identity changes', () => {
  const result = matchProduct(
    'Kuromi Boyama Kitabı The Çocuk',
    'Kuromi Star Simli Çıkartmalı Boyama Kitabı Doğan Çocuk',
  )

  assert.equal(result.confidence, 'rejected')
  assert.match(result.reasons.join(' '), /Ayırt edici kimlik uyuşmuyor/)
})

test('same Kuromi publisher identity remains eligible', () => {
  const result = matchProduct(
    'Kuromi Boyama Kitabı The Çocuk',
    'Kuromi Boyama Kitabı The Çocuk',
  )

  assert.notEqual(result.confidence, 'rejected')
})

test('low-confidence matches are review candidates, not automatic market sources', async () => {
  const { isAutomaticMatchEligible } = await import('../lib/scrapers/similarity.ts')
  assert.equal(isAutomaticMatchEligible('low'), false)
  assert.equal(isAutomaticMatchEligible('medium'), true)
})

test('bag subtype mismatch is rejected before price comparison', () => {
  const result = matchProduct(
    'Adel Beslenme Çantası Slam Dunk',
    'Küçük Çocuk Sırt Çantası, Slam Dunk',
  )
  assert.equal(result.confidence, 'rejected')
  assert.match(result.reasons.join(' '), /Ürün tipi uyuşmuyor/)
})
