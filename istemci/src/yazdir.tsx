// Yazdırma: ödeme makbuzu ve kayıt sözleşmesi (karar 13). Kurum adı ve logosu ayarlardan gelir.
// Sayfa yazdırılırken yalnız #yazdir-alani görünür (stil.css, @media print).
import { useSyncExternalStore, type ReactNode } from 'react';
import type { Odeme, Ogrenci, Veri } from './tipler';
import { tarih, tl, YONTEM } from './yardim';

let icerik: ReactNode = null;
const dinleyen = new Set<() => void>();
function yazdir(dugum: ReactNode) {
  icerik = dugum;
  dinleyen.forEach((f) => f());
  setTimeout(() => { window.print(); }, 150);
}
export function YazdirmaAlani() {
  const d = useSyncExternalStore((f) => { dinleyen.add(f); return () => { dinleyen.delete(f); }; }, () => icerik);
  return <div id="yazdir-alani">{d}</div>;
}

// Tutarı yazıyla (makbuzlarda istenir): 1250,50 -> "BinİkiYüzElliTL ElliKr"
const BIR = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
const ON = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
function ucHane(n: number) {
  const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10;
  return (y ? (y === 1 ? '' : BIR[y]) + 'Yüz' : '') + ON[o] + BIR[b];
}
export function yaziyla(kurus: number) {
  const tl_ = Math.floor(kurus / 100), kr = kurus % 100;
  const basamak = ['', 'Bin', 'Milyon', 'Milyar'];
  let s = '', n = tl_, i = 0;
  if (n === 0) s = 'Sıfır';
  while (n > 0) {
    const p = n % 1000;
    if (p) s = (i === 1 && p === 1 ? '' : ucHane(p)) + basamak[i] + s;
    n = Math.floor(n / 1000); i++;
  }
  return `${s}TL${kr ? ' ' + ucHane(kr) + 'Kr' : ''}`;
}

function Ust({ v, baslik }: { v: Veri; baslik: string }) {
  return (
    <div className="y-ust">
      {v.kurum.logo && <img src={v.kurum.logo} alt="" className="y-logo" />}
      <div>
        <div className="y-kurum">{v.kurum.ad}</div>
        <div className="y-kucuk">{v.kurum.adres}{v.kurum.telefon ? ` · ${v.kurum.telefon}` : ''}</div>
        {(v.kurum.vergiDairesi || v.kurum.vergiNo) && <div className="y-kucuk">{v.kurum.vergiDairesi} {v.kurum.vergiNo}</div>}
      </div>
      <div className="y-baslik">{baslik}</div>
    </div>
  );
}

export function makbuzYazdir(v: Veri, od: Odeme, o: Ogrenci) {
  const sube = v.subeler.find((s) => s.id === od.sube_id);
  const kopya = (ad: string) => (
    <div className="y-sayfa y-makbuz">
      <Ust v={v} baslik={od.tur === 'iade' ? 'İADE BELGESİ' : 'TAHSİLAT MAKBUZU'} />
      <table className="y-tablo"><tbody>
        <tr><th>Makbuz no</th><td>{od.makbuz_no || '—'}</td><th>Tarih</th><td>{tarih(od.tarih)}</td></tr>
        <tr><th>Öğrenci</th><td>{o.ad} {o.soyad}</td><th>Şube</th><td>{sube?.ad}</td></tr>
        <tr><th>Ehliyet sınıfı</th><td>{o.sinif}</td><th>Ödeme şekli</th><td>{YONTEM[od.yontem] || od.yontem}</td></tr>
        <tr><th>Açıklama</th><td colSpan={3}>{od.aciklama || 'Sürücü kursu ücreti'}</td></tr>
        <tr className="y-tutar"><th>Tutar</th><td colSpan={3}><b>{tl(od.tutar)}</b> · {yaziyla(od.tutar)}</td></tr>
        {o.hesap && <tr><th>Kalan borç</th><td colSpan={3}>{tl(o.hesap.kalan)}</td></tr>}
      </tbody></table>
      <div className="y-imza"><div>Teslim eden<br /><br />{o.ad} {o.soyad}</div><div>Teslim alan<br /><br />{od.kaydeden}</div></div>
      <div className="y-kucuk y-sag">{ad}</div>
    </div>
  );
  yazdir(<>{kopya('Kurum nüshası')}<div className="y-kes" />{kopya('Öğrenci nüshası')}</>);
}

export const VARSAYILAN_SOZLESME = `Bu sözleşme {KURUM} ({SUBE}) ile aşağıda bilgileri bulunan kursiyer arasında {TARIH} tarihinde yapılmıştır.

1. Kursiyer {SINIF} sınıfı sürücü sertifikası eğitimi için kursa kayıt olmuştur.
2. Eğitim; {TEORIK} saat teorik ve {DIREKSIYON} saat direksiyon dersinden oluşur. Ders programı kurs tarafından düzenlenir.
3. Kurs ücreti {UCRET} olup ödeme planı ekteki taksit tablosunda gösterilmiştir. Paket dışı ek direksiyon dersi ve sınav tekrar ücretleri ayrıca ödenir.
4. Kursiyer derslere zamanında katılmayı, katılamayacağı dersleri en az 24 saat önce bildirmeyi kabul eder.
5. Kursiyerin kişisel verileri yalnız eğitim, sınav ve resmi bildirim işlemleri için işlenir.

Bu metin örnektir. Kurum kendi sözleşme metnini Ayarlar bölümünden yazmalıdır.`;

export function sozlesmeYazdir(v: Veri, o: Ogrenci) {
  const sube = v.subeler.find((s) => s.id === o.sube_id);
  const sinif = v.tanimlar.siniflar[o.sinif];
  const metin = (v.ayarlar?.sozlesmeMetni || VARSAYILAN_SOZLESME)
    .replaceAll('{KURUM}', v.kurum.ad).replaceAll('{SUBE}', sube?.ad || '').replaceAll('{TARIH}', tarih(o.kayit_tarihi))
    .replaceAll('{SINIF}', sinif?.ad || o.sinif).replaceAll('{TEORIK}', String(sinif?.teorik ?? '')).replaceAll('{DIREKSIYON}', String(sinif?.direksiyon ?? ''))
    .replaceAll('{UCRET}', o.hesap ? tl(o.hesap.paket) : '').replaceAll('{OGRENCI}', `${o.ad} ${o.soyad}`).replaceAll('{TC}', o.tc);
  yazdir(
    <div className="y-sayfa">
      <Ust v={v} baslik="KURSİYER KAYIT SÖZLEŞMESİ" />
      <table className="y-tablo"><tbody>
        <tr><th>Ad soyad</th><td>{o.ad} {o.soyad}</td><th>T.C. kimlik no</th><td>{o.tc}</td></tr>
        <tr><th>Telefon</th><td>{o.telefon}</td><th>Doğum tarihi</th><td>{tarih(o.dogum)}</td></tr>
        <tr><th>Adres</th><td colSpan={3}>{o.adres}</td></tr>
        <tr><th>Sınıf</th><td>{sinif?.ad || o.sinif}</td><th>Kayıt tarihi</th><td>{tarih(o.kayit_tarihi)}</td></tr>
      </tbody></table>
      <div className="y-metin">{metin}</div>
      {o.hesap && o.hesap.taksitler.length > 0 && (
        <>
          <h3>Ödeme planı</h3>
          <table className="y-tablo"><thead><tr><th>Vade</th><th>Tutar</th><th>Açıklama</th></tr></thead><tbody>
            {o.hesap.taksitler.map((t, i) => <tr key={i}><td>{tarih(t.vade)}</td><td>{tl(t.tutar)}</td><td>{t.ek || (i === 0 && t.vade === o.kayit_tarihi ? 'Peşinat' : 'Taksit')}</td></tr>)}
          </tbody></table>
        </>
      )}
      <div className="y-imza"><div>Kursiyer<br /><br />{o.ad} {o.soyad}</div><div>Kurum yetkilisi<br /><br />{v.kurum.ad}</div></div>
    </div>,
  );
}
