# Bulut yayını (deneme)

Bu adımlar **yalnız Emrullah KARA'nın onayıyla** uygulanır. Uygulama şu ana kadar hiçbir buluta yüklenmedi.

Bulut adı bilerek `dc-surucu-kursu-deneme` yapıldı. Mağaza Takip'in canlı sürümüyle hiçbir ortak kaynağı yoktur;
ayrı bir Cloudflare Worker ve ayrı Durable Object kayıtları oluşur.

## Hazırlık

1. Cloudflare hesabına girin (Workers Paid planı gerekir; Durable Object SQLite için).
2. Bilgisayarda depo klasöründe:

```
npm install
npm run build
npx wrangler login
```

## Yayın

```
npx wrangler deploy
```

Komut, `https://dc-surucu-kursu-deneme.<hesap-adı>.workers.dev` adresini verir.

- `wrangler.toml` içinde `ENABLE_DEMO = "1"` olduğu için örnek kurum (`ornek`) ve DC platform girişi (`dc` / `Deneme123!`) otomatik oluşur.
- **Gerçek kurslar kullanmaya başlamadan önce:**
  1. `wrangler.toml` içinde `ENABLE_DEMO = "0"` yapın.
  2. Platform yöneticisini gizli değişkenle oluşturun:
     ```
     npx wrangler secret put PLATFORM_KULLANICI
     npx wrangler secret put PLATFORM_SIFRE
     ```
  3. Tekrar `npx wrangler deploy`.

## Bilinmesi gerekenler

| Konu | Durum |
|---|---|
| Evrak dosyaları | Firmanın kendi kaydında saklanır (en fazla 2,5 MB). Çok sayıda evrak yüklenecekse ileride Cloudflare R2'ye taşınması önerilir |
| Canlı akış | Açık her ekran, firmanın kaydını çalışır durumda tutar. Çok kullanıcılı gerçek kullanımda WebSocket'e geçmek maliyeti düşürür |
| PayTR | Gerçek bir PayTR hesabıyla denenmedi. PayTR panelinde bildirim adresi olarak `https://<adres>/api/pos-bildirim/<kurum kodu>/paytr` yazılmalı ve önce test modunda denenmelidir |
| Saat | Bütün tarih ve saatler Türkiye saatine göre hesaplanır; bulutun saat dilimi sonucu değiştirmez |
