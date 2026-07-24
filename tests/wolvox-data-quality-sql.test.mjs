import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sql = fs.readFileSync(path.resolve('supabase-wolvox-data-quality-migration.sql'), 'utf8')

test('WOLVOX data repair is source and owner scoped', () => {
  assert.match(sql, /product\.external_source\s*=\s*'wolvox'/i)
  assert.match(sql, /connection\.owner_user_id\s*=\s*product\.user_id/i)
  assert.match(sql, /staging\.external_id\s*=\s*product\.external_id/i)
  assert.match(sql, /ARA_GRUBU/)
  assert.doesNotMatch(sql, /\bdelete\b/i)
})
