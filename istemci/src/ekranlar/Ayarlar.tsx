// Kurum ayarları (yalnız yönetici): kurum bilgisi ve logo, ders ve sınav kuralları, ücretler, prim,
// öğrencinin ders seçmesi, sözleşme metni, evrak listesi, konum kaydı, SMS ve internetten ödeme.
import { useY, type EkranP } from '../baglam';
import { islem } from '../api';
import { Kart, bildir, onayla, pencere } from '../bilesenler/ortak';
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
    { ad: 'eSinavGecme', etiket: 'E-sınav geçme puanı', tip: 'number', deger: a.eSinavGecme, min: 1, max: 100 },
    { ad: 'dersSuresi', etiket: 'Bir direksiyon dersinin süresi (dakika)', tip: 'number', deger: a.dersSuresi, min: 10, max: 240 },
    { tip: 'bilgi', html: 'Bu değerleri güncel mevzuata göre kontrol edin. Değişiklik yalnız bundan sonraki işlemlere uygulanır.' },
  ], (g) => kaydet('kurallar', g));
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
    { tip: 'bilgi', html: 'SMS gönderimi için bir SMS firmasıyla anlaşma gerekir. Şimdilik hatırlatmalar WhatsApp düğmesiyle gönderilir. Firma bilgisi girildiğinde bu bölüm açılacaktır.' },
    { ad: 'saglayici', etiket: 'SMS firması (bilgi amaçlı)', deger: a.sms.saglayici }, { ad: 'baslik', etiket: 'Gönderici adı (en fazla 11 harf)', deger: a.sms.baslik },
  ], (g) => kaydet('sms', { ...g, acik: false }));
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
          <div className="detay-bilgi"><Satir e="Sınav hakkı" d={a.sinavHakki} /><Satir e="E-sınav geçme puanı" d={a.eSinavGecme} /><Satir e="Ders süresi" d={`${a.dersSuresi} dk`} /></div>
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
        <Kart baslik="SMS" sag={<button className="dugme kucuk" onClick={sms}>Düzenle</button>}>
          <p><span className="rozet gri">Kapalı</span> <span className="soluk kucuk">Hatırlatmalar WhatsApp düğmesiyle gönderilir.</span></p>
        </Kart>
        <Kart baslik="İnternetten ödeme" sag={<button className="dugme kucuk" onClick={pos}>Düzenle</button>}>
          <p>{a.pos.acik ? <span className="rozet yesil">Açık · {a.pos.saglayici === 'paytr' ? 'PayTR' : 'Deneme'}{a.pos.deneme && a.pos.saglayici === 'paytr' ? ' (deneme modu)' : ''}</span> : <span className="rozet gri">Kapalı</span>}</p>
        </Kart>
      </div>
    </>
  );
}
