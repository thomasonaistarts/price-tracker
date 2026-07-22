import test from 'node:test'
import assert from 'node:assert/strict'
import { assertScraperResponse, ScraperProxyError } from '../lib/scrapers/proxy.ts'

test('ScraperAPI credit exhaustion is classified explicitly', async () => {
  await assert.rejects(
    assertScraperResponse(new Response('You have exhausted the API Credits available in this monthly cycle.', { status: 403 })),
    error => error instanceof ScraperProxyError && error.code === 'quota_exhausted',
  )
})

test('other provider failures keep a sanitized HTTP class', async () => {
  await assert.rejects(
    assertScraperResponse(new Response('internal error', { status: 503 })),
    error => error instanceof ScraperProxyError && error.code === 'http_5xx',
  )
})

test('successful responses pass through', async () => {
  await assert.doesNotReject(assertScraperResponse(new Response('ok', { status: 200 })))
})
