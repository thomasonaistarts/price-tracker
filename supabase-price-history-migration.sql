-- Analiz anındaki mağaza fiyatını saklar ve ürün geçmişi sorgularını hızlandırır.
-- Supabase SQL Editor'da ana (production) proje üzerinde bir kez çalıştırın.

alter table public.price_analyses
  add column if not exists our_price numeric(12, 2);

create index if not exists idx_price_analyses_product_history
  on public.price_analyses(user_id, product_id, run_at desc);

comment on column public.price_analyses.our_price is
  'Analiz çalıştığı anda products.our_price değerinin snapshot kopyası';
