-- Fiyatlaa — denetlenebilir, insan onaylı fiyat değişiklikleri
-- Supabase Dashboard > SQL Editor içinde bir kez çalıştırın.

create table if not exists public.product_price_changes (
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

alter table public.product_price_changes enable row level security;

drop policy if exists "product_price_changes_select" on public.product_price_changes;
drop policy if exists "product_price_changes_insert" on public.product_price_changes;

create policy "product_price_changes_select" on public.product_price_changes
  for select using (user_id = auth.uid() or public.is_admin());

create policy "product_price_changes_insert" on public.product_price_changes
  for insert with check (user_id = auth.uid());

create index if not exists idx_product_price_changes_product_time
  on public.product_price_changes(product_id, created_at desc);

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
as $$
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
$$;

grant execute on function public.apply_product_price_change(uuid, numeric, numeric, text, text, jsonb) to authenticated;
