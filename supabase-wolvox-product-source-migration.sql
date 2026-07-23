-- Fiyatlaa — Wolvox kaynak kimliği ve stok alanları
-- Bu migration mevcut ürünleri değiştirmez veya silmez; yalnızca nullable kaynak alanları ekler.

alter table public.products
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists barcode text,
  add column if not exists stock_quantity numeric(14, 3),
  add column if not exists stock_unit text,
  add column if not exists external_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz;

create unique index if not exists idx_products_external_identity
  on public.products(user_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create index if not exists idx_products_barcode
  on public.products(user_id, barcode)
  where barcode is not null;

comment on column public.products.external_source is 'Ürün ana verisinin kaynağı; Wolvox aktarımında wolvox';
comment on column public.products.external_id is 'Kaynak sistemdeki değişmez ürün kimliği';
comment on column public.products.barcode is 'Kaynak sistemden gelen satış barkodu';
comment on column public.products.stock_quantity is 'Kaynak sistemde görülen son stok miktarı';
comment on column public.products.stock_unit is 'Stok birimi (adet, paket vb.)';
comment on column public.products.external_updated_at is 'Kaynak sistemdeki son değişiklik zamanı';
comment on column public.products.last_synced_at is 'Fiyatlaa tarafından son başarılı eşitleme zamanı';
