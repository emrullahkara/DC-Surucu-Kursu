// Sınavlar: bekleyen/sonuçlanan, sınav günü listesi ve MEBBİS'e girilecek bilgilerin Excel listesi.
import { useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { Bos, Kart, Rozet, Sayi } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import type { Sinav } from '../tipler';
import { DURUM_SINAV, SINAV_AD, csvIndir, tarih, whatsapp } from '../yardim';

export function Sinavlar(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const [gun, setGun] = useState('');
  const l = y.subeSuz(v.sinavlar);
  const bekleyen = l.filter((s) => s.sonuc === 'bekliyor').sort((a, b) => (a.tarih > b.tarih ? 1 : -1));
  const biten = l.filter((s) => s.sonuc !== 'bekliyor').slice(0, 200);
  const oran = (tur: string) => {
    const x = biten.filter((s) => s.tur === tur && ['gecti', 'kaldi'].includes(s.sonuc));
    return x.length ? `%${Math.round((100 * x.filter((s) => s.sonuc === 'gecti').length) / x.length)}` : '—';
  };
  const gunler = [...new Set(bekleyen.map((s) => s.tarih))];
  const sinavGunu = gun ? bekleyen.filter((s) => s.tarih === gun) : [];

  // Sınav günü listesi: kimin, hangi saatte, hangi sınava gireceği (MEBBİS'e elle girilecek bilgilerle).
  const listeIndir = (liste: Sinav[], ad: string) => csvIndir(ad, [
    ['Tarih', 'Saat', 'Sınav', 'Hak', 'T.C. kimlik no', 'Ad', 'Soyad', 'Sınıf', 'Doğum tarihi', 'Telefon', 'Şube', 'Direksiyon ders', 'Teorik ders', 'Yer'],
    ...liste.map((s) => {
      const o = y.ogr(s.ogrenci_id);
      return [tarih(s.tarih), s.saat, SINAV_AD[s.tur], s.deneme, o?.tc || '', o?.ad || '', o?.soyad || '', o?.sinif || '', tarih(o?.dogum), o?.telefon || '', y.subeAd(s.sube_id), o?.dersler.direksiyon ?? '', o?.dersler.teorik ?? '', s.yer];
    }),
  ]);
  const Satir = ({ s }: { s: Sinav }) => (
    <tr>
      <td>{tarih(s.tarih)} {s.saat}<div className="kucuk soluk">{s.yer}</div></td>
      <td><button className="baglanti" onClick={() => y.b.git('ogrenci', s.ogrenci_id)}>{y.ogrAd(s.ogrenci_id)}</button></td>
      <td>{SINAV_AD[s.tur]}<div className="kucuk soluk">{s.deneme}. hak</div></td>
      {y.subeSutunu && <td>{y.subeAd(s.sube_id)}</td>}
      <td><Rozet tablo={DURUM_SINAV} d={s.sonuc} />{s.puan !== null && <b> {s.puan}</b>}</td>
      <td><div className="dugmeler">
        {y.hak('sinav') && <button className="dugme kucuk" onClick={() => E.sinavSonuc(s)}>Sonuç gir</button>}
        {y.hak('sinav') && s.sonuc === 'bekliyor' && <button className="dugme kucuk" onClick={() => E.sinavDuzenle(s)}>Tarih</button>}
        {s.sonuc === 'bekliyor' && y.ogr(s.ogrenci_id)?.telefon && <a className="dugme kucuk" target="_blank" rel="noopener noreferrer"
          href={whatsapp(y.ogr(s.ogrenci_id)!.telefon, `Merhaba ${y.ogr(s.ogrenci_id)!.ad}, ${SINAV_AD[s.tur]} tarihiniz: ${tarih(s.tarih)} ${s.saat}${s.yer ? `, ${s.yer}` : ''}. Kimliğinizi yanınızda bulundurun. ${y.b.v.kurum.ad}`)}>Hatırlat</a>}
      </div></td>
    </tr>
  );
  const Tablo = ({ x }: { x: Sinav[] }) => x.length ? <div className="tablo-kutu"><table><tbody>{x.map((s) => <Satir key={s.id} s={s} />)}</tbody></table></div> : <Bos />;
  return (
    <>
      <div className="sayilar">
        <Sayi etiket="Sonuç bekleyen" deger={bekleyen.length} />
        <Sayi etiket="E-sınav geçme oranı" deger={oran('e_sinav')} />
        <Sayi etiket="Direksiyon geçme oranı" deger={oran('direksiyon')} />
      </div>
      <Kart baslik={<h1>Yaklaşan ve sonuç bekleyen</h1>} sag={<>
        {y.hak('rapor') && <button className="dugme" onClick={() => listeIndir(bekleyen, `sinav-listesi-${v.bugun}.csv`)}>MEBBİS için Excel</button>}
        {y.hak('sinav') && <button className="dugme ana" onClick={() => E.sinavEkle()}>+ Sınava yaz</button>}
      </>}>
        {gunler.length > 0 && (
          <div className="suzgec">
            <select value={gun} onChange={(e) => setGun(e.target.value)}>
              <option value="">Sınav günü listesi için gün seçin</option>
              {gunler.map((g) => <option key={g} value={g}>{tarih(g)} ({bekleyen.filter((s) => s.tarih === g).length} kişi)</option>)}
            </select>
            {gun && <button className="dugme" onClick={() => window.print()}>Yazdır</button>}
            {gun && <button className="dugme" onClick={() => listeIndir(sinavGunu, `sinav-gunu-${gun}.csv`)}>Excel</button>}
          </div>
        )}
        <Tablo x={gun ? sinavGunu : bekleyen} />
      </Kart>
      <Kart baslik="Sonuçlanan sınavlar"><Tablo x={biten} /></Kart>
    </>
  );
}
