# DC Sürücü Kursu · Kullanım rehberi

## 1. İlk açılış

1. DC, kurs firmasını **Platform** ekranından açar: kurum adı, **kurum kodu** (ör. `yildiz-kurs`), lisans bitiş tarihi,
   en fazla şube sayısı ve kurum sahibinin ilk kullanıcı adı ile şifresi.
2. Kurs sahibi adrese girer, kurum kodunu bir kez yazar (cihaz hatırlar) ve **Yetkili girişi**nden girer.
   Doğrudan bağlantı da verilebilir: `adres/?firma=yildiz-kurs`
3. **Ayarlar** bölümünde kurum bilgileri ve logo, ders ve sınav kuralları, ek ücretler, eğitmen primi,
   istenen evraklar ve sözleşme metni girilir.
4. **Şubeler ve personel** bölümünde şubeler açılır, şube müdürleri, büro, muhasebe personeli ve eğitmenler eklenir.
5. **Araçlar** bölümünde araçlar, muayene, sigorta ve kasko tarihleriyle girilir.

## 2. Kim neyi görür

| Görev | Nereden girer | Ne görür |
|---|---|---|
| Yönetici (merkez) | Yetkili girişi | Bütün şubeler, her şey. Üstteki kutudan tek şube seçilebilir |
| Şube müdürü | Yetkili girişi | Yalnız kendi şubesi, o şubede her şey |
| Büro | Personel girişi | Kendi şubesinde kayıt, tahsilat, ders ve sınav (değiştirilebilir) |
| Muhasebe | Personel girişi | Kendi şubesinde tahsilat, kasa ve raporlar (değiştirilebilir) |
| Eğitmen | Personel girişi | Yalnız kendi öğrencileri ve dersleri. Para, adres ve açık kimlik numarası görmez |
| Öğrenci | Öğrenci girişi | Yalnız kendi dersleri, sınavları, ödemeleri ve duyurular |

Yetkiler kişi kişi değiştirilebilir (Personel > Düzenle). Kimlik numarası yetkisi olmayan herkes numarayı
`123******45` biçiminde görür.

## 3. Günlük işler

**Yeni kayıt:** Öğrenciler > + Yeni kayıt. Peşinat girilirse makbuzu hemen yazdırılır. Kalan tutar taksitlere bölünür.
Öğrenci girişi için bir ilk şifre verilir; öğrenci ilk girişte kendi şifresini belirler. Öğrenci kartında
"Öğrenci girişi" düğmesi şifreyi WhatsApp ile göndermeyi de açar.

**Evrak:** Öğrenci kartı > Evraklar > + Evrak yükle. Telefonda kamerayla doğrudan fotoğraf çekilebilir.
Eksik evraklar öğrenci listesinde, özette ve öğrencinin kendi ekranında görünür.

**Direksiyon dersi:** Direksiyon > Eğitmen takvimi'nde boş kutuya tıklayın. Aynı eğitmene, araca ya da öğrenciye
üst üste binen saat verilemez. "Toplu planla" ile birkaç haftalık düzenli ders tek seferde girilir.
Öğrenci de kendi ekranından eğitmeninin boş saatini seçebilir (Ayarlar > Öğrencinin ders seçmesi).

**Sahada (eğitmen):** Eğitmen telefondan "Sahada" ekranını açar; ders bitince **Ders tamamlandı**, gelmediyse
**Gelmedi** der. Kayıt merkezin ekranına anında düşer. İnternet yoksa kayıt telefonda bekler ve bağlantı gelince
kendiliğinden gönderilir; üst şeritte "… kayıt gönderilmeyi bekliyor" yazar. Plansız bir ders için
"Plansız ders gir" kullanılır. Konum ayarı açıksa ders kapanırken konum da kaydedilir.

**Teorik ders:** Teorik > grup açın, öğrencileri ekleyin, ders programını planlayın (haftalık tekrar edebilir).
Dersin günü "Yoklama al" ile gelen ve gelmeyenler işaretlenir; gelenlerin teorik ders sayısı artar.

**Sınav:** Sınavlar > + Sınava yaz. E-sınav geçilmeden direksiyon sınavına yazılamaz, hak dolunca yazılamaz.
2. ve sonraki haklarda sınav tekrar ücreti borca kendiliğinden eklenir. E-sınavda puan girilirse sonuç kendiliğinden
belirlenir. Direksiyon sınavını geçen öğrencinin kaydı "Tamamlandı" olur.

**Ödeme:** Öğrenci kartı ya da Kasa > Ödeme al. Makbuz iki nüsha yazdırılır. Yanlış girilen ödeme silinmez,
nedeni yazılarak iptal edilir (kasa yetkisi gerekir). İade ve indirim de kasa yetkisiyle yapılır.

**Ek ders:** Paketteki direksiyon ders sayısı aşıldıktan sonra tamamlanan her derste ek ders ücreti borca
kendiliğinden eklenir (Ayarlar > Ek ücretler; 0 ise eklenmez).

**Gider ve firmalar:** Kasa > Giderler. Akaryakıt, servis gibi firmalardan veresiye alış "veresiye" işaretlenir;
Kasa > Firmalar'da borç görünür ve "Öde" ile kapatılır.

**Gün sonu:** Kasa > Gün sonu. Sistem, kasada olması gereken nakdi hesaplar; sayılan tutar yazılır ve fark kaydedilir.

## 4. Merkez için

- **Özet**: bütün şubelerin bugünkü dersleri, canlı akış, yaklaşan sınavlar, ödemesi gecikenler, araç ve evrak uyarıları.
- **Raporlar**: şube karşılaştırması ve şubeler toplamı, ödeme şekillerine göre tahsilat, geciken alacağın yaşı,
  eğitmen başına ders ve prim. Excel'e aktarılabilir.
- **MEBBİS**: Raporlar > "MEBBİS kursiyer listesi" seçilen tarihlerde kayıt olanları; Sınavlar > "MEBBİS için Excel"
  sınava girecekleri Excel olarak verir. Resmi sisteme otomatik aktarım yoktur; bilgiler bu listelerden elle girilir.
- **Görevlendirme**: Şubeler ve personel > Görevlendir. Eğitmen, belirtilen tarihlerde başka şubede de ders verebilir.
- **Nakil**: Öğrenci kartı > Şube nakli. Geçmiş ödeme ve dersler eski şubenin hesabında kalır.
- **Kayıt defteri**: Hesabım > Kayıt defteri. Kim, ne zaman, ne yaptı.

## 5. Güvenlik

- 5 hatalı şifrede hesap 15 dakika kilitlenir.
- Hesabım > Ek doğrulama kodu: açılırsa girişte telefondaki Google/Microsoft Authenticator kodu da istenir.
  Açarken verilen 8 kurtarma kodu saklanmalıdır. Telefonunu kaybeden personelin kodunu yönetici sıfırlayabilir.
- Şube kapatılırsa o şubenin personeli giriş yapamaz; kayıtlar silinmez.
- Lisans süresi dolarsa giriş kapanır; kayıtlar saklanır.

## 6. İnternetten ödeme

Ayarlar > İnternetten ödeme. Kurs kendi PayTR mağaza bilgilerini girer; para doğrudan kursun hesabına geçer.
Önce "Deneme modu" açıkken denenmelidir. Öğrenci kendi ekranında "Kartla öde" düğmesini görür; ödeme,
PayTR'nin güvenli sayfasında yapılır ve onaylanınca borçtan düşer, merkezin ekranına da anında gelir.
PayTR panelinde bildirim adresi: `https://<adres>/api/pos-bildirim/<kurum kodu>/paytr`

## 7. Telefona kurma

Telefonda adresi açın. Android'de tarayıcı menüsünden "Ana ekrana ekle", iPhone'da Paylaş > "Ana Ekrana Ekle".
