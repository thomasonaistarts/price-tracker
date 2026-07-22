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
  our_price     numeric(12, 2) not null,
  currency      text not null default 'TRY',
  is_active     boolean not null default true,
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

-- category_thresholds: kendi eşiklerini yönetir
create policy "thresholds_all" on public.category_thresholds for all using (user_id = auth.uid());

-- -----------------------------------------------
-- Indexes
-- -----------------------------------------------
create index idx_products_user_id on public.products(user_id);
create index idx_products_sku on public.products(user_id, sku);
create index idx_products_refresh_queue on public.products(is_active, last_analyzed_at);
create index idx_products_analysis_queue on public.products(is_active, last_attempted_at, last_analyzed_at);
create index idx_analyses_product_id on public.price_analyses(product_id);
create index idx_analyses_user_id on public.price_analyses(user_id);
create index idx_analyses_run_at on public.price_analyses(run_at desc);
create index idx_analyses_alert on public.price_analyses(alert);
create index idx_analysis_attempts_product_time on public.analysis_attempts(product_id, attempted_at desc);
create index idx_analysis_attempts_user_time on public.analysis_attempts(user_id, attempted_at desc);
create index idx_source_match_decisions_user_product on public.source_match_decisions(user_id, product_id);
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
