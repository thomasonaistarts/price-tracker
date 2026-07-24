-- Aynı ürünün iki Vercel instance/cron tarafından eşzamanlı taranmasını önler.
-- Deploy öncesinde Supabase SQL Editor'da bir kez çalıştırılmalıdır.

create table if not exists public.scrape_job_leases (
  product_id uuid primary key references public.products(id) on delete cascade,
  lease_owner text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.scrape_job_leases enable row level security;

create or replace function public.claim_scrape_job(
  p_product_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'invalid_lease_seconds';
  end if;

  insert into public.scrape_job_leases(product_id, lease_owner, expires_at)
  values (
    p_product_id,
    p_lease_owner,
    now() + make_interval(secs => p_lease_seconds)
  )
  on conflict (product_id) do update
  set
    lease_owner = excluded.lease_owner,
    expires_at = excluded.expires_at,
    created_at = now()
  where scrape_job_leases.expires_at <= now()
     or scrape_job_leases.lease_owner = excluded.lease_owner
  returning product_id into claimed_id;

  return claimed_id is not null;
end;
$$;

create or replace function public.release_scrape_job(
  p_product_id uuid,
  p_lease_owner text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scrape_job_leases
  where product_id = p_product_id
    and lease_owner = p_lease_owner;
$$;

revoke all on function public.claim_scrape_job(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_scrape_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_scrape_job(uuid, text, integer) to service_role;
grant execute on function public.release_scrape_job(uuid, text) to service_role;
