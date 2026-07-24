# Fiyatlaa Scraping Güvenilirliği Sprint Handoff

**Tarih:** 23 Temmuz 2026
**Durum:** Uygulandı; yerel canary, test, tip ve production build doğrulaması geçti
**Öncelik:** WOLVOX ürünleri için geniş ölçekli fiyat taramasından önce tamamlanmalı
**Kapsam:** Ürün kimliği, arama stratejisi, pazaryeri eşleştirme, piyasa fiyatı hesabı, istek yönetimi, gözlemlenebilirlik ve fiyat güvenliği

## 1. Sprint amacı

WOLVOX'tan alınan gerçek ürün kataloğunu mümkün olduğunca az istekle, yanlış ürünü fiyat hesabına katmadan ve her kararın nedenini açıklayabilecek şekilde takip etmek.

Sprint sonunda Fiyatlaa:

- önce gerçek barkodla arama yapmalı,
- barkod sonucu yoksa kontrollü şekilde marka/model ve ürün adına geri dönmeli,
- her pazaryerinden en fazla bir güvenilir teklif kullanmalı,
- stok dışı veya varyantı uyuşmayan teklifleri piyasa hesabına katmamalı,
- teknik hata ile gerçek "ürün bulunamadı" durumunu ayırmalı,
- düşük güvenli veriden otomatik fiyat önerisi üretmemeli,
- sağlayıcılara kontrollü yoğunlukta istek göndermeli,
- doğrulanan ürün URL'lerini sonraki taramalarda doğrudan izlemelidir.

Bu sprintin başarı ölçütü daha fazla sonuç bulmak değil, **doğru ve bağımsız piyasa verisi üretmektir**.

## Uygulama özeti — 24 Temmuz 2026

Tamamlanan korumalar:

- Gerçek `products.barcode` alanını önceleyen GTIN doğrulamalı arama zinciri.
- Barkod bulunamazsa marka + ürün adı ve temiz ürün adı fallback'i.
- Paket/varyant/ayırt edici model uyuşmazlıklarını reddeden eşleştirme kapısı.
- Stok dışı tekliflerin elenmesi ve pazaryeri başına en fazla bir bağımsız teklif.
- ScraperAPI ve Apify için ayrı, süreç içi sıralı sağlayıcı kuyrukları.
- ScraperAPI kota devre kesicisi ve Apify actor timeout sınıflandırması.
- Vercel instance'ları arasında aynı ürünün eşzamanlı taranmasını engelleyen süreli veritabanı lease'i.
- `success`, `insufficient_sources`, `no_match`, `no_results`, `timeout`,
  `provider_failure` ve `parser_failure` sonuç modeli.
- Sonuca göre retry aralığı; yanlış eşleşmede 7 gün, sağlayıcı/timeout hatasında 6 saat.
- Başarısız denemelerde son başarılı piyasa analizinin korunması.
- Tekrarlanan yüksek/kesin eşleşmeleri doğrulanan ürün URL belleğine dönüştüren kaynak hafızası.
- Ham sonuç, eşleşen sonuç ve kabul edilen sonuç sayılarını ayıran platform sağlığı.
- MAD aykırı değer filtresi ve fiyat kararında medyan piyasa referansı.
- Fiyat önerisinde sunucu tarafı `%10` değişim sınırı ve ikinci kullanıcı onayı.
- WOLVOX kategori alanına barkod/SKU sızmasını önleyen veri kalite kapısı.
- Yerel, kimlik doğrulamalı, yazmasız ve en fazla 20 ürünle sınırlı canary aracı.
- Gerçek canary hatalarından üretilen eşleşme fixture'ları ve regresyon testleri.
- Düşük güvenli adayları fiyat hesabından ayırıp son başarılı analizi bozmadan manuel incelemeye taşıyan ürün bazlı aday belleği.

Deploy öncesi uygulanması gereken dört idempotent migration:

1. `supabase-source-memory-migration.sql`
2. `supabase-scrape-job-leases-migration.sql`
3. `supabase-wolvox-data-quality-migration.sql`
4. `supabase-scraping-review-candidates-migration.sql`

Bu sprintte production deploy veya büyük katalog taraması yapılmaz.

Son kontrollü canary sonucu:

- ürün: `2` (sıralı, aynı anda tek ürün),
- sağlayıcı çağrısı: `16`,
- süre: `175,1 sn`,
- otomatik kabul edilen kaynak: `0`,
- manuel incelemeye ayrılan düşük güvenli aday: `1`,
- veri yazımı: `0`.

Canary, daha önce yanlış fiyat kaynağı olarak görülen Kuromi kitap paketini yalnızca
manuel aday olarak ayırdı; beslenme çantası yerine sırt çantası sonucunu tamamen reddetti.

## 2. Değiştirilemez ürün kararları

- WOLVOX ana stok ve katalog kaynağıdır.
- Fiyatlaa fiyat önerir; kullanıcı onaylarsa fiyat daha sonra WOLVOX'a yazılır.
- Fiziksel mağaza ve e-ticaret fiyatları ayrı tutulabilir.
- İnternet stoğu kırtasiye stoğundan beslenecek; güvenlik stoğu daha sonraki entegrasyon aşamasında uygulanacaktır.
- Otomatik analiz için başlangıç eşiği `150 TL` olacaktır.
- Varsayılan periyodik yenileme `15 gün` olacaktır.
- Eşik altındaki ürünler manuel istisna ile takibe alınabilir.
- Önerilen fiyat mevcut fiyattan tek işlemde `%10` üzerinde farklıysa ek onay gerekir.
- Düşük güvenli eşleşme fiyat hesabına otomatik olarak katılmaz.
- Pazaryeri entegrasyonu bu sprintin kapsamı değildir; burada yalnızca fiyat istihbaratı sağlamlaştırılır.

## 3. Mevcut sistemin özeti

Ana akış:

1. Ürün `lib/analyzer.ts` tarafından alınır.
2. `lib/product-identity.ts` arama sorgusunu seçer.
3. ScraperAPI platformları tek sağlayıcı kuyruğunda sıralı; Apify ise ayrı ve yine sıralı bir kuyrukta çağrılır.
4. Platform scraper'ları teklifleri ortak `ScrapedPrice` biçimine dönüştürür.
5. Ürün adı eşleşmesi, kaynak seçimi ve aykırı değer filtresi uygulanır.
6. Piyasa ortalaması, durum, güven ve öneri üretilir.
7. Manuel veya cron analizi sonucu Supabase'e yazılır.

Mevcut sağlayıcı kullanımı:

- Trendyol: Apify Actor
- Hepsiburada, N11, PTTAvm ve İdefix: ScraperAPI üzerinden sayfa/veri okuma
- Cron: saatte en fazla 20 ürün seçer; uygulama seviyesindeki sağlayıcı kuyrukları aynı hesaba üst üste istek göndermez.
- Ürün bazlı dağıtık lease, ayrı Vercel instance'larının aynı ürünü eşzamanlı taramasını engeller.

## 4. Üretim verisinde doğrulanan kritik bulgu

WOLVOX geçişi sonrasındaki takip edilebilir katalog özeti:

| Ölçüm | Adet |
| --- | ---: |
| Takibe uygun ürün | 3.022 |
| Geçerli `barcode` alanı bulunan | 2.972 |
| Mevcut akışta SKU üzerinden GTIN olarak kullanılan | 493 |
| Geçerli barkodu olduğu hâlde isimle aranan | 2.479 |
| Barkodu eksik veya geçersiz | 50 |

Mevcut `chooseProductSearchQuery(sku, product_name)` çağrısı ürünün gerçek `barcode` alanını almıyor. Bu nedenle takibe uygun ürünlerin yaklaşık `%82`si geçerli barkodu bulunmasına rağmen ürün adıyla aranıyor.

Bu hata giderilmeden geniş cron taraması yapılmamalıdır.

## 5. Hedef arama ve eşleştirme zinciri

### Aşama 1 — Barkod araması

Arama girdisi:

- öncelikle `products.barcode`,
- `barcode` geçerli GTIN değilse ve `sku` geçerli GTIN ise `sku`.

Kurallar:

- GTIN-8, GTIN-12, GTIN-13 ve GTIN-14 kontrol basamağı doğrulanır.
- Barkod yalnızca rakamlardan oluşan normalize edilmiş değerle aranır.
- Arama sonucu barkod veya güvenilir harici ürün kimliği taşıyorsa doğrulanır.
- Barkodla gelen sonuç otomatik olarak kabul edilmez; paket, varyant ve ürün tipi çelişkisi varsa reddedilir.
- Başarılı sonuç `exact` veya eş değer yüksek güven sınıfına girer.

### Aşama 2 — Marka ve model/üretici kodu araması

Barkodla kabul edilebilir sonuç bulunamazsa:

- `brand`,
- üretici/model kodu,
- ayırt edici varyant bilgileri

birlikte aranır.

WOLVOX `sku` değeri iç stok koduysa marka/model eşleşmesi gibi değerlendirilmez. Üretici kodu olup olmadığı veri sözleşmesinde açıkça belirtilmelidir.

### Aşama 3 — Temizlenmiş ürün adı araması

Marka/model sorgusu sonuç vermezse ürün adı normalize edilir.

Korunacak kimlik unsurları:

- marka,
- model/seri,
- paket adedi,
- hacim veya ağırlık,
- ölçü,
- renk veya varyant,
- yaş grubu,
- ürün tipi.

Temizlenebilecek unsurlar:

- satış sloganları,
- gereksiz noktalama,
- tekrar eden marka/ürün kelimeleri,
- yalnızca WOLVOX iç kullanımına ait kodlar.

### Aşama 4 — Daraltılmış isim sorgusu

Tam ad sorgusu sonuç vermiyorsa kontrollü biçimde daha kısa sorgu denenir. Bu aşamada:

- kabul eşiği yükseltilir,
- ürün tipi ve varyant uyuşması zorunlu tutulur,
- düşük güvenli sonuçlar yalnızca kullanıcıya aday olarak gösterilir,
- otomatik fiyat hesabına veri verilmez.

### Aşama 5 — Sonuç bulunamadı

Hiçbir güvenilir eşleşme bulunamazsa:

- durum `no_match` olur,
- eski başarılı analiz ve fiyat korunur,
- ürün teknik hata kuyruğuna girmez,
- altı saatlik hızlı teknik tekrar yapılmaz,
- 15 günlük normal yenilemede tekrar aranabilir,
- kullanıcı `Şimdi analiz et` ile manuel tekrar başlatabilir,
- kullanıcı doğrulanmış bir ürün URL'sini elle ekleyebilir.

## 6. Eşleşme güven seviyeleri

| Seviye | Asgari koşul | Otomatik piyasa hesabı |
| --- | --- | --- |
| Kesin | Geçerli barkod veya doğrulanmış platform ürün kimliği; varyant çelişkisi yok | Evet |
| Yüksek | Marka + model + ürün tipi + paket/varyant uyumu | Evet |
| Orta | Güçlü başlık eşleşmesi ve ölçü/paket uyumu; kritik çelişki yok | Yalnızca sistem ayarı izin verirse |
| Düşük | Benzer isim, eksik kimlik veya şüpheli varyant | Hayır |
| Reddedildi | Yanlış ürün, yanlış paket/varyant veya manuel ret | Hayır |

Manuel karar önceliği tüm otomatik puanlardan üstündür:

1. Manuel onay
2. Manuel ret
3. Barkod/platform ürün kimliği
4. Marka + model + varyant
5. Başlık eşleşme skoru
6. Stok durumu
7. Fiyat yalnızca son eşitlik bozucu

En ucuz teklif, tek başına en iyi eşleşme kabul edilmez.

## 7. Sprint iş paketleri

### P0.1 — Gerçek barkodu analiz hattına bağla

Uygulama:

- Analiz ürün tipine `barcode` alanını ekle.
- Manuel analiz, toplu analiz ve cron sorgularının `barcode` seçtiğini doğrula.
- `chooseProductSearchQuery` barkod, SKU ve ürün adı bilgilerini ayrı ayrı almalı.
- Kullanılan arama stratejisi analiz kaydında gözlemlenebilir olmalı.

Kabul kriterleri:

- Geçerli `products.barcode` varsa ilk sorgu barkoddur.
- Barkod geçersizse geçerli GTIN biçimindeki SKU kullanılabilir.
- İkisi de geçersizse marka/model veya ürün adı zincirine geçilir.
- Barkod bulunamadığında ürün doğrudan başarısız sayılmaz.
- Barkod ve isim sorguları aynı analizde tekrar eden sağlayıcı çağrıları üretmez.

### P0.2 — Platform başına tek bağımsız kaynak

Uygulama:

- `site + confidence` yerine platform başına tek kazanan teklif seç.
- `minSources`, satır sayısını değil benzersiz pazaryeri sayısını ölçsün.
- Bir platformdaki çok sayıda ilan piyasa ortalamasında o platforma ek ağırlık vermesin.

Kabul kriterleri:

- Trendyol'dan iki ilan, iki kaynak sayılmaz.
- Minimum iki kaynak ayarında en az iki farklı platform gerekir.
- Kaynak sayısı, piyasa hesabına gerçekten giren benzersiz platform sayısıdır.

### P0.3 — En iyi teklif seçimi ve stok filtresi

Uygulama:

- Her platformda en yüksek kimlik/eşleşme kalitesine sahip teklif seçilir.
- `inStock === false` teklifler piyasa hesabından çıkarılır.
- Fiyat yalnızca aynı güven ve kimlik düzeyindeki tekliflerde eşitlik bozucu olabilir.
- PTTAvm ve İdefix fiyatlarında kuruşlar korunur; gereksiz `Math.round` kaldırılır.

Kabul kriterleri:

- Stok dışı fiyat ortalamaya katılmaz.
- Yanlış varyant daha ucuz olduğu için seçilemez.
- Decimal fiyatlar kayıpsız saklanır.

### P0.4 — Sonuç durumlarını ayır

Standart durumlar:

- `success`
- `provider_failure`
- `timeout`
- `parser_failure`
- `no_results`
- `no_match`
- `out_of_stock`
- `insufficient_sources`

Kabul kriterleri:

- Yalnızca geçici teknik durumlar hızlı retry alır.
- `no_match` ve `no_results` altı saatte bir tekrar edilmez.
- Son başarılı analiz hiçbir başarısız denemede silinmez.
- Kullanıcı son başarılı analiz ile son deneme durumunu ayrı görebilir.

### P0.5 — Fiyat önerisi kalite kapısı

Fiyat önerisi yalnızca şu koşullarda üretilebilir:

- analiz durumu `success`,
- benzersiz güvenilir platform sayısı kullanıcı minimumuna eşit veya büyük,
- analiz yeterince güncel,
- güven skoru belirlenen eşikten yüksek,
- kullanılan teklifler stokta,
- aykırı değer kontrolleri geçmiş.

Ek güvenlik:

- `%10` üzerindeki tek seferlik değişiklik ek onay gerektirir.
- Bu sınır yalnızca arayüzde değil sunucu/RPC katmanında uygulanır.
- `insufficient_data` veya benzeri kayıtların `market_mean` değeri fiyat önerisine sızamaz.

### P0.6 — Kontrollü istek yürütme

Uygulama:

- Global ve platform bazlı eşzamanlılık sınırı ekle.
- Aynı ürünü aynı platformda eşzamanlı analiz etmeyi engelle.
- Zaman aşımı gerçek `AbortController` veya sağlayıcıya uygun iptal mekanizmasıyla isteği durdursun.
- Retry yalnızca geçici hata kodlarında, jitter'lı exponential backoff ile çalışsın.
- Kullanıcı tarafından tetiklenen analiz kontrollü biçimde önceliklendirilsin.

Başlangıç için güvenli öneri:

- toplam dış istek eşzamanlılığı: `3–5`,
- aynı platform eşzamanlılığı: `1–2`,
- aynı ürün/platform için tek aktif iş,
- `429` veya blok sinyalinde platform devre kesicisi,
- cron ürün paralelliği, iç platform paralelliğinden bağımsız yönetilsin.

Kesin değerler Apify/ScraperAPI maliyet ve süre ölçümüyle belirlenecektir.

### P1.1 — Doğrulanmış URL ve ürün kimliği belleği

Başarılı veya manuel onaylanmış eşleşmede saklanacaklar:

- platform,
- canonical ürün URL'si,
- platform ürün kimliği,
- varsa barkod,
- son doğrulama tarihi,
- eşleşme güveni,
- manuel karar bilgisi.

Sonraki tarama:

1. Önce doğrulanmış ürün sayfasını doğrudan kontrol eder.
2. Sayfa kaybolmuş veya kimliği değişmişse discovery aramasına döner.
3. Böylece her 15 günde bir arama sonuç sayfası taranmaz.

### P1.2 — Dayanıklı piyasa fiyatı hesabı

Uygulama:

- platform başına tek fiyat,
- aritmetik ortalama yerine ağırlıklı medyan veya güven ağırlıklı dayanıklı merkez,
- hem düşük hem yüksek yönde simetrik aykırı değer kontrolü,
- az kaynakta özel koruma,
- min/maks/ortalama ve kaynak sayısının aynı filtrelenmiş kümeden hesaplanması.

Yanlış eşleşme örneği:

- bizim fiyatımız `100 TL`,
- yanlış ürün piyasa sonucu `1.000 TL`.

Bu durum yalnızca mevcut fiyata göre fark hesabına güvenilerek fiyat artışı önerememelidir.

### P1.3 — Parser sözleşmeleri ve fixture testleri

Her platform için anonimleştirilmiş gerçek örnekler:

- başarılı arama,
- sonuç yok,
- stok dışı,
- kampanyalı fiyat,
- varyantlı ürün,
- sayfa/şema değişikliği.

Test yaklaşımı:

- HTML/JSON fixture dosyası,
- beklenen ürün kimliği, başlık, fiyat, stok ve URL,
- parser boş döndüğünde bunun hangi nedenle olduğu,
- Actor/endpoint çıktı şeması için runtime doğrulama.

### P1.4 — Aşamalı platform sağlığı

Platform sağlığı yalnızca "scraper veri döndürdü" olarak ölçülmemelidir.

Ölçümler:

- sağlayıcı erişimi başarılı,
- HTTP/Actor işi başarılı,
- parser kayıt sayısı,
- eşleşen kayıt sayısı,
- kabul edilen kayıt sayısı,
- ortalama süre,
- timeout oranı,
- kredi/işlem tahmini,
- `no_match` oranı,
- son başarılı fixture/canary testi.

## 8. ScraperAPI ve Apify değerlendirmesi

Hazır scraper/Actor seçimi doğrudan üretime alınmayacaktır. Her aday aynı doğrulama setinde karşılaştırılmalıdır.

Karşılaştırma matrisi:

| Ölçüt | Açıklama |
| --- | --- |
| Doğru ürün oranı | Barkod/model/varyant bakımından gerçek eşleşme |
| Fiyat doğruluğu | Görünen güncel satış fiyatıyla uyum |
| Stok doğruluğu | Stokta/stok dışı bilgisinin doğruluğu |
| Canonical URL | Sonraki doğrudan izlemeye uygun ürün URL'si |
| Şema kararlılığı | Çıktı alanlarının değişime dayanıklılığı |
| Ortalama süre | Tek ürün ve toplu tarama süresi |
| Başarı oranı | Timeout, boş sonuç ve blok oranı |
| Maliyet | Başarılı ve güvenilir sonuç başına gerçek maliyet |
| Yük davranışı | Rate limit, retry ve Actor başlatma yükü |

Test seti en az şunları içermelidir:

- 10 barkodla kolay bulunan ürün,
- 10 yalnızca marka/modelle bulunan ürün,
- 10 varyant/paket riski yüksek ürün,
- 10 düşük fiyatlı ama manuel takibe alınmış ürün,
- 10 pazaryerlerinde bulunmayan ürün.

Bir sağlayıcı çok sonuç döndürdüğü için değil, **güvenilir kabul edilen sonuç başına daha iyi maliyet** sağladığı için seçilmelidir.

## 9. Veri modeli önerisi

Uygulama sırasında mevcut şemaya uyarlanmak üzere aşağıdaki kavramlar gereklidir:

### Ürün-platform eşleşmesi

- `product_id`
- `platform`
- `canonical_url`
- `external_product_id`
- `matched_barcode`
- `match_confidence`
- `match_method`
- `decision`
- `verified_at`
- `last_seen_at`

### Analiz denemesi

- `product_id`
- `platform`
- `search_strategy`
- `query_hash`
- `status`
- `provider_duration_ms`
- `result_count`
- `matched_count`
- `accepted_count`
- `error_code`
- `attempted_at`

### Kabul edilen teklif

- `analysis_id`
- `platform`
- `price`
- `original_price`
- `in_stock`
- `shipping`
- `seller`
- `match_score`
- `match_method`
- `canonical_url`

Migration yazılmadan önce mevcut `price_analyses`, `analysis_attempts` ve kaynak karar tablolarıyla çakışma analizi yapılmalıdır. Aynı bilgiyi farklı tablolarda gereksiz yere çoğaltmayın.

## 10. Test matrisi

Asgari otomatik testler:

### Ürün kimliği

- Geçerli barkod, geçerli SKU'dan önce seçilir.
- Geçersiz barkod, geçerli GTIN SKU'ya düşer.
- Her ikisi de geçersizse isim stratejisine geçer.
- Barkod bulunamazsa marka/model sorgusu çalışır.
- Paket, ölçü ve varyant çelişkisi barkod sonucunu reddedebilir.

### Kaynak bağımsızlığı

- Aynı platformun iki ilanı tek kaynak sayılır.
- İki farklı platform iki kaynak sayılır.
- Manuel onaylı teklif otomatik tekliften önce gelir.
- En ucuz fakat daha düşük eşleşmeli teklif seçilmez.

### Stok ve fiyat

- Stok dışı teklif hesaplanmaz.
- Kuruş bilgisi korunur.
- Filtrelenen teklifler min/maks ve kaynak sayısına girmez.
- Aşırı düşük ve aşırı yüksek sonuçlar simetrik korunur.

### Durum ve retry

- `timeout` retry alabilir.
- `provider_failure` geçici hatada retry alabilir.
- `no_match` hızlı retry almaz.
- `no_results` hızlı retry almaz.
- Başarısız deneme son başarılı analizi silmez.

### Fiyat güvenliği

- Yetersiz veri fiyat önerisi üretemez.
- Eski analiz fiyat önerisi üretemez.
- `%10` üzeri değişiklik ek onaysız uygulanamaz.
- Benzersiz platform minimumu sağlanmadan fiyat uygulanamaz.

### Parser fixture

- Her aktif platform için başarılı, boş, stok dışı ve şema bozuk fixture bulunur.
- Apify Actor çıktısı runtime şemasıyla doğrulanır.
- ScraperAPI HTML/JSON değişiklikleri testte görünür hata üretir; sessizce boş listeye dönüşmez.

## 11. Yayın ve doğrulama sırası

### Aşama A — Lokal

1. P0 kod değişikliklerini yap.
2. Tüm unit ve fixture testlerini çalıştır.
3. TypeScript/build kontrolünü çalıştır.
4. Gerçek sağlayıcı çağrısı olmadan parser fixture sonuçlarını doğrula.

### Aşama B — Kontrollü canary

1. Cron'u geniş katalog için çalıştırma.
2. Tek seferde en fazla 20 ürünlük doğrulama seti kullan.
3. Sonuçları gerçek pazaryeri sayfalarıyla elle karşılaştır.
4. Yanlış eşleşme, boş sonuç, süre ve kredi ölçümlerini kaydet.
5. Barkod, marka/model ve isim fallback başarı oranlarını ayrı raporla.

### Aşama C — Sınırlı üretim

1. Önce 150 TL üzerindeki 100 ürün.
2. En az bir tam 15 günlük çevrim izle.
3. Fiyat önerilerini yalnızca manuel onayla.
4. Platform bazlı hata/kredi limitleri aşılırsa devre kesiciyi doğrula.

### Aşama D — Kademeli genişleme

1. 500 ürün.
2. Tüm uygun WOLVOX kataloğu.
3. Doğrulanmış URL oranı yükseldikçe discovery arama maliyetini azalt.

Otomatik WOLVOX fiyat yazma bu sprintin sonunda açılmaz. Önce ölçülen eşleşme doğruluğu ve manuel onay geçmişi yeterli seviyeye gelmelidir.

## 12. Başarı ölçütleri

İlk hedefler:

- Barkodu bulunan uygun ürünlerde barkodla başlayan sorgu oranı: `%100`
- Piyasa hesabındaki benzersiz platform oranı: `%100`
- Stok dışı tekliflerin piyasa hesabına girme oranı: `%0`
- Düşük güvenli tekliflerin otomatik hesaba girme oranı: `%0`
- `no_match` ürünlerde altı saatlik gereksiz retry oranı: `%0`
- `%10` üzeri fiyat değişikliğinin ek onaysız uygulanma oranı: `%0`
- Her aktif platform için fixture kapsamı: başarılı + sonuç yok + stok dışı + bozuk şema

Canary setinde ayrıca ölçülecekler:

- kesin/yüksek eşleşme doğruluğu,
- kabul edilen sonuç başına kredi maliyeti,
- platform başına p50/p95 süre,
- barkoddan sonuca ulaşma oranı,
- isim fallback yanlış eşleşme oranı,
- doğrulanmış doğrudan URL kullanım oranı.

Hedef eşikler ilk canary çalışmasının taban değerleri görüldükten sonra sayısallaştırılacaktır. Ölçülmemiş bir doğruluk yüzdesi varsayılmamalıdır.

## 13. Kapsam dışı

- WOLVOX'a otomatik fiyat yazma
- E-ticaret XML feed'i ve stok senkronizasyonu
- Pazaryeri satıcı API entegrasyonları
- Satış/satın alma hareketlerinin BI raporları
- Yeni pazaryerlerini doğrudan üretime ekleme
- 150 TL altındaki tüm ürünleri otomatik tarama

Bu işler scraping güvenilirliği kanıtlandıktan sonra ayrı sprintler olarak ele alınacaktır.

## 14. Uygulamaya başlayacak geliştirici için ilk adımlar

1. `lib/analyzer.ts`, `lib/product-identity.ts` ve ürün API sorgularındaki ürün tiplerini birlikte incele.
2. Gerçek `barcode` alanını tüm analiz girişlerine taşı.
3. Önce ürün kimliği ve fallback zinciri testlerini yaz.
4. `lib/scrapers/index.ts` içindeki platform başına kaynak seçimini düzelt.
5. Stok filtresi ve benzersiz platform minimumunu uygula.
6. Durum modelini ve retry politikasını ayır.
7. Fiyat önerisi endpoint/RPC kalite kapısını ekle.
8. Gerçek abort ve platform kuyruklamasını uygula.
9. Parser fixture testlerini ekle.
10. Lokal doğrulamadan sonra kullanıcı onayıyla canary aşamasına geç.

## 15. Handoff güvenlik notları

- Repository içinde WOLVOX, AKINSOFT, Supabase, ScraperAPI veya Apify parolası/token'ı tutulmamalıdır.
- Gerçek sağlayıcı çağrıları test komutlarının varsayılan parçası olmamalıdır.
- Kullanıcının açık onayı olmadan commit, push veya deploy yapılmamalıdır.
- Mevcut kirli çalışma ağacındaki ilgisiz dosyalar değiştirilmemeli veya temizlenmemelidir.
- Büyük katalog taraması, barkod ve benzersiz kaynak P0 maddeleri tamamlanmadan başlatılmamalıdır.

## 16. 24 Temmuz 2026 isim araması ve canary sonucu

İsimden keşif, eşleşme kabul kurallarını gevşetmeden geliştirildi:

- Tam ürün adı sonuç vermediğinde marka/model/ürün tipini koruyan kısa kimlik
  sorgusu yalnızca sonuçsuz platformlarda çalışır.
- İlan doğrulaması kısa sorguyla değil, WOLVOX'taki tam ürün adıyla yapılır.
- Ayırt edici kimlik kelimelerinde en az `%60` kapsama ve birden fazla kimlik
  varsa en az iki eşleşme gerekir.
- Ayırt edici marka/model içermeyen genel ürün adları otomatik fiyat kaynağı
  olamaz; düşük güvenli manuel inceleme adayı olarak kalır.
- Matara, şişe, termos, çanta, puzzle gibi sabit varyantlı ürünlerde farklı
  ölçü/adet birim fiyat normalizasyonuyla birleştirilmez.

Yazmasız ilk canary:

- `20` ürün, `164` tahmini sağlayıcı çağrısı, `1786,4` saniye.
- `20/20` üründe ham ilan geldi.
- İlk kurallarla `16/20` üründe kaynak ve `14/20` üründe en az iki kaynak
  görünüyordu; manuel inceleme bunun güvenilir bir başarı oranı olmadığını
  gösterdi.
- Noel figürü/anime figürü, fiyonk/otomobil zincir seti, yılbaşı
  ağacı/taşıma çantası, kozalak süsü/farklı süs, ağaç kumbara/farklı tasarım
  ve `500 ml`/`400 ml` matara yanlış pozitifleri fixture'a dönüştürüldü.
- Sıkı kuralların kayıtlı adaylar üzerindeki tekrar değerlendirmesi
  `10/20` en az bir kaynak ve `8/20` en az iki kaynak gösterdi. Bu değer canlı
  ikinci tam tarama değil, aynı yakalanmış adayların deterministik replay
  sonucudur.

Hedefli canlı regresyon:

- `5` riskli ürün, `47` tahmini sağlayıcı çağrısı, `551,2` saniye.
- Yalnızca güçlü özellikleri uyuşan uzaktan kumandalı oyuncak için bir
  Trendyol kaynağı kabul edildi; tek kaynak olduğu için piyasa fiyatı
  hesaplanmadı.
- Noel figürü, fiyonk, yılbaşı ağacı ve farklı hacimli matara için otomatik
  kaynak sayısı `0` kaldı.
- Her iki canary turunda da veritabanı yazımı `0` oldu.

Sonraki ölçümde amaç kabul oranını gevşetmek değil; marka/model bilgisini
WOLVOX veya tedarikçi kaynağından zenginleştirerek genel ürünleri kimlikli
ürünlere dönüştürmektir.

## 17. 24 Temmuz 2026 model kodu keşfi ve güvenlik doğrulaması

WOLVOX kataloğundaki `MARKASI`, `URETICI_FIRMA` ve `MODELI` alanlarının mevcut
SDK çıktısında boş olduğu doğrulandı. Bu nedenle marka bilgisi tahmin edilerek
ürün kaydına yazılmadı.

Ürün adında bulunan üretici/model kodları için güvenli bir keşif katmanı eklendi:

- `HXJ10`, `CA-983`, `ALX-806` gibi harf-rakam kodları ürün adından çıkarılır.
- Barkod sorgusundan sonra, tam ad sorgusundan önce kısa bir model sorgusu
  çalıştırılır. Örnek: `Barbie HXJ10 Bebek`.
- Aday ilan yine WOLVOX'taki tam ürün adıyla doğrulanır.
- Tireli, bitişik ve boşluklu kod yazımları eşdeğerdir:
  `CA-983 = CA983`, `ALX-806 = ALX 806`.
- WOLVOX adında model kodu varsa aday ilanda aynı kod zorunludur. Farklı veya
  eksik kodlu ilan otomatik fiyat kaynağı olamaz.
- `No 16` gibi ölçü/numara ifadeleri model kodu sayılmaz.

Katalog ölçümü:

- Takibe uygun `3.023` WOLVOX ürününün `526` tanesinde model kodu bulundu.
- Bu katmanın doğrudan kapsaması `%17,4` oldu.
- Kod bulunmayan ürünlerde mevcut barkod, tam ad ve ayırt edici ad akışı
  değişmeden kalır.

Kontrollü, yazmasız model canary:

- `5` farklı ürün ve bir güvenlik düzeltmesi tekrar koşusu kullanıldı.
- Büyük katalog taraması yapılmadı; toplam tahmini sağlayıcı çağrısı `66`,
  veritabanı yazımı `0` oldu.
- `HXJ10` için üç, `HDJ36` için bir doğru model kaynağı kabul edildi.
- `CA-983` ve `BR-289` için güvenilir otomatik kaynak kabul edilmedi.
- İlk `ALX-806` koşusu `ALX 805` ve kodsuz iki ilanı yanlış kabul ederek bir
  regresyon ortaya çıkardı. Model kodu zorunluluğu eklendikten sonra kaydedilmiş
  üç adayın tamamı reddedildi.
- Aynı `ALX-806` ürünü canlı yeniden çalıştırıldığında sonuç `no_match`, kabul
  edilen kaynak `0`, yazım `0` oldu.

Doğrulama sonunda tüm testler, TypeScript kontrolü ve production build yeniden
çalıştırılmalıdır. Model kodu kuralı gevşetilmeden önce yeni fixture ve canary
kanıtı zorunludur.
