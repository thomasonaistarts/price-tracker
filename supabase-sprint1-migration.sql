-- Fiyatlaa Sprint 1 incremental migration
-- Mevcut veritabanında Supabase Dashboard > SQL Editor üzerinden bir kez çalıştırın.

alter table public.products
  add column if not exists last_analyzed_at timestamptz;

alter table public.price_analyses
  add column if not exists scraper_health jsonb not null default '[]'::jsonb;

-- Bazı eski kurulumlarda kullanıcı ayarları tablosu hiç oluşturulmamış olabilir.
create table if not exists public.user_settings (
  user_id    uuid primary key references public.users(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_user_settings_updated_at'
  ) then
    create trigger trg_user_settings_updated_at
      before update on public.user_settings
      for each row execute function public.update_updated_at();
  end if;
end
$$;

alter table public.user_settings enable row level security;

create index if not exists idx_products_refresh_queue
  on public.products(is_active, last_analyzed_at);

-- İstemci tarafından gönderilen auth metadata'sı yönetici rolü veremez.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

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

drop policy if exists "users_select" on public.users;
drop policy if exists "users_update_self" on public.users;
drop policy if exists "users_admin_all" on public.users;
drop policy if exists "products_select" on public.products;
drop policy if exists "analyses_select" on public.price_analyses;
drop policy if exists "user_settings_own" on public.user_settings;

create policy "users_select" on public.users for select using (
  auth.uid() = id or public.is_admin()
);
create policy "users_admin_all" on public.users for all using (public.is_admin());

create policy "products_select" on public.products for select using (
  user_id = auth.uid() or public.is_admin()
);

create policy "analyses_select" on public.price_analyses for select using (
  user_id = auth.uid() or public.is_admin()
);

create policy "user_settings_own" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
