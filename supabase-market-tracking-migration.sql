-- Fiyatlaa piyasa takip politikası
-- NULL: otomatik kural (pozitif stok ve en az 150 TL)
-- TRUE: fiyat/stok eşiğinden bağımsız olarak takibe al
-- FALSE: otomatik takipten çıkar

alter table public.products
  add column if not exists market_tracking_override boolean;

create index if not exists idx_products_market_tracking_queue
  on public.products(
    is_active,
    market_tracking_override,
    our_price,
    stock_quantity,
    last_attempted_at,
    last_analyzed_at
  );
