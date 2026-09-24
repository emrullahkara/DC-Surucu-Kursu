// Öğrenci listesi ve öğrenci kartı.
import { useMemo, useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { DersTablosu } from '../bilesenler/DersTablosu';
import { Bos, Ilerleme, Kart, Rozet, pencere, onayla, bildir } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import { islem } from '../api';
import { makbuzYazdir } from '../yazdir';
import { DURUM_OGR, DURUM_SINAV, DURUM_TAKSIT, SINAV_AD, YONTEM, csvIndir, kucukHarf, tarih, telLink, tl, tlCsv, whatsapp } from '../yardim';

export function Ogrenciler(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const [ara, setAra] = useState('');
  const [durum, setDurum] = useState('aktif');
  const [sinif, setSinif] = useState('');
  const [egitmen, setEgitmen] = useState('');
  const [donem, setDonem] = useState('');
  const [borc, setBorc] = useState('');
  const liste = useMemo(() => {
    const a = kucukHarf(ara.trim());
    return y.subeSuz(v.ogrenciler).filter((o) =>
      (!durum || o.durum === durum) && (!sinif || o.sinif === sinif) && (!egitmen || o.egitmen_id === (egitmen === '-' ? null : egitmen))
      && (!donem || o.donem_id === donem) && (!borc || (borc === 'geciken' ? (o.hesap?.geciken || 0) > 0 : (o.hesap?.kalan || 0) > 0))
      && (!a || kucukHarf(`${o.ad} ${o.soyad} ${o.telefon} ${o.tc}`).includes(a)));
  }, [v, y.b.sube, ara, durum, sinif, egitmen, donem, borc]);
  const excel = () => csvIndir(`ogrenciler-${v.bugun}.csv`, [
    ['Ad', 'Soyad', 'T.C.', 'Telefon', 'Sınıf', 'Şube', 'Eğitmen', 'Kayıt', 'Durum', 'Teorik', 'Direksiyon', ...(y.hak('tahsilat') ? ['Toplam ücret', 'Ödenen', 'Kalan', 'Geciken'] : [])],
    ...liste.map((o) => [o.ad, o.soyad, o.tc, o.telefon, o.sinif, y.subeAd(o.sube_id), y.kisiAd(o.egitmen_id), tarih(o.kayit_tarihi), DURUM_OGR[o.durum][0], o.dersler.teorik, o.dersler.direksiyon,
      ...(o.hesap ? [tlCsv(o.hesap.ucret), tlCsv(o.hesap.odenen), tlCsv(o.hesap.kalan), tlCsv(o.hesap.geciken)] : [])]),
  ]);
  return (
    <Kart baslik={<h1>Öğrenciler</h1>} sag={<>
      {y.hak('rapor') && <button className="dugme" onClick={excel}>Excel</button>}
      {y.hak('kayit') && <button className="dugme ana" onClick={() => E.ogrenciEkle()}>+ Yeni kayıt</button>}
    </>}>
      <div className="suzgec">
        <input type="search" placeholder="Ad, telefon veya kimlik no ile ara" value={ara} onChange={(e) => setAra(e.target.value)} />
        <select value={durum} onChange={(e) => setDurum(e.target.value)}><option value="">Bütün durumlar</option>{Object.entries(DURUM_OGR).map(([k, [e]]) => <option key={k} value={k}>{e}</option>)}</select>
        <select value={sinif} onChange={(e) => setSinif(e.target.value)}><option value="">Bütün sınıflar</option>{y.sinifSecenek().map(([k, e]) => <option key={k} value={k}>{e}</option>)}</select>
        <select value={egitmen} onChange={(e) => setEgitmen(e.target.value)}><option value="">Bütün eğitmenler</option><option value="-">Eğitmeni yok</option>{y.egitmenSecenek(y.b.sube || v.ben.sube_id || '', '').slice(1).concat(y.cokSube && !y.b.sube ? v.personel.filter((p) => p.rol === 'egitmen').map((p): [string, string] => [p.id, p.ad]) : []).filter((x, i, l) => l.findIndex((z) => z[0] === x[0]) === i).map(([k, e]) => <option key={k} value={k}>{e}</option>)}</select>
        {v.donemler.length > 0 && <select value={donem} onChange={(e) => setDonem(e.target.value)}><option value="">Bütün dönemler</option>{v.donemler.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}</select>}
        {y.hak('tahsilat') && <select value={borc} onChange={(e) => setBorc(e.target.value)}><option value="">Borç durumu</option><option value="borclu">Borcu olan</option><option value="geciken">Ödemesi geciken</option></select>}
      </div>
      <p className="soluk kucuk">{liste.length} öğrenci</p>
      <div className="tablo-kutu">
        <table>
          <thead><tr><th>Öğrenci</th><th>Sınıf</th>{y.subeSutunu && <th>Şube</th>}<th>Eğitmen</th><th>Teorik</th><th>Direksiyon</th><th>Durum</th>{y.hak('tahsilat') && <th className="sayi-h">Kalan borç</th>}</tr></thead>
          <tbody>
            {liste.length ? liste.map((o) => {
              const g = v.tanimlar.siniflar[o.sinif];
              return (
                <tr key={o.id} className="tikla" onClick={() => y.b.git('ogrenci', o.id)}>
                  <td><b>{o.ad} {o.soyad}</b><div className="kucuk soluk">{o.telefon}</div></td>
                  <td>{o.sinif}{o.mevcut_ehliyet && <div className="kucuk soluk">elinde {o.mevcut_ehliyet}</div>}</td>
                  {y.subeSutunu && <td>{y.subeAd(o.sube_id)}</td>}
                  <td>{y.kisiAd(o.egitmen_id) || <span className="soluk">—</span>}</td>
                  <td className="kucuk">{o.dersler.teorik}/{g?.teorik ?? '?'}</td>
                  <td className="kucuk">{o.dersler.direksiyon}/{g?.direksiyon ?? '?'}</td>
                  <td><Rozet tablo={DURUM_OGR} d={o.durum} />{(o.evrak?.eksik.length || 0) > 0 && <div><span className="rozet sari">evrak eksik</span></div>}</td>
                  {y.hak('tahsilat') && <td className="sayi-h">{tl(o.hesap?.kalan)}{(o.hesap?.geciken || 0) > 0 && <div><span className="rozet kirmizi">gecikme {tl(o.hesap?.geciken)}</span></div>}</td>}
                </tr>
              );
            }) : <tr><td colSpan={8}><Bos>Öğrenci bulunamadı.</Bos></td></tr>}
          </tbody>
        </table>
      </div>
    </Kart>
  );
}

export function OgrenciDetay(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const o = y.ogr(y.b.ogrId);
  if (!o) return <Kart><Bos>Öğrenci bulunamadı.</Bos><button className="dugme" onClick={() => y.b.git('ogrenciler')}>← Öğrenciler</button></Kart>;
  const g = v.tanimlar.siniflar[o.sinif];
  const dersler = v.dersler.filter((d) => d.ogrenci_id === o.id).sort((a, b) => (a.tarih + a.saat < b.tarih + b.saat ? 1 : -1));
  const sinavlar = v.sinavlar.filter((s) => s.ogrenci_id === o.id);
  const odemeler = (v.odemeler || []).filter((x) => x.ogrenci_id === o.id);
  const evraklar = (v.evraklar || []).filter((x) => x.ogrenci_id === o.id);
  const gruplar = v.teorikGruplar.filter((gr) => gr.uyeler.includes(o.id));
  const yoklama = v.yoklamalar.filter((x) => x.ogrenci_id === o.id);
  const aktif = o.durum === 'aktif';
  const dersYetki = aktif && (y.hak('ders') || o.egitmen_id === v.ben.id);
  const B = ({ e, children }: { e: string; children: React.ReactNode }) => <div><span>{e}</span>{children || '—'}</div>;
  const h = o.hesap;

  return (
    <>
      <div className="baslik-satir"><button className="dugme kucuk" onClick={() => y.b.git('ogrenciler')}>← Öğrenciler</button></div>
      <Kart baslik={<><h1>{o.ad} {o.soyad}</h1><Rozet tablo={DURUM_OGR} d={o.durum} /></>} sag={<>
        {o.telefon && <a className="dugme kucuk" href={telLink(o.telefon)}>Ara</a>}
        {o.telefon && <a className="dugme kucuk" target="_blank" rel="noopener noreferrer" href={whatsapp(o.telefon, `Merhaba ${o.ad}, `)}>WhatsApp</a>}
        {y.hak('kayit') && <>
          <button className="dugme kucuk" onClick={() => E.ogrenciDuzenle(o)}>Düzenle</button>
          <button className="dugme kucuk" onClick={() => E.ogrenciDurum(o)}>Durum</button>
          <button className="dugme kucuk" onClick={() => E.ogrenciPortal(o)}>Öğrenci girişi</button>
          {y.hak('hassas') && <button className="dugme kucuk" onClick={() => E.sozlesme(o)}>Sözleşme yazdır</button>}
        </>}
        {v.ben.rol === 'yonetici' && v.subeler.length > 1 && <button className="dugme kucuk" onClick={() => E.ogrenciNakil(o)}>Şube nakli</button>}
      </>}>
        <div className="detay-bilgi">
          <B e="Ehliyet sınıfı">{g?.ad || o.sinif}{o.mevcut_ehliyet && ` (elinde ${o.mevcut_ehliyet})`}</B>
          <B e="Şube">{y.subeAd(o.sube_id)}</B><B e="Direksiyon eğitmeni">{y.kisiAd(o.egitmen_id)}</B>
          <B e="Kayıt tarihi">{tarih(o.kayit_tarihi)}</B><B e="Dönem">{v.donemler.find((d) => d.id === o.donem_id)?.ad}</B>
          <B e="Telefon">{o.telefon}</B><B e="T.C. kimlik no">{o.tc}</B>
          {o.dogum !== undefined && <><B e="Doğum tarihi">{tarih(o.dogum)}</B><B e="Adres">{o.adres}</B></>}
          <B e="E-posta">{o.eposta}</B><B e="Öğrenci girişi">{o.portal_acik ? 'Açık' : 'Kapalı'}</B>
          {gruplar.length > 0 && <B e="Teorik grubu">{gruplar.map((x) => x.ad).join(', ')}</B>}
        </div>
        {o.notlar && <p className="bilgi">{o.notlar}</p>}
      </Kart>
      <div className="izgara">
        <Kart baslik="Ders ilerlemesi" sag={dersYetki && <>
          <button className="dugme kucuk" onClick={() => E.dersPlanla(o.id)}>+ Ders planla</button>
          {y.hak('ders') && <button className="dugme kucuk" onClick={() => E.topluPlan(o.id)}>Toplu planla</button>}
          <button className="dugme kucuk" onClick={() => E.dersSaha(o.id)}>+ Yapılan ders</button>
        </>}>
          {g && <><Ilerleme ad="Teorik (yoklama)" deger={o.dersler.teorik} en={g.teorik} /><Ilerleme ad="Direksiyon" deger={o.dersler.direksiyon} en={g.direksiyon} /></>}
          {o.dersler.direksiyon > (g?.direksiyon || 99) && <p className="bilgi kucuk">Paketteki {g?.direksiyon} direksiyon dersi aşıldı; fazlası ek ders sayılır.</p>}
          {yoklama.length > 0 && <p className="soluk kucuk">Teorik yoklama: {yoklama.filter((x) => x.durum === 'geldi').length} geldi, {yoklama.filter((x) => x.durum === 'gelmedi').length} gelmedi</p>}
        </Kart>
        <Kart baslik="Sınavlar" sag={aktif && y.hak('sinav') && <button className="dugme kucuk" onClick={() => E.sinavEkle(o.id)}>+ Sınava yaz</button>}>
          {sinavlar.length ? (
            <div className="tablo-kutu"><table><tbody>
              {sinavlar.map((s) => (
                <tr key={s.id}>
                  <td>{tarih(s.tarih)} {s.saat}<div className="kucuk soluk">{s.yer}</div></td>
                  <td>{SINAV_AD[s.tur]}<div className="kucuk soluk">{s.deneme}. hak</div></td>
                  <td><Rozet tablo={DURUM_SINAV} d={s.sonuc} />{s.puan !== null && <b> {s.puan}</b>}</td>
                  <td>{y.hak('sinav') && <button className="dugme kucuk" onClick={() => E.sinavSonuc(s)}>Sonuç</button>}</td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <Bos>Sınav kaydı yok.</Bos>}
        </Kart>
        {(y.hak('evrak') || evraklar.length > 0 || o.evrak) && <EvrakKarti ogrenciId={o.id} />}
        {h && (
          <Kart baslik="Ödeme durumu" sag={<>
            {h.kalan > 0 && <button className="dugme ana kucuk" onClick={() => E.odemeAl(o.id)}>Ödeme al</button>}
            <button className="dugme kucuk" onClick={() => E.kalemEkle(o)}>+ Ek ücret{y.hak('kasa') ? ' / indirim' : ''}</button>
            {y.hak('kasa') && <button className="dugme kucuk" onClick={() => E.ogrenciUcret(o)}>Paket / taksit</button>}
            {y.hak('kasa') && h.odenen > 0 && <button className="dugme kucuk" onClick={() => E.iade(o)}>İade</button>}
          </>}>
            <div className="detay-bilgi">
              <B e="Paket ücreti">{tl(h.paket)}</B><B e="Ek kalemler">{tl(h.ucret - h.paket)}</B><B e="Toplam">{tl(h.ucret)}</B>
              <B e="Ödenen">{tl(h.odenen)}</B><B e="Kalan"><b>{tl(h.kalan)}</b></B>
              <B e="Geciken">{h.geciken ? <span className="rozet kirmizi">{tl(h.geciken)}</span> : 'Yok'}</B>
            </div>
            {h.kalemler.length > 0 && <>
              <h3>Ek ücretler ve indirimler</h3>
              <div className="tablo-kutu"><table><tbody>{h.kalemler.map((k) => (
                <tr key={k.id} className={k.iptal ? 'iptal' : ''}><td>{tarih(k.tarih)}</td><td>{v.tanimlar.kalemTurleri[k.tur]}<div className="kucuk soluk">{k.aciklama}</div></td>
                  <td className="sayi-h">{k.tutar < 0 ? '-' : ''}{tl(Math.abs(k.tutar))}</td><td>{!k.iptal && y.hak('kasa') && <button className="dugme kucuk kirmizi" onClick={() => E.kalemIptal(k.id)}>Kaldır</button>}</td></tr>
              ))}</tbody></table></div>
            </>}
            <h3>Taksitler</h3>
            {h.taksitler.length ? <div className="tablo-kutu"><table><tbody>{h.taksitler.map((t, i) => (
              <tr key={i}><td>{tarih(t.vade)}</td><td className="kucuk soluk">{t.ek || ''}</td><td className="sayi-h">{tl(t.tutar)}</td><td><Rozet tablo={DURUM_TAKSIT} d={t.durum} /></td></tr>
            ))}</tbody></table></div> : <Bos>Taksit yok.</Bos>}
            <h3>Ödemeler</h3>
            {odemeler.length ? <div className="tablo-kutu"><table><tbody>{odemeler.map((x) => (
              <tr key={x.id} className={x.iptal ? 'iptal' : ''}>
                <td>{tarih(x.tarih)}<div className="kucuk soluk">{x.makbuz_no}</div></td>
                <td>{x.tur === 'iade' ? <span className="rozet sari">İade</span> : null} {YONTEM[x.yontem] || x.yontem}<div className="kucuk soluk">{x.aciklama} · {x.kaydeden}</div></td>
                <td className="sayi-h">{x.tur === 'iade' ? '-' : ''}{tl(x.tutar)}</td>
                <td><div className="dugmeler">
                  {!x.iptal && <button className="dugme kucuk" onClick={() => makbuzYazdir(v, x, o)}>Makbuz</button>}
                  {!x.iptal && y.hak('kasa') && <button className="dugme kucuk kirmizi" onClick={() => E.odemeIptal(x.id)}>İptal</button>}
                  {x.iptal ? <span className="kucuk">{x.iptal_nedeni}</span> : null}
                </div></td>
              </tr>
            ))}</tbody></table></div> : <Bos>Ödeme yok.</Bos>}
          </Kart>
        )}
      </div>
      <Kart baslik="Direksiyon dersleri"><DersTablosu liste={dersler} tarihGoster ogrenciGoster={false} /></Kart>
    </>
  );
}

// Evrak listesi ve yükleme (karar 12). Dosyanın kendisi yalnız açılınca sunucudan istenir.
function EvrakKarti({ ogrenciId }: { ogrenciId: string }) {
  const y = useY();
  const { v } = y.b;
  const o = y.ogr(ogrenciId)!;
  const evraklar = (v.evraklar || []).filter((x) => x.ogrenci_id === ogrenciId);
  const turler = v.tanimlar.evrakTurleri || [];
  const yukle = (tur?: string) => pencere('Evrak yükle', [
    { ad: 'tur', etiket: 'Evrak türü', tip: 'select', secenekler: [...turler, 'Diğer'].map((t): [string, string] => [t, t]), deger: tur || turler[0] },
    { ad: 'dosya', etiket: 'Dosya (fotoğraf veya PDF, en fazla 5 MB)', tip: 'dosya', kabul: 'image/*,application/pdf', zorunlu: true },
    { tip: 'bilgi', html: 'Telefonda kamerayla doğrudan fotoğraf çekebilirsiniz.' },
  ], async (g) => {
    if (!g.dosya) throw new Error('Dosya seçin.');
    if (g.dosya.boyut > 5 * 1024 * 1024) throw new Error('Dosya 5 MB’den büyük olamaz.');
    await islem('evrak_yukle', { ogrenciId, tur: g.tur, ad: g.dosya.ad, veri: g.dosya.veri });
    await y.b.yenile();
    bildir('Evrak kaydedildi.', 'tamam');
  });
  const ac = async (id: string) => {
    const w = window.open('', '_blank');
    try {
      const r = await fetch(`/api/evrak?id=${encodeURIComponent(id)}`, { headers: { 'X-Firma': localStorage.getItem('dc_firma') || '' } });
      if (!r.ok) throw new Error((await r.json()).hata || 'Açılamadı');
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else window.open(url, '_blank');
    } catch (e) { w?.close(); bildir((e as Error).message, 'hata'); }
  };
  return (
    <Kart baslik="Evraklar" sag={y.hak('evrak') && <button className="dugme kucuk" onClick={() => yukle()}>+ Evrak yükle</button>}>
      {o.evrak && o.evrak.eksik.length > 0 && <div className="uyari-kutu">Eksik: {o.evrak.eksik.map((t) => <button key={t} className="rozet sari tikla" onClick={() => y.hak('evrak') && yukle(t)}>{t}</button>)}</div>}
      {o.evrak && o.evrak.eksik.length === 0 && <p className="rozet yesil">Evrak tamam</p>}
      {evraklar.length ? <ul className="liste">{evraklar.map((e) => (
        <li key={e.id}>
          <b>{e.tur}</b> · <button className="baglanti" onClick={() => ac(e.id)}>{e.ad}</button> <span className="soluk kucuk">{Math.round(e.boyut / 1024)} KB · {tarih(e.olusturma)} · {e.kaydeden}</span>
          {y.hak('evrak') && <button className="dugme kucuk kirmizi" onClick={() => onayla(`${e.tur} evrakı silinsin mi?`, async () => { await islem('evrak_sil', { id: e.id }); await y.b.yenile(); })}>Sil</button>}
        </li>
      ))}</ul> : <Bos>Yüklenmiş evrak yok.</Bos>}
    </Kart>
  );
}
