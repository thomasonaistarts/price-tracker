-- Analiz kuyruğunda adil seçim ve 3.000+ ürün için ölçeklenebilir son durum modeli
-- Supabase Dashboard > SQL Editor üzerinden çalıştırın. Tekrar çalıştırılması güvenlidir.

alter table public.products
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_attempt_status text check (last_attempt_status in ('success', 'failed')),
  add column if not exists last_attempt_failure_reason text,
  add column if not exists last_attempt_error text;

-- Daha önce oluşmuş denemelerden ürünlerin son deneme özetini doldur.
update public.products as product
set
  last_attempted_at = latest.attempted_at,
  last_attempt_status = latest.status,
  last_attempt_failure_reason = latest.failure_reason,
  last_attempt_error = latest.error_message
from (
  select distinct on (product_id)
    product_id,
    attempted_at,
    status,
    failure_reason,
    error_message
  from public.analysis_attempts
  order by product_id, attempted_at desc
) as latest
where product.id = latest.product_id
  and (
    product.last_attempted_at is null
    or product.last_attempted_at <= latest.attempted_at
  );

create index if not exists idx_products_analysis_queue
  on public.products(is_active, last_attempted_at, last_analyzed_at);

-- Her ürün için yalnızca en güncel başarılı analiz satırı.
create or replace view public.latest_price_analyses
with (security_invoker = true)
as
select distinct on (product_id) *
from public.price_analyses
order by product_id, run_at desc;

grant select on public.latest_price_analyses to authenticated;
