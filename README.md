# DC Sürücü Kursu

Sürücü kursları için web tabanlı takip uygulaması. Tek şubeli kurslar da, merkez ve birçok şubesi olan kurslar da kullanır.
Bilgisayarda, tablette ve telefonda çalışır; telefonun ana ekranına uygulama gibi eklenebilir.

Birçok kurs firmasına satılacak ürün olarak kurgulandı: her kurs firmasının kaydı ayrı dosyada durur, bir firma
başka firmanın hiçbir bilgisini göremez.

## Neler var

| Bölüm | Kısaca |
|---|---|
| Girişler | Kurum kodu, sonra üç ayrı giriş: **Yetkili** (yönetici, şube müdürü), **Personel** (büro, muhasebe, eğitmen), **Öğrenci** |
| Şubeler | Merkez ve şubeler; merkez hepsini, şube müdürü ve personel yalnız kendi şubesini görür. Merkez eğitmeni geçici olarak başka şubeye görevlendirebilir |
| Yetkiler | 9 ayrı yetki (kayıt, kimlik bilgisi, evrak, tahsilat, kasa, ders, sınav, rapor, personel). Yetkisiz bilgi sunucudan hiç gönderilmez |
| Öğrenci | Kayıt, sınıf yükseltme, dönem, evrak yükleme ve eksik evrak listesi, sözleşme yazdırma, şubeler arası nakil |
| Direksiyon | Eğitmen takvimi, çakışma kontrolü, toplu planlama, sahadan "ders tamamlandı" (internet yoksa telefonda bekler), isteğe bağlı konum |
| Teorik | Dönemler, gruplar, derslik, ders programı ve yoklama; yoklama teorik ders sayısına işler |
| Sınav | E-sınav ve direksiyon sınavı, hak takibi, sınav günü listesi, sınav tekrar ücreti |
| Para | Paket ücret ve taksit, ek ders ve sınav tekrar ücreti, indirim, iade, makbuz, gider, firmalara borç (verecek), gün sonu kasa sayımı |
| İnternetten ödeme | Kurs kendi sanal POS bilgisini girerse öğrenci kendi ekranından kartla öder |
| Araçlar ve personel | Muayene, sigorta, kasko, bakım tarihleri ve kilometre; personel belgeleri ve izinler |
| Raporlar | Şube karşılaştırması ve şubeler toplamı, geciken alacak yaşları, eğitmen ders ve prim raporu, MEBBİS için Excel listeleri |
| Öğrenci ekranı | Ders ilerlemesi, boş saatten kendi dersini seçme, sınav sonuçları, taksitler, duyurular |
| Canlı akış | Sahada girilen kayıt merkezin ekranına anında düşer |
| Güvenlik | Hatalı girişte kilit, isteğe bağlı telefon doğrulama kodu ve kurtarma kodları, kayıt defteri |

Onaylanmış kararların tamamı: [docs/KARARLAR.md](docs/KARARLAR.md) · Kullanım rehberi: [docs/KULLANIM.md](docs/KULLANIM.md) · Bulut yayını: [docs/YAYIN.md](docs/YAYIN.md)

## Çalıştırma (bilgisayarda)

Node.js 22.13 veya üstü gerekir.

```
npm install
npm run build        # ekranı hazırlar (istemci/dist)
npm run demo         # örnek kurumla başlatır: http://localhost:8080
```

Örnek kurumda (bütün veriler uydurmadır):

| Giriş | Kullanıcı | Şifre |
|---|---|---|
| Kurum kodu | `ornek` | |
| Yetkili (merkez) | `patron` | `Deneme123!` |
| Yetkili (Çankaya şube müdürü) | `mudur` | `Deneme123!` |
| Personel | `buro`, `muhasebe`, `egitmen1`, `egitmen2` | `Deneme123!` |
| Öğrenci | T.C. `10000000146` | `ogrenci1` |
| DC platform yönetimi (`/platform`) | `dc` | `Deneme123!` |

Gerçek kullanım için örneksiz başlatma: `npm start`. İlk platform yöneticisi `http://localhost:8080/platform`
adresinden (yalnız sunucunun kendi bilgisayarından) ya da `PLATFORM_KULLANICI` / `PLATFORM_SIFRE` ortam değişkenleriyle oluşur.

## Doğrulama

```
npm test             # 30 sunucu testi
npm run denetle      # ekran tür denetimi
```

Bulut sürümünü yayın yapmadan bu bilgisayarda denemek için:

```
npx wrangler dev --local --port 8787
TEST_ADRES=http://127.0.0.1:8787 node --test test/sunucu.test.mjs
```

## Klasörler

| Yer | Ne var |
|---|---|
| `server/firma.mjs` | Bir kurs firmasının motoru: giriş, yetki, kapsam, işlem çalıştırma, canlı akış |
| `server/moduller/*.mjs` | İş kuralları bölüm bölüm: temel (şube, personel, araç, ayar), öğrenci, para, ders, dönem, sınav, evrak, duyuru, rapor, güvenlik, pos |
| `server/platform-cekirdek.mjs` | Firma listesi, lisans, DC platform yönetimi |
| `server/platform.mjs` · `server/index.mjs` | Bilgisayarda çalışan sunucu |
| `cloudflare/worker.mjs` · `wrangler.toml` | Bulut sürümü (aynı iş kuralları) |
| `istemci/` | Ekran (React) |
| `test/` | Testler |
