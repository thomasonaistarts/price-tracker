import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { isAutomaticMatchEligible } from '../lib/scrapers/similarity.ts'
import { saveProductReviewCandidates } from '../lib/review-candidates.ts'

test('low-confidence matches require manual review and cannot enter market pricing', () => {
  assert.equal(isAutomaticMatchEligible('exact'), true)
  assert.equal(isAutomaticMatchEligible('high'), true)
  assert.equal(isAutomaticMatchEligible('medium'), true)
  assert.equal(isAutomaticMatchEligible('low'), false)
  assert.equal(isAutomaticMatchEligible('rejected'), false)
})

test('review-candidate migration stores candidates without replacing successful analyses', () => {
  const sql = fs.readFileSync('supabase-scraping-review-candidates-migration.sql', 'utf8')

  assert.match(sql, /alter table public\.products/i)
  assert.match(sql, /add column if not exists last_review_candidates jsonb/i)
  assert.match(sql, /add column if not exists last_review_candidates_at timestamptz/i)
  assert.match(sql, /default '\[\]'::jsonb/i)
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
  assert.doesNotMatch(sql, /\btruncate\b/i)
})

function mockSupabase(error = null) {
  const state = { table: null, payload: null, filters: [] }
  const query = {
    update(payload) {
      state.payload = payload
      return query
    },
    eq(column, value) {
      state.filters.push([column, value])
      if (state.filters.length < 2) return query
      return Promise.resolve({ error })
    },
  }

  return {
    state,
    client: {
      from(table) {
        state.table = table
        return query
      },
    },
  }
}

test('review candidates are owner scoped and missing migration stays backward compatible', async () => {
  const { client, state } = mockSupabase({ code: 'PGRST204', message: 'column not found' })

  await saveProductReviewCandidates(client, {
    productId: 'product-1',
    userId: 'user-1',
    observedAt: '2026-07-24T01:00:00.000Z',
    candidates: [{
      site: 'PTTAvm',
      product_name: 'Manuel aday',
      price: 100,
      url: 'https://example.com/product',
      currency: 'TRY',
      confidence: 'low',
    }],
  })

  assert.equal(state.table, 'products')
  assert.deepEqual(state.filters, [
    ['id', 'product-1'],
    ['user_id', 'user-1'],
  ])
  assert.equal(state.payload.last_review_candidates.length, 1)
  assert.equal(state.payload.last_review_candidates_at, '2026-07-24T01:00:00.000Z')
})

test('unexpected review-candidate storage errors are not swallowed', async () => {
  const { client } = mockSupabase({ code: '42501', message: 'permission denied' })

  await assert.rejects(
    saveProductReviewCandidates(client, {
      productId: 'product-1',
      userId: 'user-1',
      candidates: [],
    }),
    error => error?.code === '42501' && error?.message === 'permission denied',
  )
})
