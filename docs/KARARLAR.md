# DC Sürücü Kursu · Kararlar

Emrullah KARA ile 2026-09-24 tarihinde ekrandan tek tek onaylanan kararlar. Çalışma bu kararlara göre yürür.
Burada olmayan bir konuda karar gerekirse en güvenli ve geri alınabilir seçenek uygulanır ve bu dosyanın
"Sonradan verilen kararlar" bölümüne gerekçesiyle yazılır.

## Ürün ve çalışma düzeni

| # | Konu | Karar |
|---|---|---|
| 1 | Ürün | **Birçok kurs firmasına satılacak ürün.** Her firma ayrı hesap ve lisansla çalışır, firmaların bilgileri birbirinden tamamen ayrıdır. |
| 2 | Yayın | Deneme yayını istenecek. Bulut hesabı ve anahtarı olmadığı için **yayına hazır hale getirilir, yayını Emrullah KARA döndüğünde yapar.** Ayrı deneme adı kullanılır, Mağaza Takip'in canlı sürümüne dokunulmaz. |
| 3 | Ekran | **React** (Mağaza Takip ile aynı yapı). |
| 4 | Düzen | Tek geliştirme dalı, her bölüm ayrı kayıt. Ana dala birleştirme Emrullah KARA'nın onayıyla olur. |

## İş kuralları

| # | Konu | Karar |
|---|---|---|
| 5 | Öğrenci | Şubeye aittir. Merkez hepsini görür, şubeler arası nakil yapılabilir. |
| 6 | Kasa | Her şubenin kendi kasası vardır, merkez toplamı görür. |
| 7 | Eğitmen | Normalde yalnız kendi şubesi. **Merkez geçici olarak başka şubeye görevlendirebilir.** |
| 8 | Ders ve sınav kuralları | Ders saatleri, sınav hakkı ve geçme puanı **yönetici ayarından değiştirilebilir.** Başlangıç: B için 34 teorik / 14 direksiyon, 4 sınav hakkı, e-sınav geçme 70. |
| 9 | Ücret | Paket ücret + ek kalemler (ek direksiyon dersi, sınav tekrar ücreti öğrencinin borcuna eklenir). |
| 10 | Eğitmen primi | Ders sayısı ve ders başı prim raporu. Maaş bordrosu yok. |
| 11 | Verecek | Giderler ve tedarikçi borçları (akaryakıt, servis, kira gibi) ile bunlara yapılan ödemeler. |
| 12 | Evrak | Dosya yükleme (fotoğraf, PDF) ve eksik evrak listesi. |
| 13 | Yazdırma | Kurum adı ve logosuyla kayıt sözleşmesi ve ödeme makbuzu. |
| 14 | Mesaj | Hazır mesajı WhatsApp'ta açan düğme. SMS altyapısı kurulur ama kapalıdır, firma bilgisi gelince açılır. |
| 15 | İnternetten ödeme | **İki seçenek de bulunur:** isteyen kurs firması kendi sanal POS bilgilerini girerek öğrencilerinden kartla ödeme alabilir; girmeyen firmada ödemeler yalnız kursta alınır. |
| 16 | MEBBİS | Otomatik aktarım yok. MEBBİS'e elle girilecek bilgiler Excel listesi olarak verilir. |
| 17 | Öğrenci girişi | T.C. kimlik no + şifre. Kurs ilk şifreyi verir, öğrenci ilk girişte kendi şifresini belirler. |
| 18 | Ek doğrulama | Yönetici için isteğe bağlı (Google/Microsoft Authenticator). |
| 19 | Konum | **Kurum ayarından açılabilir.** Açıksa ders kapanırken eğitmenin konumu kaydedilir. Varsayılan kapalı. |
| 20 | Ders isteği | **Öğrenci boş saatlerden kendisi seçer, ders doğrudan planlanır.** |
| 21 | Dönem | Aylık dönemler, teorik ders grupları, derslik ve yoklama. |
| 22 | Araç | Muayene, sigorta, kasko ve bakım tarihleri için uyarı. |
| 23 | Ad | Ürün adı **DC Sürücü Kursu.** Her kurs kendi adını ve logosunu ayrıca girer. Bütün deneme verileri uydurmadır. |

## Değişmez sınırlar

- Canlıya yayın yapılmaz, hiçbir bulut hesabına yükleme yapılmaz.
- Gerçek kişi verisi eklenmez. Deneme verisi uydurmadır.
- Yetkisiz bilgi sunucudan hiç gönderilmez; yalnız ekranda gizlemek yeterli sayılmaz.
- Tutarlar kuruş cinsinden tam sayıdır.

## Sonradan verilen kararlar

Çalışma sırasında onaylı kararlarda karşılığı olmayan durumlarda en güvenli ve geri alınabilir seçenek uygulandı.
Hepsi sonradan değiştirilebilir.

| # | Konu | Uygulanan | Neden |
|---|---|---|---|
| S1 | Firma açma | Kurs firmasını yalnız DC platform yönetimi (`/platform`) açar; kursların kendi kendine kaydolması yok | Satış ve lisans DC'nin elinde kalsın |
| S2 | Lisans | Lisans bitiş tarihi ve en fazla şube sayısı firma başına. Süre dolunca giriş kapanır, kayıtlar silinmez | Karar 1'in doğal sonucu |
| S3 | Muhasebe görevi | Büro ve eğitmene ek olarak "Muhasebe" görevi eklendi (tahsilat, kasa, rapor) | İlk mesajdaki "alacak verecek takibi" için |
| S4 | Ekran yapısı | React kullanıldı ama Mağaza Takip'teki tasarım kütüphaneleri (Tailwind, shadcn) yerine sade stil dosyası | Daha az bağımlılık, telefonda hızlı açılış. İstenirse sonradan geçilebilir |
| S5 | Öğrencinin ders seçmesi | Günde en fazla 2 ders; paket ders sayısı dolunca seçemez; dersten 24 saat öncesine kadar bırakabilir; saatler tam saat başı | Eğitmenin gününün boşa gitmemesi için |
| S6 | Sınav | E-sınavda puan girilirse sonuç geçme puanına göre kendiliğinden belirlenir; direksiyon sınavını geçen öğrencinin kaydı "Tamamlandı" olur | |
| S7 | Nakil | Nakledilen öğrencinin geçmiş ödeme, ders ve sınavları eski şubenin hesabında kalır; planlı dersleri iptal olur | Şubelerin cirosu ve emeği bozulmasın |
| S8 | Evrak | Dosya firmanın kendi kaydında saklanır, en fazla 2,5 MB; telefon fotoğrafları yüklemeden önce küçültülür | Bulut sürümünün kayıt sınırı |
| S9 | İnternetten ödeme | İlk sağlayıcı PayTR. "Deneme" sağlayıcısı yalnız örnek kurumda açılır. PayTR gerçek hesapla denenmedi | Gerçek hesap ve anahtar yok |
| S10 | Eğitmen izni | İzinli eğitmene ders planlanamaz, öğrenci de o gün saat seçemez | |
| S11 | Saat | Bütün tarih ve saatler Türkiye saatine göre hesaplanır | Bulut sunucusu UTC çalışır |
| S12 | Ders sayıları | B için 34 teorik / 14 direksiyon gibi başlangıç değerleri yaygın uygulamaya göre girildi; mevzuata göre kontrol edilmeli (Ayarlar'dan değişir) | |
| S13 | Sözleşme metni | Örnek bir metin konuldu; hukuki uygunluğunu kurum kontrol etmeli ve kendi metnini yazmalı | |
