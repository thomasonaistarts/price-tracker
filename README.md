# Fiyat İzleme Sistemi

Next.js 14 + Supabase ile geliştirilmiş Türkiye pazar fiyat izleme platformu.

## Teknolojiler

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Server Actions)
- **Veritabanı**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Analiz**: Tarayıcı/sunucu tarafı analiz motoru

---

## Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Supabase projesi oluştur

1. [app.supabase.com](https://app.supabase.com) → Yeni proje
2. **SQL Editor** → `supabase-migration.sql` dosyasını çalıştır
3. **Settings > API** → URL ve anahtarları kopyala

### 3. Environment variables

```bash
cp .env.local.example .env.local
```

`.env.local` dosyasını düzenle:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### 4. İlk admin kullanıcıyı oluştur

Supabase Dashboard → Authentication → Users → **Add user**:
- E-posta: `admin@sirket.com`
- Şifre: güçlü bir şifre

Ardından SQL Editor'de:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'admin@sirket.com';
```

### 5. Geliştirme sunucusunu başlat

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresini aç.

---

## Proje yapısı

```
price-tracker/
├── app/
│   ├── auth/
│   │   └── login/          # Giriş sayfası
│   ├── (dashboard)/
│   │   ├── layout.tsx      # Sidebar + Header
│   │   ├── dashboard/      # Ana sayfa (istatistikler)
│   │   └── admin/
│   │       └── users/      # Kullanıcı yönetimi (admin only)
│   └── api/
│       ├── analyze/        # POST — fiyat analizi
│       └── users/          # GET/POST — kullanıcı yönetimi
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   └── admin/
│       └── UserTable.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts       # Browser Supabase client
│   │   └── server.ts       # Server Supabase client
│   ├── auth.ts             # Auth helper functions
│   ├── analyzer.ts         # Fiyat analiz motoru
│   └── validations.ts      # Zod schemas
├── types/
│   └── database.ts         # Supabase tablo tipleri
├── middleware.ts            # Auth koruması
└── supabase-migration.sql  # Veritabanı kurulum scripti
```

---

## Kullanıcı rolleri

| Yetki                     | Admin | User |
|---------------------------|-------|------|
| Giriş yapma               | ✓     | ✓    |
| Fiyat analizi             | ✓     | ✓    |
| Kendi ürünlerini yönetme  | ✓     | ✓    |
| Tüm kullanıcıları görme   | ✓     | ✗    |
| Kullanıcı oluşturma       | ✓     | ✗    |
| Kullanıcı aktif/pasif     | ✓     | ✗    |

---

## Sonraki adımlar

- [ ] Fiyat analizi sayfası (`/dashboard/analyze`)
- [ ] Ürün yönetimi sayfası (`/dashboard/products`)
- [ ] Raporlar sayfası (`/dashboard/reports`)
- [ ] Kullanıcı oluşturma formu (`/admin/users/new`)
- [ ] Gerçek scraping/API entegrasyonu (`lib/analyzer.ts`)
- [ ] E-posta bildirimleri (Supabase Edge Functions)
- [ ] Zamanlanmış analiz (cron job)
