import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sql = fs.readFileSync(path.resolve('supabase-scrape-job-leases-migration.sql'), 'utf8')

test('scrape lease can only be claimed after expiry and is service-role only', () => {
  assert.match(sql, /on conflict\s*\(product_id\)\s*do update/i)
  assert.match(sql, /scrape_job_leases\.expires_at\s*<=\s*now\(\)/i)
  assert.match(sql, /grant execute[\s\S]*to service_role/i)
  assert.match(sql, /revoke all[\s\S]*from public,\s*anon,\s*authenticated/i)
})
