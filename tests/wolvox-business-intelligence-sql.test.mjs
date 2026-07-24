import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationPath = new URL('../supabase-wolvox-business-intelligence-migration.sql', import.meta.url)

test('Wolvox BI migration is idempotent and keeps movement entities separate', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /create table if not exists public\.product_source_memory/i)
  assert.match(sql, /function public\.remember_product_source/i)
  assert.match(sql, /create table if not exists public\.wolvox_inventory_snapshots/i)
  assert.match(sql, /create table if not exists public\.wolvox_documents/i)
  assert.match(sql, /create table if not exists public\.wolvox_document_lines/i)
  assert.match(sql, /create table if not exists public\.wolvox_current_accounts/i)
  assert.match(sql, /unique\(connection_id, external_id, document_type\)/i)
  assert.match(sql, /unique\(document_id, external_line_id\)/i)
})

test('Wolvox BI migration checks its required foundation before changing data', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /to_regclass\('public\.' \|\| required_relation\)/i)
  assert.match(sql, /missing_base_relation/i)
  assert.match(sql, /integration_connections/i)
  assert.match(sql, /price_sync_outbox/i)
})

test('Wolvox BI tables use RLS and owner-scoped read policies', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /alter table public\.wolvox_inventory_snapshots enable row level security/i)
  assert.match(sql, /owner_user_id = auth\.uid\(\)/i)
  assert.match(sql, /wolvox_document_lines_owner_select/i)
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete).*authenticated/i)
})

test('ecommerce pricing is separate from the store price and has safety stock', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /ecommerce_price numeric\(12, 2\)/i)
  assert.match(sql, /ecommerce_commission_rate numeric\(5, 2\)/i)
  assert.match(sql, /ecommerce_payment_fee_rate numeric\(5, 2\)/i)
  assert.match(sql, /ecommerce_shipping_cost numeric\(12, 2\)/i)
  assert.match(sql, /ecommerce_target_margin_rate numeric\(5, 2\)/i)
  assert.match(sql, /safety_stock numeric\(14, 3\)/i)
  assert.match(sql, /target text not null check \(target in \('store', 'ecommerce'\)\)/i)
  assert.match(sql, /requires_extra_approval boolean not null/i)
})

test('manual product identity approval is atomic and owner scoped', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /function public\.apply_manual_product_identity/i)
  assert.match(sql, /where id = p_product_id and user_id = v_user_id\s+for update/i)
  assert.match(sql, /on conflict \(product_id\) do update/i)
  assert.match(sql, /grant execute on function public\.apply_manual_product_identity/i)
})

test('ecommerce pricing is atomic, owner scoped and writes an audit proposal', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /function public\.apply_ecommerce_pricing_configuration/i)
  assert.match(sql, /where id = p_product_id and user_id = v_user_id\s+for update/i)
  assert.match(sql, /large_price_change_requires_confirmation/i)
  assert.match(sql, /insert into public\.price_proposals/i)
  assert.match(sql, /'ecommerce'.*v_current_price/s)
  assert.match(sql, /grant execute on function public\.apply_ecommerce_pricing_configuration/i)
})
