-- Ürün bazında onaylanan veya reddedilen pazar yeri eşleşmelerini saklar.
-- Supabase SQL Editor'da ana (production) proje üzerinde bir kez çalıştırın.

create table if not exists public.source_match_decisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null,
  source_url text not null,
  source_product_name text,
  decision text not null check (decision in ('approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, platform, source_url)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists source_match_decisions_updated_at on public.source_match_decisions;
create trigger source_match_decisions_updated_at
  before update on public.source_match_decisions
  for each row execute function public.set_updated_at();

alter table public.source_match_decisions enable row level security;

drop policy if exists "source_match_decisions_select" on public.source_match_decisions;
drop policy if exists "source_match_decisions_insert" on public.source_match_decisions;
drop policy if exists "source_match_decisions_update" on public.source_match_decisions;
drop policy if exists "source_match_decisions_delete" on public.source_match_decisions;

create policy "source_match_decisions_select" on public.source_match_decisions
  for select using (user_id = auth.uid() or public.is_admin());
create policy "source_match_decisions_insert" on public.source_match_decisions
  for insert with check (user_id = auth.uid());
create policy "source_match_decisions_update" on public.source_match_decisions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "source_match_decisions_delete" on public.source_match_decisions
  for delete using (user_id = auth.uid());

create index if not exists idx_source_match_decisions_user_product
  on public.source_match_decisions(user_id, product_id);
