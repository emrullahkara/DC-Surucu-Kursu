// Kurum ayarları (yalnız yönetici): kurum bilgisi ve logo, ders ve sınav kuralları, ücretler, prim,
// öğrencinin ders seçmesi, sözleşme metni, evrak listesi, konum kaydı, SMS ve internetten ödeme.
import { useY, type EkranP } from '../baglam';
import { api, firmaKodu, islem } from '../api';
import { Kart, bildir, onayla, pencere, icerikPenceresi } from '../bilesenler/ortak';
import { SoruBankasi } from '../bilesenler/SoruBankasi';
import { dosyaIndir } from '../excel';
import { tl } from '../yardim';
import { VARSAYILAN_SOZLESME } from '../yazdir';

export function Ayarlar(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const a = v.ayarlar;
  if (!a) return <Kart>Bu bölüm yalnız yönetici içindir.</Kart>;
  const kaydet = async (bolum: string, deger: unknown) => { await islem('ayar_kaydet', { bolum, deger }); await y.b.yenile(); bildir('Ayar kaydedildi.', 'tamam'); };

  const kurum = () => pencere('Kurum bilgileri', [
    { ad: 'ad', etiket: 'Kurum adı', deger: v.kurum.ad, zorunlu: true }, { ad: 'telefon', etiket: 'Telefon', deger: a.kurum.telefon },
    { ad: 'adres', etiket: 'Adres', deger: a.kurum.adres, genis: true },
    { ad: 'vergiDairesi', etiket: 'Vergi dairesi', deger: a.kurum.vergiDairesi }, { ad: 'vergiNo', etiket: 'Vergi no', deger: a.kurum.vergiNo },
    { ad: 'logo', etiket: 'Logo (PNG, JPG, en fazla 500 KB)', tip: 'dosya', kabul: 'image/png,image/jpeg,image/webp' },
    { ad: 'logoSil', etiket: 'Mevcut logoyu kaldır', tip: 'onay', gizle: () => !a.kurum.logo },
  ], async (g) => {
    const logo = g.logoSil ? '' : g.logo ? g.logo.veri : undefined;
    await kaydet('kurum', { ad: g.ad, telefon: g.telefon, adres: g.adres, vergiDairesi: g.vergiDairesi, vergiNo: g.vergiNo, logo });
  }, { ikili: true });
  const kurallar = () => pencere('Ders ve sınav kuralları', [
    { ad: 'sinavHakki', etiket: 'Her sınav için en fazla hak', tip: 'number', deger: a.sinavHakki, min: 1, max: 20 },
    { ad: 'girmediHakYakar', etiket: 'Sınava girmeyen adayın o hakkı yanmış sayılsın', tip: 'onay', deger: a.girmediHakYakar },
    { ad: 'eSinavGecme', etiket: 'E-sınav geçme puanı', tip: 'number', deger: a.eSinavGecme, min: 1, max: 100 },
    { ad: 'eSinavGecerlilikGun', etiket: 'E-sınav geçerlilik süresi (gün, 0 = uyarı yok)', tip: 'number', deger: a.eSinavGecerlilikGun, min: 0, max: 3650, not: 'E-sınavı geçen adayın direksiyon sınavını bitirmesi gereken süre; dolmasına 60 gün kala uyarılır.' },
    { ad: 'dersSuresi', etiket: 'Bir direksiyon dersinin süresi (dakika)', tip: 'number', deger: a.dersSuresi, min: 10, max: 240 },
    { ad: 'egitmenGunlukDers', etiket: 'Eğitmen günlük en fazla direksiyon dersi (0 = sınır yok)', tip: 'number', deger: a.egitmenGunlukDers, min: 0, max: 24 },
    { ad: 'ogrenciGunlukDers', etiket: 'Öğrencinin kendi ekranından bir güne seçebileceği ders', tip: 'number', deger: a.ogrenciGunlukDers, min: 1, max: 6 },
    { tip: 'bilgi', html: 'Bu değerleri güncel mevzuata göre kontrol edin. Değişiklik yalnız bundan sonraki işlemlere uygulanır.' },
  ], (g) => kaydet('kurallar', g), { ikili: true });
  const makbuz = () => pencere('Makbuz numarası', [
    { ad: 'seri', etiket: 'Numara sırası', tip: 'select', secenekler: [['kurum', 'Bütün kurumda tek sıra (2026-000001)'], ['sube', 'Her şubenin kendi sırası (CNK-2026-000001)']], deger: a.makbuzSerisi },
    { tip: 'bilgi', html: 'Şube sırası için her şubeye kısa kod verilmelidir (Şubeler ve personel > Düzenle).' },
  ], (g) => kaydet('makbuz', g));
  const kvkk = () => pencere('Kişisel veri (KVKK)', [
    { ad: 'metin', etiket: 'Aydınlatma metni ({KURUM} kurum adıyla doldurulur)', tip: 'textarea', deger: a.kvkk.metin || v.tanimlar.kvkk.metin, genis: true },
    { ad: 'saklamaYil', etiket: 'Kurs bittikten sonra kişisel veri saklama süresi (yıl, 0 = süresiz)', tip: 'number', deger: a.kvkk.saklamaYil, min: 0, max: 30 },
    { tip: 'bilgi', html: 'Metin ve süre örnektir; hukuk danışmanınızla kontrol edin. Metin değişince yeni onaylar yeni sürümle kaydedilir.' },
  ], (g) => kaydet('kvkk', g), { genis: true });
  const topluAnonim = () => pencere('Saklama süresi dolan kayıtları anonim yap', [
    { tip: 'bilgi', html: <>Kursu biten ya da iptal olan ve son {a.kvkk.saklamaYil} yıldır hareketi olmayan <b>{v.anonimBekleyen || 0}</b> kaydın kişisel bilgileri (ad, kimlik, telefon, adres, evrak) kalıcı olarak silinir. Para ve ders sayıları isimsiz kalır. Geri alınamaz.</> },
    { ad: 'onay', etiket: 'Onay için büyük harflerle SİL yazın', zorunlu: true },
  ], async (g) => { const r = await islem<{ sayi: number }>('toplu_anonimlestir', { onay: g.onay }); await y.b.yenile(); bildir(`${r.sayi} kayıt anonim yapıldı.`, 'tamam'); }, { dugme: 'Anonim yap', tehlike: true });
  const fatura = () => pencere('Fatura listesi', [
    { ad: 'kdvOrani', etiket: 'KDV oranı (%)', tip: 'number', deger: a.fatura.kdvOrani, min: 0, max: 100, not: 'Tutarlar KDV dahil kabul edilir. Muhasebecinizle doğrulayın.' },
  ], (g) => kaydet('fatura', g));
  const onKayitAdresi = `${location.origin}/k/${encodeURIComponent(firmaKodu())}/on-kayit`;
  const onKayit = () => pencere('İnternetten ön kayıt ve kayıt kaynakları', [
    { ad: 'acik', etiket: 'İnternetten ön kayıt formu açık', tip: 'onay', deger: a.onKayit.acik },
    { tip: 'bilgi', html: <>Form adresi: <code>{onKayitAdresi}</code></> },
    { ad: 'mesaj', etiket: 'Formun üstünde görünecek kısa yazı', tip: 'textarea', deger: a.onKayit.mesaj },
    { ad: 'kaynaklar', etiket: '"Bizi nereden duydunuz?" seçenekleri (her satıra bir)', tip: 'textarea', deger: a.kaynaklar.join('\n') },
  ], (g) => kaydet('onKayit', { acik: g.acik, mesaj: g.mesaj, kaynaklar: String(g.kaynaklar).split('\n').map((x: string) => x.trim()).filter(Boolean) }));
  const h = a.hatirlatma;
  const gunSec: [string, string][] = [['-1', 'Gönderme'], ['0', 'Aynı gün'], ['1', '1 gün önce'], ['2', '2 gün önce'], ['3', '3 gün önce']];
  const hatirlatma = () => pencere('Otomatik hatırlatma', [
    { ad: 'acik', etiket: 'Her gün kendiliğinden hazırlansın', tip: 'onay', deger: h.acik },
    { ad: 'saat', etiket: 'Hazırlanma saati', tip: 'time', deger: h.saat },
    { ad: 'dersGunOnce', etiket: 'Direksiyon dersi', tip: 'select', secenekler: gunSec, deger: String(h.dersGunOnce) },
    { ad: 'sinavGunOnce', etiket: 'Sınav', tip: 'select', secenekler: gunSec, deger: String(h.sinavGunOnce) },
    { ad: 'taksitGunOnce', etiket: 'Taksit vadesi', tip: 'select', secenekler: gunSec, deger: String(h.taksitGunOnce) },
    { ad: 'gecikenHaftalik', etiket: 'Gecikmiş ödemesi olana her pazartesi hatırlat', tip: 'onay', deger: h.gecikenHaftalik },
    { tip: 'bilgi', html: 'Mesajlardaki {AD}, {TARIH}, {SAAT}, {TUTAR}, {SINAV}, {KURUM} kendiliğinden doldurulur.' },
    { ad: 'ders', etiket: 'Ders mesajı', tip: 'textarea', deger: h.sablonlar?.ders || '', not: 'Boş bırakılırsa hazır metin kullanılır.' },
    { ad: 'sinav', etiket: 'Sınav mesajı', tip: 'textarea', deger: h.sablonlar?.sinav || '' },
    { ad: 'taksit', etiket: 'Taksit mesajı', tip: 'textarea', deger: h.sablonlar?.taksit || '' },
    { tip: 'bilgi', html: 'SMS açıksa mesajlar SMS ile gider; değilse öğrencinin kendi ekranında görünür ve "Duyuru ve hatırlatma" ekranından WhatsApp ile tek tek gönderilebilir.' },
  ], (g) => kaydet('hatirlatma', { acik: g.acik, saat: g.saat, dersGunOnce: Number(g.dersGunOnce), sinavGunOnce: Number(g.sinavGunOnce), taksitGunOnce: Number(g.taksitGunOnce),
    gecikenHaftalik: g.gecikenHaftalik, sablonlar: { ders: g.ders, sinav: g.sinav, taksit: g.taksit } }), { ikili: true });
  const karne = () => pencere('Direksiyon karnesi konuları', [
    { ad: 'konular', etiket: 'Her satıra bir konu', tip: 'textarea', deger: a.karneKonulari.join('\n') },
  ], (g) => kaydet('karne', { konular: String(g.konular).split('\n').map((x: string) => x.trim()).filter(Boolean) }));
  const test = () => pencere('E-sınav deneme testi', [
    { ad: 'acik', etiket: 'Öğrenciler kendi ekranından deneme testi çözebilsin', tip: 'onay', deger: a.denemeTest.acik },
    { ad: 'soruSayisi', etiket: 'Bir testteki soru sayısı', tip: 'number', deger: a.denemeTest.soruSayisi, min: 5, max: 100 },
    { ad: 'sureDk', etiket: 'Süre (dakika)', tip: 'number', deger: a.denemeTest.sureDk, min: 5, max: 180 },
  ], (g) => kaydet('denemeTest', g));
  const sorular = () => icerikPenceresi('Soru bankası', <SoruBankasi sorular={v.sorular || []} konular={v.tanimlar.testKonulari} yenile={() => y.b.yenile()} />);
  const disaAktar = async () => {
    const r = await fetch('/api/disa-aktar', { headers: { 'X-Firma': firmaKodu() } });
    if (!r.ok) return bildir((await r.json().catch(() => ({}))).hata || 'Alınamadı.', 'hata');
    dosyaIndir(`dc-kurs-verileri-${v.bugun}.json`, await r.blob(), 'application/json');
  };
  const smsDeneme = () => pencere('Deneme SMS’i', [{ ad: 'telefon', etiket: 'Cep telefonu', tip: 'tel', zorunlu: true }],
    async (g) => { const r = await api<{ not: string }>('/api/sms-deneme', { telefon: g.telefon }); bildir(`SMS gönderildi. ${r.not}`, 'tamam'); });
  const sinifForm = (kod?: string) => {
    const s = kod ? a.siniflar[kod] : undefined;
    pencere(kod ? `Sınıf · ${kod}` : 'Yeni ehliyet sınıfı', [
      ...(kod ? [] : [{ ad: 'kod', etiket: 'Sınıf kodu (ör. C1)', zorunlu: true }]),
      { ad: 'ad', etiket: 'Görünen ad', deger: s?.ad, zorunlu: true },
      { ad: 'teorik', etiket: 'Teorik ders saati', tip: 'number', deger: s?.teorik ?? 34 },
      { ad: 'direksiyon', etiket: 'Direksiyon ders sayısı', tip: 'number', deger: s?.direksiyon ?? 14 },
    ], (g) => kaydet('siniflar', { ...a.siniflar, [kod || g.kod]: { ad: g.ad, teorik: g.teorik, direksiyon: g.direksiyon } }));
  };
  const sinifSil = (kod: string) => onayla(`${kod} sınıfı listeden kaldırılsın mı? Aktif öğrencisi varsa kaldırılamaz.`, () => {
    const yeni = { ...a.siniflar }; delete yeni[kod]; return kaydet('siniflar', yeni);
  }, 'Kaldır');
  const ucretler = () => pencere('Ek ücretler', [
    { ad: 'ekDers', etiket: 'Ek direksiyon dersi ücreti (₺)', tip: 'para', deger: a.ucretler.ekDers, not: 'Paketteki ders sayısı aşılınca her tamamlanan ders için borca otomatik eklenir. 0 ise eklenmez.' },
    { ad: 'sinavTekrar', etiket: 'Sınav tekrar ücreti (₺)', tip: 'para', deger: a.ucretler.sinavTekrar, not: '2. ve sonraki haklarda sınav kaydıyla birlikte borca eklenir.' },
  ], (g) => kaydet('ucretler', g));
  const prim = () => pencere('Eğitmen ders başı prim', [
    { ad: 'direksiyon', etiket: 'Direksiyon dersi başına (₺)', tip: 'para', deger: a.prim.direksiyon },
    { ad: 'teorik', etiket: 'Bireysel teorik ders başına (₺)', tip: 'para', deger: a.prim.teorik },
  ], (g) => kaydet('prim', g));
  const dersSecimi = () => pencere('Öğrencinin kendi dersini seçmesi', [
    { ad: 'acik', etiket: 'Öğrenci, eğitmeninin boş saatlerinden direksiyon dersi seçebilsin', tip: 'onay', deger: a.ogrenciDersSecimi.acik },
    { ad: 'bas', etiket: 'Günlük ilk ders saati', tip: 'time', deger: a.ogrenciDersSecimi.bas }, { ad: 'bit', etiket: 'Günlük son ders bitişi', tip: 'time', deger: a.ogrenciDersSecimi.bit },
    { ad: 'enErkenGun', etiket: 'En erken kaç gün sonrası seçilebilir', tip: 'number', deger: a.ogrenciDersSecimi.enErkenGun },
    { ad: 'enGecGun', etiket: 'En geç kaç gün sonrası seçilebilir', tip: 'number', deger: a.ogrenciDersSecimi.enGecGun },
  ], (g) => kaydet('ogrenciDersSecimi', g), { ikili: true });
  const sozlesme = () => pencere('Sözleşme metni', [
    { tip: 'bilgi', html: <>Şu kelimeler yazdırırken doldurulur: {'{KURUM} {SUBE} {TARIH} {OGRENCI} {TC} {SINIF} {TEORIK} {DIREKSIYON} {UCRET}'}. Metnin hukuki uygunluğunu kurum kontrol etmelidir.</> },
    { ad: 'metin', etiket: 'Metin', tip: 'textarea', deger: a.sozlesmeMetni || VARSAYILAN_SOZLESME, genis: true },
  ], (g) => kaydet('sozlesme', g), { genis: true });
  const evrak = () => pencere('Kayıtta istenen evraklar', [
    { ad: 'liste', etiket: 'Her satıra bir evrak', tip: 'textarea', deger: (a.evrakTurleri || []).join('\n') },
  ], (g) => kaydet('evrakTurleri', { liste: String(g.liste).split('\n').map((x: string) => x.trim()).filter(Boolean) }));
  const konum = () => pencere('Ders sırasında konum kaydı', [
    { tip: 'bilgi', html: 'Açıksa eğitmen dersi "tamamlandı" diye kapatırken telefonun konumu kaydedilir; yalnız yönetici ve şube müdürü görür. Eğitmenlerinize bunu bildirmeniz gerekir (kişisel veri).' },
    { ad: 'acik', etiket: 'Konum kaydı açık', tip: 'onay', deger: a.konumKaydi },
  ], (g) => kaydet('konum', g));
  const sms = () => pencere('SMS', [
    { tip: 'bilgi', html: 'SMS için bir SMS firmasıyla (Netgsm) anlaşmanız ve onaylı bir gönderici adınız olmalı. Bilgileri firmanın panelinden alırsınız. Açmadan önce "Deneme SMS’i" ile kontrol edin.' },
    { ad: 'acik', etiket: 'SMS gönderimi açık', tip: 'onay', deger: a.sms.acik },
    { ad: 'saglayici', etiket: 'SMS firması', tip: 'select', secenekler: [['', 'Seçilmedi'], ['netgsm', 'Netgsm'], ['deneme', 'Deneme (gerçek SMS gitmez)']], deger: a.sms.saglayici },
    { ad: 'kullanici', etiket: 'Kullanıcı kodu', deger: a.sms.kullanici, gizle: (x) => x.saglayici !== 'netgsm' },
    { ad: 'sifre', etiket: 'Şifre (API)', deger: a.sms.sifre, gizle: (x) => x.saglayici !== 'netgsm', not: 'Kaydedildikten sonra ekranda gösterilmez.' },
    { ad: 'baslik', etiket: 'Gönderici adı (en fazla 11 harf)', deger: a.sms.baslik },
  ], (g) => kaydet('sms', g));
  const pos = () => pencere('İnternetten ödeme (kendi sanal POS’unuz)', [
    { tip: 'bilgi', html: <>Öğrencileriniz kendi ekranlarından kartla ödeyebilir. Para doğrudan sizin sanal POS hesabınıza geçer. PayTR mağaza bilgilerinizi PayTR panelinden alırsınız. <b>Deneme modu</b> açıkken gerçek para çekilmez.</> },
    { ad: 'acik', etiket: 'İnternetten ödeme açık', tip: 'onay', deger: a.pos.acik },
    { ad: 'saglayici', etiket: 'Sağlayıcı', tip: 'select', secenekler: [['', 'Seçilmedi'], ['paytr', 'PayTR'], ['deneme', 'Deneme (gerçek ödeme yok, yalnız denemek için)']], deger: a.pos.saglayici },
    { ad: 'magazaNo', etiket: 'Mağaza no', deger: a.pos.magazaNo, gizle: (x) => x.saglayici !== 'paytr' },
    { ad: 'anahtar', etiket: 'Mağaza parolası (merchant key)', deger: a.pos.anahtar, gizle: (x) => x.saglayici !== 'paytr' },
    { ad: 'gizli', etiket: 'Mağaza gizli anahtarı (merchant salt)', deger: a.pos.gizli, gizle: (x) => x.saglayici !== 'paytr', not: 'Kaydedildikten sonra ekranda gösterilmez.' },
    { ad: 'deneme', etiket: 'Deneme modu (test ödemesi)', tip: 'onay', deger: a.pos.deneme, gizle: (x) => x.saglayici !== 'paytr' },
  ], (g) => kaydet('pos', g));

  const Satir = ({ e, d }: { e: string; d: React.ReactNode }) => <div><span>{e}</span>{d || '—'}</div>;
  return (
    <>
      <h1>Ayarlar</h1>
      <div className="izgara">
        <Kart baslik="Kurum bilgileri" sag={<button className="dugme kucuk" onClick={kurum}>Düzenle</button>}>
          {a.kurum.logo && <img src={a.kurum.logo} alt="Logo" className="ayar-logo" />}
          <div className="detay-bilgi"><Satir e="Ad" d={v.kurum.ad} /><Satir e="Telefon" d={a.kurum.telefon} /><Satir e="Adres" d={a.kurum.adres} /><Satir e="Vergi" d={`${a.kurum.vergiDairesi} ${a.kurum.vergiNo}`.trim()} /></div>
          <p className="soluk kucuk">Logo ve bilgiler makbuzda, sözleşmede ve giriş ekranında görünür.</p>
        </Kart>
        <Kart baslik="Ders ve sınav kuralları" sag={<button className="dugme kucuk" onClick={kurallar}>Düzenle</button>}>
          <div className="detay-bilgi"><Satir e="Sınav hakkı" d={`${a.sinavHakki}${a.girmediHakYakar ? ' (girmeyenin hakkı yanar)' : ''}`} /><Satir e="E-sınav geçme puanı" d={a.eSinavGecme} />
            <Satir e="E-sınav geçerlilik" d={a.eSinavGecerlilikGun ? `${a.eSinavGecerlilikGun} gün` : 'Uyarı yok'} /><Satir e="Ders süresi" d={`${a.dersSuresi} dk`} />
            <Satir e="Eğitmen günlük sınır" d={a.egitmenGunlukDers ? `${a.egitmenGunlukDers} ders` : 'Yok'} /><Satir e="Öğrenci günlük seçim" d={`${a.ogrenciGunlukDers} ders`} /></div>
          <p className="soluk kucuk">Varsayılan değerler yaygın uygulamaya göredir; güncel mevzuatla kontrol edin.</p>
        </Kart>
        <Kart baslik="Makbuz numarası" sag={<button className="dugme kucuk" onClick={makbuz}>Düzenle</button>}>
          <p>{a.makbuzSerisi === 'sube' ? 'Her şubenin kendi sırası (şube kodlu)' : 'Bütün kurumda tek sıra'}</p>
        </Kart>
        <Kart baslik="Kişisel veri (KVKK)" sag={<button className="dugme kucuk" onClick={kvkk}>Düzenle</button>}>
          <div className="detay-bilgi"><Satir e="Aydınlatma metni" d={a.kvkk.metin ? `Kurumun metni (sürüm ${a.kvkk.surum})` : 'Örnek metin'} /><Satir e="Saklama süresi" d={a.kvkk.saklamaYil ? `${a.kvkk.saklamaYil} yıl` : 'Süresiz'} /></div>
          {(v.anonimBekleyen || 0) > 0 && <p className="uyari-kutu">Saklama süresi dolmuş {v.anonimBekleyen} kayıt var. <button className="dugme kucuk kirmizi" onClick={topluAnonim}>Anonim yap</button></p>}
          <p className="soluk kucuk">Evrak açma, MEBBİS listesi, veri dökümü gibi erişimler kaydedilir (Hesabım &gt; Kişisel veri erişim kaydı). Evraklar şifreli saklanır.</p>
        </Kart>
        <Kart baslik="Fatura listesi" sag={<button className="dugme kucuk" onClick={fatura}>Düzenle</button>}>
          <div className="detay-bilgi"><Satir e="KDV oranı" d={`%${a.fatura.kdvOrani}`} /></div>
          <p className="soluk kucuk">Kasa &gt; Fatura listesi: muhasebeciye verilecek liste ve kesilen fatura numaraları.</p>
        </Kart>
        <Kart baslik="İnternetten ön kayıt" sag={<button className="dugme kucuk" onClick={onKayit}>Düzenle</button>}>
          <p>{a.onKayit.acik ? <span className="rozet yesil">Açık</span> : <span className="rozet gri">Kapalı</span>}</p>
          {a.onKayit.acik && <p className="kucuk"><code>{onKayitAdresi}</code></p>}
          <p className="soluk kucuk">Kayıt kaynakları: {a.kaynaklar.join(', ')}</p>
        </Kart>
        <Kart baslik="Otomatik hatırlatma" sag={<button className="dugme kucuk" onClick={hatirlatma}>Düzenle</button>}>
          <p>{h.acik ? <span className="rozet yesil">Açık · her gün {h.saat}</span> : <span className="rozet gri">Kapalı</span>}</p>
          <p className="soluk kucuk">Ders: {gunSec.find((x) => x[0] === String(h.dersGunOnce))?.[1]} · Sınav: {gunSec.find((x) => x[0] === String(h.sinavGunOnce))?.[1]} · Taksit: {gunSec.find((x) => x[0] === String(h.taksitGunOnce))?.[1]}</p>
        </Kart>
        <Kart baslik="Direksiyon karnesi" sag={<button className="dugme kucuk" onClick={karne}>Düzenle</button>}>
          <p className="soluk kucuk">{a.karneKonulari.length} konu: {a.karneKonulari.slice(0, 5).join(', ')}{a.karneKonulari.length > 5 ? '…' : ''}</p>
        </Kart>
        <Kart baslik="E-sınav deneme testi" sag={<><button className="dugme kucuk" onClick={sorular}>Soru bankası</button><button className="dugme kucuk" onClick={test}>Düzenle</button></>}>
          <p>{a.denemeTest.acik ? <span className="rozet yesil">Açık</span> : <span className="rozet gri">Kapalı</span>} <span className="soluk kucuk">{a.denemeTest.soruSayisi} soru, {a.denemeTest.sureDk} dk · bankada {(v.sorular || []).length} soru</span></p>
          {(v.sorular || []).some((q) => q.kaynak === 'ornek') && <p className="soluk kucuk">Bankada örnek sorular var; kendi sorularınızı eklemeniz önerilir.</p>}
        </Kart>
        <Kart baslik="Verilerimi dışarı al">
          <p className="kucuk">Kurumun bütün kayıtları (öğrenciler, dersler, ödemeler, evrak dosyaları dahil) tek dosya olarak indirilir. Şifreler ve gizli anahtarlar dosyaya konmaz. Dosyayı güvenli yerde saklayın.</p>
          <button className="dugme" onClick={() => onayla('Kurumun bütün verisi indirilsin mi? Bu işlem kayıt defterine yazılır.', disaAktar, 'İndir')}>Bütün veriyi indir</button>
        </Kart>
        <Kart baslik="Ehliyet sınıfları ve ders saatleri" sag={<button className="dugme kucuk" onClick={() => sinifForm()}>+ Sınıf</button>}>
          <table><thead><tr><th>Sınıf</th><th className="sayi-h">Teorik</th><th className="sayi-h">Direksiyon</th><th></th></tr></thead><tbody>
            {Object.entries(a.siniflar).map(([k, s]) => (
              <tr key={k}><td><b>{k}</b> <span className="soluk kucuk">{s.ad}</span></td><td className="sayi-h">{s.teorik}</td><td className="sayi-h">{s.direksiyon}</td>
                <td><div className="dugmeler"><button className="dugme kucuk" onClick={() => sinifForm(k)}>Düzenle</button><button className="dugme kucuk kirmizi" onClick={() => sinifSil(k)}>✕</button></div></td></tr>
            ))}
          </tbody></table>
          <p className="soluk kucuk">Değerler yaygın uygulamaya göre girildi; güncel mevzuata göre kontrol edin.</p>
        </Kart>
        <Kart baslik="Ek ücretler" sag={<button className="dugme kucuk" onClick={ucretler}>Düzenle</button>}>
          <div className="detay-bilgi"><Satir e="Ek direksiyon dersi" d={tl(a.ucretler.ekDers)} /><Satir e="Sınav tekrar ücreti" d={tl(a.ucretler.sinavTekrar)} /></div>
        </Kart>
        <Kart baslik="Eğitmen primi" sag={<button className="dugme kucuk" onClick={prim}>Düzenle</button>}>
          <div className="detay-bilgi"><Satir e="Direksiyon dersi başına" d={tl(a.prim.direksiyon)} /><Satir e="Teorik ders başına" d={tl(a.prim.teorik)} /></div>
        </Kart>
        <Kart baslik="Öğrencinin ders seçmesi" sag={<button className="dugme kucuk" onClick={dersSecimi}>Düzenle</button>}>
          <div className="detay-bilgi"><Satir e="Durum" d={a.ogrenciDersSecimi.acik ? 'Açık' : 'Kapalı'} /><Satir e="Saatler" d={`${a.ogrenciDersSecimi.bas} - ${a.ogrenciDersSecimi.bit}`} />
            <Satir e="Seçilebilen günler" d={`${a.ogrenciDersSecimi.enErkenGun} ile ${a.ogrenciDersSecimi.enGecGun} gün sonrası`} /></div>
        </Kart>
        <Kart baslik="Kayıtta istenen evraklar" sag={<button className="dugme kucuk" onClick={evrak}>Düzenle</button>}>
          <ul className="liste">{(a.evrakTurleri || []).map((e) => <li key={e}>{e}</li>)}</ul>
        </Kart>
        <Kart baslik="Sözleşme metni" sag={<button className="dugme kucuk" onClick={sozlesme}>Düzenle</button>}>
          <p className="soluk kucuk">{a.sozlesmeMetni ? 'Kurumun kendi metni kullanılıyor.' : 'Örnek metin kullanılıyor. Kendi metninizi yazmanız önerilir.'}</p>
        </Kart>
        <Kart baslik="Konum kaydı" sag={<button className="dugme kucuk" onClick={konum}>Düzenle</button>}>
          <p>{a.konumKaydi ? <span className="rozet yesil">Açık</span> : <span className="rozet gri">Kapalı</span>}</p>
        </Kart>
        <Kart baslik="SMS" sag={<>{a.sms.saglayici && <button className="dugme kucuk" onClick={smsDeneme}>Deneme SMS’i</button>}<button className="dugme kucuk" onClick={sms}>Düzenle</button></>}>
          <p>{a.sms.acik ? <span className="rozet yesil">Açık · {a.sms.saglayici === 'netgsm' ? 'Netgsm' : 'Deneme'} · {a.sms.baslik}</span> : <><span className="rozet gri">Kapalı</span> <span className="soluk kucuk">Hatırlatmalar öğrenci ekranında görünür ve WhatsApp ile gönderilebilir.</span></>}</p>
        </Kart>
        <Kart baslik="İnternetten ödeme" sag={<button className="dugme kucuk" onClick={pos}>Düzenle</button>}>
          <p>{a.pos.acik ? <span className="rozet yesil">Açık · {a.pos.saglayici === 'paytr' ? 'PayTR' : 'Deneme'}{a.pos.deneme && a.pos.saglayici === 'paytr' ? ' (deneme modu)' : ''}</span> : <span className="rozet gri">Kapalı</span>}</p>
        </Kart>
      </div>
    </>
  );
}
