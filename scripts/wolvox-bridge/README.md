# Fiyatlaa WOLVOX 26 Salt-Okunur Bağlantı Testi

Bu araç mağazadaki WOLVOX bilgisayarında çalıştırılır. İlk aşamada yalnızca bağlantıyı,
yetkili şirketleri ve çalışma yıllarını okur. XML yazma (`xmlpost`) komutları istemcide
izinli değildir.

## 1. Port testi

WOLVOX Kontrol Paneli açıkken proje klasöründe:

```powershell
npm run wolvox:probe
```

Beklenen sonuç:

```text
OK: WOLVOX Kontrol Paneli 127.0.0.1:3056 adresinde bağlantı kabul ediyor.
```

Port kapalıysa Kontrol Paneli içindeki Güncelleme Portu kontrol edilmelidir. Resmi
WOLVOX 26 SDK dokümanındaki varsayılan port 3056'dır.

## 2. Salt-okunur şirket keşfi

Node.js kurulumu gerektirmeyen PowerShell sürümü:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\discover.ps1
```

Node.js kuruluysa aynı test şu komutla da çalıştırılabilir:

```powershell
npm run wolvox:discover
```

Komut WOLVOX kullanıcı adı/parolası ile AKINSOFT geliştirici kodu/parolasını
etkileşimli olarak sorar. Parolalar ekranda görünmez, diske veya loga yazılmaz.

Başarılı sonuçta şirket/çalışma yılı XML'i Windows geçici klasörüne yazılır. Bu dosya
ürün içe aktarımı yapmaz ve WOLVOX verisini değiştirmez.

## 3. Salt-okunur stok listesi

Şirket keşfi ile `001 / EFEKIRTASIYE / 2024` doğrulandıktan sonra mağazadaki
WOLVOX bilgisayarında:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\export-stock.ps1
```

Betik yalnızca belgelenmiş `get_stoklist` komutunu çağırır. Başarılı sonuç
`%TEMP%\fiyatlaa-wolvox` altında `stock-list-001-2024-*.xml` olarak saklanır.
Bu aşama Fiyatlaa staging alanına veya WOLVOX'a veri yazmaz.

Node.js kuruluysa aynı salt-okunur işlem:

```powershell
npm run wolvox:stock
```

Stok miktarlarını okumadan önce tanımlı depoları doğrulamak için:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\export-depots.ps1
```

Bu betik yalnızca `get_depolist` çağrısı yapar ve sonucu geçici klasöre
`depot-list-001-2024-*.xml` adıyla yazar.

İki aktif depo doğrulandıktan sonra miktar ve ağırlıklı ortalama maliyeti
salt-okunur olarak almak için:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\export-inventory.ps1
```

Betik AKINSOFT'un resmî Delphi örneğindeki `get_depoenvanter`,
`envHesabi=TL` ve `maliyetTipi=7` parametrelerini kullanır.

## Güvenlik

- Port 3056 modemden internete açılmamalıdır.
- Geliştirici ve WOLVOX parolaları Fiyatlaa bulutuna gönderilmemelidir.
- Parola içeren ekran görüntüsü paylaşılmamalıdır.
- İlk bağlantı yalnızca `127.0.0.1` üzerinden kabul edilir.
- Fiyat, stok, cari, fatura veya ürün yazma komutu yoktur.

## 4. İşlem verisi keşif paketi

Mağaza bilgisayarına erişim olduğunda bir günlük salt-okunur işletme
örneklerini almak için:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\export-business-samples.ps1 -SampleDate "2026-07-22"
```

Bu paket `get_faturaanalizi`, `get_gunsonuraporu1` ve `get_stokenvanter`
komutlarını kullanır. XML yazma komutu içermez. Çıktı paylaşılmadan önce alan
ve doluluk özeti oluşturulmalıdır:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\summarize-report.ps1 -InputPath "C:\path\report.xml"
```

Ayrıntılı keşif ve doğrulama planı:
`docs/WOLVOX_BUSINESS_INTELLIGENCE.md`

## 5. Hareket verisini güvenli biçimde doğrulama ve gönderme

İlk kullanımda `-Upload` yazılmaz. Betik XML'i akış halinde doğrular, WOLVOX'a ve
Fiyatlaa'ya veri yazmaz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\sync-business-data.ps1 `
  -InventoryPath "C:\path\depot-inventory.xml" `
  -FinancialPath "C:\path\invoice-analysis.xml" `
  -SummaryDate "2026-07-22" `
  -ConnectionId "00000000-0000-0000-0000-000000000000"
```

Üretim endpoint'i, en az 24 karakterlik köprü parolası ve bağlantı kimliği
doğrulandıktan sonra aynı komuta açıkça `-Upload` eklenir. Uzak endpoint'lerde HTTPS
zorunludur. Parola etkileşimli sorulur; komut satırına, dosyaya veya loga yazılmaz.
WOLVOX tarafındaki bütün işlemler salt okunurdur.
