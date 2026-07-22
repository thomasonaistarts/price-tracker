-- Fiyatlaa — ürün maliyet ve kâr kuralları
-- Supabase Dashboard > SQL Editor içinde bir kez çalıştırın.

alter table public.products
  add column if not exists purchase_cost numeric(12, 2),
  add column if not exists vat_rate numeric(5, 2) not null default 20,
  add column if not exists commission_rate numeric(5, 2) not null default 0,
  add column if not exists shipping_cost numeric(12, 2) not null default 0,
  add column if not exists packaging_cost numeric(12, 2) not null default 0,
  add column if not exists target_margin_rate numeric(5, 2) not null default 20,
  add column if not exists price_floor numeric(12, 2),
  add column if not exists price_ceiling numeric(12, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_profitability_non_negative') then
    alter table public.products add constraint products_profitability_non_negative check (
      (purchase_cost is null or purchase_cost >= 0)
      and vat_rate between 0 and 100
      and commission_rate between 0 and 100
      and shipping_cost >= 0
      and packaging_cost >= 0
      and target_margin_rate between 0 and 100
      and (price_floor is null or price_floor > 0)
      and (price_ceiling is null or price_ceiling > 0)
      and (price_floor is null or price_ceiling is null or price_ceiling >= price_floor)
      and commission_rate + target_margin_rate < 100
    );
  end if;
end $$;
