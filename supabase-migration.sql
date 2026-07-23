-- =============================================
-- Price Tracker — Supabase Migration
-- Supabase Dashboard > SQL Editor'de çalıştırın
-- =============================================

-- Extensions
create extension if not exists "uuid-ossp";

-- -----------------------------------------------
-- ENUM types
-- -----------------------------------------------
create type user_role as enum ('admin', 'user');
create type alert_type as enum ('above_market', 'below_market', 'no_alert', 'insufficient_data');

-- -----------------------------------------------
-- users tablosu
-- Supabase Auth ile senkronize; auth.users'a bağlı
-- -----------------------------------------------
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text not null,
  role          user_role not null default 'user',
  is_active     boolean not null default true,
  created_by    uuid references public.users(id),
  last_login    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------
-- products tablosu
-- -----------------------------------------------
create table public.products (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  sku           text not null,
  product_name  text not null,
  brand         text,
  category      text,
  external_source text,
  external_id   text,
  barcode       text,
  stock_quantity numeric(14, 3),
  stock_unit    text,
  external_updated_at timestamptz,
  last_synced_at timestamptz,
  our_price     numeric(12, 2) not null,
  purchase_cost numeric(12, 2) check (purchase_cost is null or purchase_cost >= 0),
  vat_rate      numeric(5, 2) not null default 20 check (vat_rate between 0 and 100),
  commission_rate numeric(5, 2) not null default 0 check (commission_rate between 0 and 100),
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  packaging_cost numeric(12, 2) not null default 0 check (packaging_cost >= 0),
  target_margin_rate numeric(5, 2) not null default 20 check (target_margin_rate between 0 and 100),
  price_floor   numeric(12, 2) check (price_floor is null or price_floor > 0),
  price_ceiling numeric(12, 2) check (price_ceiling is null or price_ceiling > 0),
  currency      text not null default 'TRY',
  check (commission_rate + target_margin_rate < 100),
  check (price_floor is null or price_ceiling is null or price_ceiling >= price_floor),
  is_active     boolean not null default true,
  market_tracking_override boolean,
  last_analyzed_at timestamptz,
  last_attempted_at timestamptz,
  last_attempt_status text check (last_attempt_status in ('success', 'failed')),
  last_attempt_failure_reason text,
  last_attempt_error text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(user_id, sku)
);

-- -----------------------------------------------
-- price_analyses tablosu
-- Her analiz çalıştırmasının sonuçları
-- -----------------------------------------------
create table public.price_analyses (
  id                  uuid primary key default uuid_generate_v4(),
  product_id          uuid not null references public.products(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  our_price            numeric(12, 2) not null,
  market_mean         numeric(12, 2),
  market_median       numeric(12, 2),
  market_std          numeric(12, 2),
  min_price           numeric(12, 2),
  max_price           numeric(12, 2),
  price_diff_percent  numeric(8, 2),
  alert               alert_type not null default 'no_alert',
  alert_reason        text,
  sources_count       integer not null default 0,
  sources             jsonb not null default '[]',
  scraper_health      jsonb not null default '[]',
  confidence          numeric(4, 2),
  threshold_used      numeric(5, 2) not null default 10,
  notes               text[] not null default '{}',
  follow_up           text[] not null default '{}',
  run_at              timestamptz not null default now()
);

-- -----------------------------------------------
-- analysis_attempts tablosu
-- Başarılı ve başarısız her tarama denemesinin kalıcı günlüğü
-- -----------------------------------------------
create table public.analysis_attempts (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references public.products(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  status          text not null check (status in ('success', 'failed')),
  failure_reason  text,
  error_message   text,
  scraper_health  jsonb not null default '[]',
  attempted_at    timestamptz not null default now()
);

-- -----------------------------------------------
-- source_match_decisions tablosu
-- Kullanıcının doğru/yanlış kaynak eşleşmesi kararları
-- -----------------------------------------------
create table public.source_match_decisions (
  id                  uuid primary key default uuid_generate_v4(),
  product_id          uuid not null references public.products(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  platform            text not null,
  source_url          text not null,
  source_product_name text,
  decision            text not null check (decision in ('approved', 'rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(product_id, platform, source_url)
);

-- -----------------------------------------------
-- product_price_changes tablosu
-- Manuel ve öneri kaynaklı fiyat değişikliklerinin denetim günlüğü
-- -----------------------------------------------
create table public.product_price_changes (
  id                      uuid primary key default uuid_generate_v4(),
  product_id              uuid not null references public.products(id) on delete cascade,
  user_id                 uuid not null references public.users(id) on delete cascade,
  old_price               numeric(12, 2) not null check (old_price > 0),
  new_price               numeric(12, 2) not null check (new_price > 0),
  change_source           text not null check (change_source in ('manual', 'recommendation')),
  reason                  text,
  recommendation_snapshot jsonb not null default '{}',
  created_at              timestamptz not null default now()
);

create view public.latest_price_analyses
with (security_invoker = true)
as
select distinct on (product_id) *
from public.price_analyses
order by product_id, run_at desc;

grant select on public.latest_price_analyses to authenticated;

-- -----------------------------------------------
-- category_thresholds tablosu
-- Kullanıcı başına kategori eşikleri
-- -----------------------------------------------
create table public.category_thresholds (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  category          text not null,
  threshold_percent numeric(5, 2) not null default 10,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id, category)
);

-- -----------------------------------------------
-- updated_at otomatik güncelleme trigger'ı
-- -----------------------------------------------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function update_updated_at();

create trigger trg_thresholds_updated_at
  before update on public.category_thresholds
  for each row execute function update_updated_at();

create trigger trg_source_match_decisions_updated_at
  before update on public.source_match_decisions
  for each row execute function update_updated_at();

-- -----------------------------------------------
-- auth.users → public.users otomatik senkronizasyon
-- Yeni kayıt olduğunda public.users'a da ekler
-- -----------------------------------------------
create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'user'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -----------------------------------------------
-- last_login güncelleme
-- -----------------------------------------------
create or replace function handle_auth_sign_in()
returns trigger as $$
begin
  update public.users set last_login = now() where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- -----------------------------------------------
-- Row Level Security (RLS)
-- -----------------------------------------------

-- RLS politikalarında users tablosuna doğrudan geri dönmek sonsuz özyineleme
-- üretebilir. Yönetici kontrolünü security definer yardımcı fonksiyonuyla yap.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.price_analyses enable row level security;
alter table public.analysis_attempts enable row level security;
alter table public.source_match_decisions enable row level security;
alter table public.product_price_changes enable row level security;
alter table public.category_thresholds enable row level security;

-- users: admin herkesi görür, user sadece kendini
create policy "users_select" on public.users for select using (
  auth.uid() = id
  or public.is_admin()
);
create policy "users_admin_all" on public.users for all using (public.is_admin());

-- products: kullanıcı kendi ürünlerini görür; admin hepsini
create policy "products_select" on public.products for select using (
  user_id = auth.uid()
  or public.is_admin()
);
create policy "products_insert" on public.products for insert with check (user_id = auth.uid());
create policy "products_update" on public.products for update using (user_id = auth.uid());
create policy "products_delete" on public.products for delete using (user_id = auth.uid());

-- price_analyses: kullanıcı kendi analizlerini görür; admin hepsini
create policy "analyses_select" on public.price_analyses for select using (
  user_id = auth.uid()
  or public.is_admin()
);
create policy "analyses_insert" on public.price_analyses for insert with check (user_id = auth.uid());

create policy "analysis_attempts_select" on public.analysis_attempts for select using (
  user_id = auth.uid() or public.is_admin()
);
create policy "analysis_attempts_insert" on public.analysis_attempts for insert with check (user_id = auth.uid());

create policy "source_match_decisions_select" on public.source_match_decisions for select using (
  user_id = auth.uid() or public.is_admin()
);
create policy "source_match_decisions_insert" on public.source_match_decisions for insert with check (user_id = auth.uid());
create policy "source_match_decisions_update" on public.source_match_decisions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "source_match_decisions_delete" on public.source_match_decisions for delete using (user_id = auth.uid());

create policy "product_price_changes_select" on public.product_price_changes
  for select using (user_id = auth.uid() or public.is_admin());
create policy "product_price_changes_insert" on public.product_price_changes
  for insert with check (user_id = auth.uid());

-- category_thresholds: kendi eşiklerini yönetir
create policy "thresholds_all" on public.category_thresholds for all using (user_id = auth.uid());

-- -----------------------------------------------
-- Atomik fiyat güncelleme ve denetim kaydı
-- -----------------------------------------------
create or replace function public.apply_product_price_change(
  p_product_id uuid,
  p_expected_old_price numeric,
  p_new_price numeric,
  p_change_source text,
  p_reason text default null,
  p_snapshot jsonb default '{}'
)
returns public.product_price_changes
language plpgsql
security invoker
set search_path = public
as $
declare
  changed public.product_price_changes;
begin
  if p_new_price is null or p_new_price <= 0 then
    raise exception 'invalid_new_price';
  end if;
  if p_change_source not in ('manual', 'recommendation') then
    raise exception 'invalid_change_source';
  end if;

  update public.products
  set our_price = round(p_new_price, 2), updated_at = now()
  where id = p_product_id
    and user_id = auth.uid()
    and abs(our_price - p_expected_old_price) < 0.01;

  if not found then
    raise exception 'price_changed_or_product_missing';
  end if;

  insert into public.product_price_changes (
    product_id, user_id, old_price, new_price, change_source, reason, recommendation_snapshot
  ) values (
    p_product_id, auth.uid(), round(p_expected_old_price, 2), round(p_new_price, 2),
    p_change_source, p_reason, coalesce(p_snapshot, '{}')
  ) returning * into changed;
  return changed;
end;
$;

grant execute on function public.apply_product_price_change(uuid, numeric, numeric, text, text, jsonb) to authenticated;

-- -----------------------------------------------
-- Indexes
-- -----------------------------------------------
create index idx_products_user_id on public.products(user_id);
create index idx_products_sku on public.products(user_id, sku);
create unique index idx_products_external_identity on public.products(user_id, external_source, external_id)
  where external_source is not null and external_id is not null;
create index idx_products_barcode on public.products(user_id, barcode)
  where barcode is not null;
create index idx_products_refresh_queue on public.products(is_active, last_analyzed_at);
create index idx_products_analysis_queue on public.products(is_active, last_attempted_at, last_analyzed_at);
create index idx_products_market_tracking_queue on public.products(is_active, market_tracking_override, our_price, stock_quantity, last_attempted_at, last_analyzed_at);
create index idx_analyses_product_id on public.price_analyses(product_id);
create index idx_price_analyses_product_history on public.price_analyses(user_id, product_id, run_at desc);
create index idx_analyses_user_id on public.price_analyses(user_id);
create index idx_analyses_run_at on public.price_analyses(run_at desc);
create index idx_analyses_alert on public.price_analyses(alert);
create index idx_analysis_attempts_product_time on public.analysis_attempts(product_id, attempted_at desc);
create index idx_analysis_attempts_user_time on public.analysis_attempts(user_id, attempted_at desc);
create index idx_source_match_decisions_user_product on public.source_match_decisions(user_id, product_id);
create index idx_product_price_changes_product_time on public.product_price_changes(product_id, created_at desc);
create index idx_thresholds_user_id on public.category_thresholds(user_id);

-- -----------------------------------------------
-- user_settings tablosu
-- Kullanıcı başına sistem ayarları (JSONB)
-- -----------------------------------------------
create table public.user_settings (
  user_id    uuid primary key references public.users(id) on delete cascade,
  settings   jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function update_updated_at();

alter table public.user_settings enable row level security;
create policy "user_settings_own" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------
-- İlk admin kullanıcı oluşturma
-- Supabase Dashboard > Authentication > Users'dan
-- kullanıcı oluşturduktan sonra aşağıdaki sorguyu çalıştırın:
--
-- update public.users set role = 'admin' where email = 'admin@sirket.com';
-- -----------------------------------------------

-- =============================================
-- Wolvox ve site arşiv temeli
-- =============================================
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
