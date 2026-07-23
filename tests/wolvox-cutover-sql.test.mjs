import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase-wolvox-cutover-migration.sql', import.meta.url), 'utf8')

test('Wolvox cutover SQL only defines a guarded transactional RPC', () => {
  assert.match(sql, /create or replace function public\.execute_wolvox_catalog_cutover/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /service_role_required/i)
  assert.match(sql, /verified_archive_required/i)
  assert.match(sql, /confirmation_code_mismatch/i)
  assert.doesNotMatch(sql, /select\s+public\.execute_wolvox_catalog_cutover\s*\(/i)
})

test('Wolvox cutover validates counts before deleting and inserting', () => {
  const candidateCheck = sql.indexOf('candidate_count_mismatch')
  const liveCountCheck = sql.indexOf('live_product_count_changed')
  const deleteStatement = sql.indexOf('delete from public.products')
  const insertStatement = sql.indexOf('insert into public.products')

  assert.ok(candidateCheck >= 0)
  assert.ok(liveCountCheck > candidateCheck)
  assert.ok(deleteStatement > liveCountCheck)
  assert.ok(insertStatement > deleteStatement)
  assert.match(sql, /cutover_result_mismatch/i)
})

test('Wolvox cutover RPC is not executable by browser roles', () => {
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i)
})
