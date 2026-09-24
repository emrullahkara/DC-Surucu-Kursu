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

## İkinci aşama (hata düzeltmeleri ve eklenen özellikler)

Emrullah KARA'nın "önce 7 hatayı düzelt, eksikleri ekle, merkez ve DC tarafını, kullanım kolaylığını tamamla" onayıyla yapıldı.
Mevzuat ve hukuk bilgisi gerektiren değerler **varsayılan** olarak girildi ve Ayarlar'dan değişir; kurum tarafından doğrulanmalıdır.

| # | Konu | Uygulanan |
|---|---|---|
| S14 | Bekleyen kayıtlar | İnternetsiz girilen kayıtlar kişiye bağlı tutulur; başka biri aynı telefonla girerse onun adına gitmez. Bekleyen kayıt varken çıkışta uyarı |
| S15 | Kapalı kasa günü | Gün sonu yapılmış güne ya da daha önceki bir güne **nakit** kayıt girilemez. Yönetici gerekçe yazarak girebilir; gerekçe kayıt defterine yazılır. Kart ve havale serbesttir |
| S16 | Canlı akış | Girişi kapatılan, şifresi ya da görevi değişen personelin akışı hemen kesilir; yetkisi değişenin süzgeci güncellenir |
| S17 | Hatalı giriş | Kişi + yer 5, yalnız kişi 20, yalnız yer 30 hatada 15 dakika kilit. Başkası bir öğrenciyi kolayca kilitleyemez |
| S18 | Hız | Borç ve ders sayıları toplu hesaplanır; canlı olaylarda ekran bir kez yenilenir, ekran kapalıysa açılınca yenilenir; öğrenci listesi 100'er satır açılır |
| S19 | Sınava girmeyen | Hakkı yanmış sayılır (varsayılan; **doğrulanmalı**, Ayarlar'dan kapatılabilir). "Geçti" düzeltilirse öğrenci yeniden aktif olur |
| S20 | Eğitmen günlük sınırı | Varsayılan 8 direksiyon dersi (**doğrulanmalı**; 0 = sınır yok) |
| S21 | E-sınav geçerliliği | Varsayılan 730 gün; dolmasına 60 gün kala uyarı (**doğrulanmalı**; 0 = uyarı yok) |
| S22 | Veli | 18 yaşından küçük adayda veli adı ve telefonu zorunlu; sözleşmede veli imza yeri |
| S23 | Kişisel veri (KVKK) | Aydınlatma metni (örnek, **hukukçuya kontrol ettirilmeli**), onay kaydı, veri dökümü, erişim kaydı, saklama süresi (varsayılan 10 yıl) dolunca anonimleştirme |
| S24 | Şifreli saklama | Evrak dosyaları, doğrulama anahtarları, sanal POS ve SMS şifreleri AES-256 ile şifreli. Anahtar veritabanının dışındadır (bilgisayarda `veri-anahtari.txt`, bulutta gizli değişken) |
| S25 | Fatura | Makbuz fatura yerine geçmez. Muhasebeciye fatura listesi (matrah ve KDV ayrılmış) ve kesilen fatura numarasının işlenmesi. KDV varsayılan %20 (**muhasebeciyle doğrulanmalı**). E-arşiv sağlayıcı bağlantısı yok |
| S26 | Yedek | Bilgisayarda her gün her firmanın yedeği, 30 gün saklanır; DC platformdan yedek alma ve dönme. Bulutta son 30 gün içinde istenen ana dönüş. Kurum sahibi bütün verisini dosya olarak indirebilir |
| S27 | Senet ve çek | Senet borcu değiştirmez, güvencedir; tahsil edilince makbuzlu ödeme yazılır. Senet çıktısı örnek düzendedir |
| S28 | Banka ve aktarım | Banka hesabı / POS, şube kasasından merkeze ve bankaya aktarım; gün sonu aktarımları hesaba katar |
| S29 | Aday ve ön kayıt | Aday takibi; kursun web sitesine konacak ön kayıt formu (varsayılan kapalı, yer başına saatte 5 başvuru) |
| S30 | Hatırlatma ve SMS | Her gün ayardaki saatte ders, sınav, taksit hatırlatması. SMS firması Netgsm (**gerçek hesapla denenmedi**); SMS kapalıyken öğrenci ekranında görünür ve WhatsApp ile gönderilir |
| S31 | Eğitim karnesi | Eğitmen dersten sonra konuları 1-5 puanlar; "sınava hazır" işareti. Konular Ayarlar'dan değişir |
| S32 | Deneme testi | Örnek 32 soru (kurum kendi sorularını eklemeli); Excel'den soru yükleme; doğru cevaplar test bitmeden gönderilmez |
| S33 | Şifremi unuttum | Talep yöneticiye düşer; yönetici (ya da SMS) 60 dakikalık tek kullanımlık kod verir. Tek yönetici unutursa kodu DC üretir |
| S34 | DC platform | Lisans ödemesi ve fatura no, ödemeyle lisans uzatma, açık personel sınırı, kullanım özeti (yalnız sayılar), platform kayıtları, platform girişine ek doğrulama |
| S35 | Makbuz serisi | Kurumda tek sıra ya da her şubenin kısa kodlu kendi sırası |
| S36 | Excel | Dışa aktarımlar gerçek .xlsx; öğrenci aktarımı .xlsx ya da .csv, önceden ödenen tutar "devir" olarak girer ve dönemin tahsilatı sayılmaz |
| S37 | Görünüm ve internetsiz | Koyu tema ve büyük yazı (cihaza göre saklanır). Eğitmenin son listesi telefonda saklanır, internet yokken gösterilir; çıkışta silinir |
