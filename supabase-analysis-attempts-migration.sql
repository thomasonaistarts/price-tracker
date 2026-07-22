-- Kalıcı analiz deneme geçmişi
-- Supabase Dashboard > SQL Editor üzerinden bir kez çalıştırın.

create table if not exists public.analysis_attempts (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references public.products(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  status          text not null check (status in ('success', 'failed')),
  failure_reason  text,
  error_message   text,
  scraper_health  jsonb not null default '[]'::jsonb,
  attempted_at    timestamptz not null default now()
);

alter table public.analysis_attempts enable row level security;

drop policy if exists "analysis_attempts_select" on public.analysis_attempts;
drop policy if exists "analysis_attempts_insert" on public.analysis_attempts;

create policy "analysis_attempts_select" on public.analysis_attempts
  for select using (user_id = auth.uid() or public.is_admin());

create policy "analysis_attempts_insert" on public.analysis_attempts
  for insert with check (user_id = auth.uid());

create index if not exists idx_analysis_attempts_product_time
  on public.analysis_attempts(product_id, attempted_at desc);

create index if not exists idx_analysis_attempts_user_time
  on public.analysis_attempts(user_id, attempted_at desc);
