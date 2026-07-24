import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sql = fs.readFileSync(path.resolve('supabase-source-memory-migration.sql'), 'utf8')

test('source memory is owner scoped and promotes repeated high confidence URLs', () => {
  assert.match(sql, /user_id\s*=\s*auth\.uid\(\)\s+or\s+public\.is_admin\(\)/i)
  assert.match(sql, /seen_count\s*=\s*product_source_memory\.seen_count\s*\+\s*1/i)
  assert.match(sql, /p_match_confidence\s+in\s*\('exact',\s*'high'\)/i)
  assert.match(sql, /unique\s*\(product_id,\s*platform,\s*source_url\)/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /revoke all[\s\S]*from public,\s*anon/i)
})
