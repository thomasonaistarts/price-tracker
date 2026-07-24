-- Tekrarlanan yüksek güvenli eşleşmeleri doğrulanmış URL belleğine dönüştürür.
-- Deploy öncesinde Supabase SQL Editor'da bir kez çalıştırılmalıdır.

create table if not exists public.product_source_memory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null,
  source_url text not null,
  source_product_name text,
  status text not null default 'candidate' check (status in ('candidate', 'verified')),
  match_confidence text not null check (match_confidence in ('exact', 'high', 'medium', 'low')),
  seen_count integer not null default 1 check (seen_count > 0),
  last_price numeric(12, 2),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (product_id, platform, source_url)
);

alter table public.product_source_memory enable row level security;

drop policy if exists "product_source_memory_select" on public.product_source_memory;
create policy "product_source_memory_select" on public.product_source_memory
  for select using (user_id = auth.uid() or public.is_admin());

create index if not exists idx_product_source_memory_user_product
  on public.product_source_memory(user_id, product_id, status);

create or replace function public.remember_product_source(
  p_product_id uuid,
  p_platform text,
  p_source_url text,
  p_source_product_name text,
  p_price numeric,
  p_match_confidence text,
  p_force_verified boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id
  from public.products
  where id = p_product_id
    and (user_id = auth.uid() or public.is_admin());

  if owner_id is null then
    raise exception 'product_not_found';
  end if;

  insert into public.product_source_memory (
    product_id, user_id, platform, source_url, source_product_name,
    status, match_confidence, seen_count, last_price
  ) values (
    p_product_id, owner_id, p_platform, p_source_url, p_source_product_name,
    case when p_force_verified then 'verified' else 'candidate' end,
    p_match_confidence, 1, p_price
  )
  on conflict (product_id, platform, source_url) do update
  set
    source_product_name = excluded.source_product_name,
    match_confidence = excluded.match_confidence,
    last_price = excluded.last_price,
    last_seen_at = now(),
    seen_count = product_source_memory.seen_count + 1,
    status = case
      when product_source_memory.status = 'verified' then 'verified'
      when p_force_verified then 'verified'
      when p_match_confidence in ('exact', 'high') and product_source_memory.seen_count + 1 >= 2 then 'verified'
      else 'candidate'
    end;
end;
$$;

revoke all on function public.remember_product_source(
  uuid, text, text, text, numeric, text, boolean
) from public, anon;
grant execute on function public.remember_product_source(
  uuid, text, text, text, numeric, text, boolean
) to authenticated;
grant execute on function public.remember_product_source(
  uuid, text, text, text, numeric, text, boolean
) to service_role;
