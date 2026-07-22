import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllRows } from '../lib/supabase/paginate.ts'

test('fetchAllRows reads every page without truncating at 1000 rows', async () => {
  const source = Array.from({ length: 2505 }, (_, id) => ({ id }))
  const calls = []

  const rows = await fetchAllRows(async (from, to) => {
    calls.push([from, to])
    return { data: source.slice(from, to + 1), error: null }
  })

  assert.equal(rows.length, 2505)
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('fetchAllRows propagates database errors', async () => {
  await assert.rejects(
    fetchAllRows(async () => ({ data: null, error: new Error('database unavailable') })),
    /database unavailable/,
  )
})
