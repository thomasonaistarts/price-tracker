-- Düşük güvenli eşleşmeleri fiyat hesabından ayırırken manuel inceleme için saklar.
-- Adaylar ürün üzerinde tutulur; böylece başarısız/no_match denemesi son başarılı
-- price_analyses satırının yerini almadan kullanıcıya gösterilebilir.
alter table public.products
  add column if not exists last_review_candidates jsonb not null default '[]'::jsonb,
  add column if not exists last_review_candidates_at timestamptz;

comment on column public.products.last_review_candidates is
  'Son taramada fiyat hesabına alınmayan, kullanıcının elle onaylayabileceği düşük güvenli kaynak adayları.';

comment on column public.products.last_review_candidates_at is
  'Manuel inceleme adaylarının son yenilendiği zaman.';
