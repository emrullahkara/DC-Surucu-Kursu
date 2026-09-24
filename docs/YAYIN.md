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
  3. Hassas bilgileri (evrak, anahtarlar) şifreleyen anahtarı verin ve **ayrıca güvenli bir yerde saklayın**
     (kaybolursa şifreli evrak açılamaz; anahtar sonradan değiştirilmemelidir):
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     npx wrangler secret put VERI_ANAHTARI
     ```
  4. Tekrar `npx wrangler deploy`.

## Bilinmesi gerekenler

| Konu | Durum |
|---|---|
| Evrak dosyaları | Firmanın kendi kaydında saklanır (en fazla 2,5 MB). Çok sayıda evrak yüklenecekse ileride Cloudflare R2'ye taşınması önerilir |
| Canlı akış | Açık her ekran, firmanın kaydını çalışır durumda tutar. Çok kullanıcılı gerçek kullanımda WebSocket'e geçmek maliyeti düşürür |
| PayTR | Gerçek bir PayTR hesabıyla denenmedi. PayTR panelinde bildirim adresi olarak `https://<adres>/api/pos-bildirim/<kurum kodu>/paytr` yazılmalı ve önce test modunda denenmelidir |
| Saat | Bütün tarih ve saatler Türkiye saatine göre hesaplanır; bulutun saat dilimi sonucu değiştirmez |
| Yedek | Bulutta her firmanın kaydı son 30 gün içindeki herhangi bir ana geri döndürülebilir (DC Platform > Yedekler). Bu özellik yerel denemede çalışmaz |
| Hatırlatmalar | Her firma yarım saatte bir kendi zamanlanmış işini (hatırlatma, SMS) çalıştırır |
| SMS | Netgsm bağlantısı gerçek hesapla denenmedi; kurum Ayarlar > SMS > "Deneme SMS'i" ile kontrol etmeli |

## Bilgisayarda (kendi sunucusunda) çalıştırırken

| Ayar | Anlamı |
|---|---|
| `VERI_ANAHTARI` | Şifreleme anahtarı (64 haneli). Verilmezse veri klasöründe `veri-anahtari.txt` oluşturulur; bu dosya yedeklerle birlikte ayrıca saklanmalıdır |
| `YEDEK_GUNU` | Günlük yedeklerin kaç gün saklanacağı (varsayılan 30, 0 = kapalı). Yedekler `veri/yedekler/<kurum kodu>/` klasöründedir |
| `GUVENILIR_VEKIL=1` | Önünde nginx gibi bir vekil sunucu varsa kullanıcının adresi `X-Forwarded-For` başlığından okunur. Vekil yoksa açılmamalıdır |
| `SECURE_COOKIE=1` | HTTPS ile yayında çerez yalnız güvenli bağlantıda gönderilir |
