-- Fiyatlaa — site arşivi ve sürümden bağımsız Wolvox entegrasyon temeli
-- Bu migration canlı ürünleri SİLMEZ. Yalnızca arşiv/entegrasyon tablolarını ve güvenli arşiv fonksiyonunu ekler.

create table if not exists public.data_archive_batches (
  id              uuid primary key default uuid_generate_v4(),
  scope           text not null default 'site_catalog' check (scope = 'site_catalog'),
  status          text not null default 'preparing' check (status in ('preparing', 'verified', 'failed')),
  reason          text,
  source_counts   jsonb not null default '{}',
  archive_counts  jsonb not null default '{}',
  created_by      uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  verified_at     timestamptz
);

create table if not exists public.data_archive_rows (
  id              uuid primary key default uuid_generate_v4(),
  batch_id        uuid not null references public.data_archive_batches(id) on delete cascade,
  source_table    text not null,
  source_id       text not null,
  owner_user_id   uuid,
  payload         jsonb not null,
  archived_at     timestamptz not null default now(),
  unique(batch_id, source_table, source_id)
);

create table if not exists public.integration_connections (
  id                  uuid primary key default uuid_generate_v4(),
  owner_user_id       uuid not null references public.users(id) on delete cascade,
  provider            text not null check (provider = 'wolvox'),
  display_name        text not null default 'Wolvox Kırtasiye',
  status              text not null default 'configuring' check (status in ('configuring', 'disconnected', 'connected', 'error', 'paused')),
  wolvox_version      text,
  company_code        text,
  working_year        integer,
  bridge_installation_id uuid,
  last_heartbeat_at   timestamptz,
  last_error          text,
  created_by          uuid not null references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(owner_user_id, provider)
);

create table if not exists public.integration_sync_runs (
  id              uuid primary key default uuid_generate_v4(),
  connection_id   uuid not null references public.integration_connections(id) on delete cascade,
  direction       text not null check (direction in ('inbound', 'outbound')),
  entity_type     text not null check (entity_type in ('catalog', 'inventory', 'prices', 'discovery')),
  status          text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  received_count  integer not null default 0,
  valid_count     integer not null default 0,
  invalid_count   integer not null default 0,
  details         jsonb not null default '{}',
  error_message   text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table if not exists public.wolvox_product_staging (
  id                uuid primary key default uuid_generate_v4(),
  connection_id     uuid not null references public.integration_connections(id) on delete cascade,
  sync_run_id       uuid references public.integration_sync_runs(id) on delete set null,
  external_id       text not null,
  sku               text,
  barcode           text,
  product_name      text,
  brand             text,
  category          text,
  sales_price       numeric(12, 2),
  purchase_cost     numeric(12, 2),
  vat_rate          numeric(5, 2),
  stock_quantity    numeric(14, 3),
  unit_name         text,
  is_active         boolean not null default true,
  validation_errors text[] not null default '{}',
  raw_data          jsonb not null default '{}',
  received_at       timestamptz not null default now(),
  unique(connection_id, external_id)
);

create table if not exists public.external_product_mappings (
  id              uuid primary key default uuid_generate_v4(),
  connection_id   uuid not null references public.integration_connections(id) on delete cascade,
  external_id     text not null,
  product_id      uuid not null references public.products(id) on delete cascade,
  mapping_method  text not null check (mapping_method in ('external_id', 'barcode', 'sku', 'manual')),
  status          text not null default 'active' check (status in ('active', 'conflict', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(connection_id, external_id),
  unique(connection_id, product_id)
);

create table if not exists public.price_sync_outbox (
  id                uuid primary key default uuid_generate_v4(),
  connection_id     uuid not null references public.integration_connections(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  price_change_id   uuid references public.product_price_changes(id) on delete set null,
  external_id       text not null,
  target_price      numeric(12, 2) not null check (target_price > 0),
  status            text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  attempt_count     integer not null default 0,
  next_attempt_at   timestamptz not null default now(),
  last_error        text,
  idempotency_key   text not null unique,
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

alter table public.data_archive_batches enable row level security;
alter table public.data_archive_rows enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.wolvox_product_staging enable row level security;
alter table public.external_product_mappings enable row level security;
alter table public.price_sync_outbox enable row level security;

drop policy if exists "data_archive_batches_admin" on public.data_archive_batches;
drop policy if exists "data_archive_rows_admin" on public.data_archive_rows;
drop policy if exists "integration_connections_select" on public.integration_connections;
drop policy if exists "integration_connections_admin" on public.integration_connections;
drop policy if exists "integration_sync_runs_admin" on public.integration_sync_runs;
drop policy if exists "wolvox_product_staging_admin" on public.wolvox_product_staging;
drop policy if exists "external_product_mappings_admin" on public.external_product_mappings;
drop policy if exists "price_sync_outbox_admin" on public.price_sync_outbox;

create policy "data_archive_batches_admin" on public.data_archive_batches for all using (public.is_admin()) with check (public.is_admin());
create policy "data_archive_rows_admin" on public.data_archive_rows for all using (public.is_admin()) with check (public.is_admin());
create policy "integration_connections_select" on public.integration_connections for select using (owner_user_id = auth.uid() or public.is_admin());
create policy "integration_connections_admin" on public.integration_connections for all using (public.is_admin()) with check (public.is_admin());
create policy "integration_sync_runs_admin" on public.integration_sync_runs for all using (public.is_admin()) with check (public.is_admin());
create policy "wolvox_product_staging_admin" on public.wolvox_product_staging for all using (public.is_admin()) with check (public.is_admin());
create policy "external_product_mappings_admin" on public.external_product_mappings for all using (public.is_admin()) with check (public.is_admin());
create policy "price_sync_outbox_admin" on public.price_sync_outbox for all using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_data_archive_rows_batch_table on public.data_archive_rows(batch_id, source_table);
create index if not exists idx_integration_connections_owner on public.integration_connections(owner_user_id);
create index if not exists idx_integration_sync_runs_connection_time on public.integration_sync_runs(connection_id, started_at desc);
create index if not exists idx_wolvox_staging_connection on public.wolvox_product_staging(connection_id, received_at desc);
create index if not exists idx_external_product_mappings_product on public.external_product_mappings(product_id);
create index if not exists idx_price_sync_outbox_queue on public.price_sync_outbox(status, next_attempt_at);

drop trigger if exists trg_integration_connections_updated_at on public.integration_connections;
create trigger trg_integration_connections_updated_at
  before update on public.integration_connections
  for each row execute function update_updated_at();

drop trigger if exists trg_external_product_mappings_updated_at on public.external_product_mappings;
create trigger trg_external_product_mappings_updated_at
  before update on public.external_product_mappings
  for each row execute function update_updated_at();

create or replace function public.create_site_catalog_archive(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_source_counts jsonb;
  v_archive_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;

  select jsonb_build_object(
    'users', (select count(*) from public.users),
    'user_settings', (select count(*) from public.user_settings),
    'category_thresholds', (select count(*) from public.category_thresholds),
    'products', (select count(*) from public.products),
    'price_analyses', (select count(*) from public.price_analyses),
    'analysis_attempts', (select count(*) from public.analysis_attempts),
    'source_match_decisions', (select count(*) from public.source_match_decisions),
    'product_price_changes', (select count(*) from public.product_price_changes)
  ) into v_source_counts;

  insert into public.data_archive_batches (status, reason, source_counts, created_by)
  values ('preparing', nullif(trim(p_reason), ''), v_source_counts, auth.uid())
  returning id into v_batch_id;

  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'users', id::text, id, to_jsonb(row_data) from public.users row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'user_settings', user_id::text, user_id, to_jsonb(row_data) from public.user_settings row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'category_thresholds', id::text, user_id, to_jsonb(row_data) from public.category_thresholds row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'products', id::text, user_id, to_jsonb(row_data) from public.products row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'price_analyses', id::text, user_id, to_jsonb(row_data) from public.price_analyses row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'analysis_attempts', id::text, user_id, to_jsonb(row_data) from public.analysis_attempts row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'source_match_decisions', id::text, user_id, to_jsonb(row_data) from public.source_match_decisions row_data;
  insert into public.data_archive_rows (batch_id, source_table, source_id, owner_user_id, payload)
    select v_batch_id, 'product_price_changes', id::text, user_id, to_jsonb(row_data) from public.product_price_changes row_data;

  select jsonb_build_object(
    'users', count(*) filter (where source_table = 'users'),
    'user_settings', count(*) filter (where source_table = 'user_settings'),
    'category_thresholds', count(*) filter (where source_table = 'category_thresholds'),
    'products', count(*) filter (where source_table = 'products'),
    'price_analyses', count(*) filter (where source_table = 'price_analyses'),
    'analysis_attempts', count(*) filter (where source_table = 'analysis_attempts'),
    'source_match_decisions', count(*) filter (where source_table = 'source_match_decisions'),
    'product_price_changes', count(*) filter (where source_table = 'product_price_changes')
  ) into v_archive_counts
  from public.data_archive_rows where batch_id = v_batch_id;

  if v_source_counts <> v_archive_counts then
    raise exception 'archive_count_mismatch';
  end if;

  update public.data_archive_batches
  set status = 'verified', archive_counts = v_archive_counts, verified_at = now()
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

revoke all on function public.create_site_catalog_archive(text) from public;
grant execute on function public.create_site_catalog_archive(text) to authenticated;

