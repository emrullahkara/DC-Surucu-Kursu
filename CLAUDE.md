# DC Sürücü Kursu · çalışma notları

Sürücü kursları için çok firmalı, çok şubeli takip uygulaması. Sahibi: Emrullah KARA.
Onaylanan kararlar: `docs/KARARLAR.md` (yeni karar gerekirse oraya yazılır, tahminle iş yapılmaz).

## Değişmez sınırlar

1. **Canlıya yayın yok.** `wrangler deploy` yalnız Emrullah KARA'nın onayıyla (bkz. `docs/YAYIN.md`). Deneme yerelde: `npm run demo`, `npx wrangler dev --local`.
2. **Gerçek kişi verisi yok.** Deneme verisi uydurmadır (`server/ornek.mjs`).
3. **Geriye uyum:** kayıt biçimi bozulmaz, alan silinmez. Yeni sütun `sutunEkle` ile eklenir.
4. Her iş ayrı kayıt olarak `gelistirme` dalında; `main` dalına birleştirme Emrullah KARA'nın onayıyla.
5. Emrullah KARA ile Türkçe ve işletme diliyle konuşulur; teknik jargon ve uzun tire kullanılmaz.

## Yapı

| Yer | Ne var |
|---|---|
| `server/firma.mjs` | Firma motoru: roller, yetkiler (`HAKLAR`, `etkinHaklar`), kapsam (şube), giriş, işlem çalıştırma (`calistir`), canlı akış, `istek()` |
| `server/moduller/*.mjs` | Her bölüm: `sema(db)`, `veri(c,k,v)`, `islemler`, `ogrenciIslemleri`, `ogrenciVeri`, `yol`, `ogrenciYol`, `acikYol`, `girisEkKontrol` |
| `server/platform-cekirdek.mjs` | Firma listesi, lisans, platform yönetimi (Node ve bulut ortak) |
| `server/platform.mjs` | Node HTTP sunucusu, statik dosyalar, SSE |
| `cloudflare/worker.mjs` | Bulut: PlatformDO + firma başına FirmaDO; aynı modüller |
| `istemci/src` | React ekranı. `eylemler.tsx` form pencereleri, `ekranlar/*` sayfalar |

## Kurallar

- **Tutarlar kuruştur** (tam sayı). Borç = paket + ek kalemler (indirim eksi) - (ödemeler - iadeler).
- **Tarih/saat Türkiye saatine göre** (`domain.mjs` `yerelZaman`, `bugun`). `getTimezoneOffset`/`getHours` kullanılmaz.
- **Yetkisiz bilgi sunucudan hiç gönderilmez** (`veri()` içinde süzülür). Ekranda gizlemek yetmez.
- Her işlem `calistir` içinde tek veritabanı işlemidir; `istekNo` aynı isteğin iki kez yazılmasını önler (internetsiz sıra).
- Yeni tablo: ilgili modülün `sema` işlevine `CREATE TABLE IF NOT EXISTS`. Yeni sütun: `sutunEkle`. Modüller `node:sqlite`, `node:fs` kullanmaz (bulutta çalışmalı).
- Yeni modül `server/firma.mjs` içindeki `MODULLER` listesine eklenir. Sıra önemlidir: `veri` işlevi öncekilerin doldurduğu alanları kullanabilir (ör. `v.ogrenciler`).
- Pencere (form) ekran bağlamının dışında çizilir; pencere içeriğinde `useY()` kullanılmaz, gerekenler dışarıdan verilir.

## Doğrulama

```
npm test                 # sunucu testleri (TEST_ADRES=http://127.0.0.1:8787 ile bulut sürümüne karşı da)
npm run denetle          # tsc
npm run build            # ekran
```

Her değişiklikte test yazılır; ekranda (Playwright ile) denenir.
