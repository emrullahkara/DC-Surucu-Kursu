// Adaylar: bilgi almak için arayan ya da gelen kişiler, internetten ön kayıt başvuruları.
// Tekrar aranacak günü gelenler üstte; aday kayıt olunca öğrenci kaydına bağlanır.
import { useMemo, useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { Bos, Kart, Rozet, Sayi, bildir } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import type { Aday } from '../tipler';
import { excelIndir, kucukHarf, tarih, telLink, tl, whatsapp, zamanYaz } from '../yardim';

const DURUM: Record<string, [string, string]> = { yeni: ['Yeni', 'sari'], gorusuluyor: ['Görüşülüyor', ''], kayit: ['Kayıt oldu', 'yesil'], vazgecti: ['Vazgeçti', 'gri'] };

export function Adaylar(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const [durum, setDurum] = useState('acik');
  const [ara, setAra] = useState('');
  const [acik, setAcik] = useState<string | null>(null);
  const tum = (v.adaylar || []).filter((a) => !y.b.sube || !a.sube_id || a.sube_id === y.b.sube);
  const liste = useMemo(() => {
    const q = kucukHarf(ara.trim());
    return tum.filter((a) => (durum === 'acik' ? ['yeni', 'gorusuluyor'].includes(a.durum) : !durum || a.durum === durum)
      && (!q || kucukHarf(`${a.ad} ${a.soyad} ${a.telefon}`).includes(q)))
      .sort((a, b) => {
        const ga = a.sonraki_arama && a.sonraki_arama <= v.bugun ? 0 : 1, gb = b.sonraki_arama && b.sonraki_arama <= v.bugun ? 0 : 1;
        return ga - gb || (a.sonraki_arama || '9') .localeCompare(b.sonraki_arama || '9') || b.olusturma.localeCompare(a.olusturma);
      });
  }, [tum, durum, ara, v.bugun]);
  const bugunAranacak = tum.filter((a) => ['yeni', 'gorusuluyor'].includes(a.durum) && a.sonraki_arama && a.sonraki_arama <= v.bugun).length;
  const buAy = tum.filter((a) => a.olusturma.slice(0, 7) === v.bugun.slice(0, 7));
  const donusum = buAy.length ? Math.round((100 * buAy.filter((a) => a.durum === 'kayit').length) / buAy.length) : 0;
  const onKayitAdresi = `${location.origin}/k/${encodeURIComponent(localStorage.getItem('dc_firma') || '')}/on-kayit`;
  const excel = () => excelIndir(`adaylar-${v.bugun}.xlsx`, [
    ['Başvuru', 'Ad', 'Soyad', 'Telefon', 'Sınıf', 'Kaynak', 'Verilen fiyat', 'Durum', 'Tekrar arama', 'Şube', 'Not'],
    ...liste.map((a) => [tarih(a.olusturma), a.ad, a.soyad, a.telefon, a.sinif, a.kaynak, a.fiyat / 100, DURUM[a.durum][0], tarih(a.sonraki_arama), y.subeAd(a.sube_id), a.notlar]),
  ]);
  const Satir = ({ a }: { a: Aday }) => {
    const gecikti = a.sonraki_arama && a.sonraki_arama <= v.bugun && ['yeni', 'gorusuluyor'].includes(a.durum);
    return (
      <>
        <tr className="tikla" onClick={() => setAcik(acik === a.id ? null : a.id)}>
          <td><b>{a.ad} {a.soyad}</b>{a.on_kayit ? <> <span className="rozet">İnternetten</span></> : null}<div className="kucuk soluk">{a.telefon}</div></td>
          <td>{a.sinif || '—'}<div className="kucuk soluk">{a.kaynak}</div></td>
          {y.subeSutunu && <td>{y.subeAd(a.sube_id) || 'Belirsiz'}</td>}
          <td className="sayi-h">{a.fiyat ? tl(a.fiyat) : '—'}</td>
          <td>{a.sonraki_arama ? <span className={gecikti ? 'rozet kirmizi' : 'kucuk'}>{tarih(a.sonraki_arama)}</span> : '—'}</td>
          <td><Rozet tablo={DURUM} d={a.durum} /></td>
          <td onClick={(e) => e.stopPropagation()}><div className="dugmeler">
            <a className="dugme kucuk" href={telLink(a.telefon)}>Ara</a>
            <a className="dugme kucuk" target="_blank" rel="noopener noreferrer" href={whatsapp(a.telefon, `Merhaba ${a.ad}, ${v.kurum.ad} olarak sürücü kursu başvurunuzla ilgili yazıyoruz.`)}>WhatsApp</a>
            {a.durum !== 'kayit' && <button className="dugme kucuk" onClick={() => E.adayNot(a)}>Not</button>}
            {a.durum !== 'kayit' && <button className="dugme kucuk ana" onClick={() => E.adayKayit(a)}>Kayıt yap</button>}
            {a.durum === 'kayit' && a.ogrenci_id && <button className="dugme kucuk" onClick={() => y.b.git('ogrenci', a.ogrenci_id!)}>Öğrenci</button>}
          </div></td>
        </tr>
        {acik === a.id && (
          <tr><td colSpan={7}>
            {a.notlar && <p className="bilgi">{a.notlar}</p>}
            {a.notlarListesi.length ? <ul className="liste">{a.notlarListesi.map((n) => <li key={n.id}><span className="kucuk soluk">{zamanYaz(n.zaman)} · {n.kaydeden}</span> {n.metin}</li>)}</ul> : <p className="soluk kucuk">Görüşme notu yok.</p>}
            <div className="dugmeler"><button className="dugme kucuk" onClick={() => E.aday(a)}>Düzenle</button><span className="soluk kucuk">Kaydeden: {a.kaydeden} · {zamanYaz(a.olusturma)}</span></div>
          </td></tr>
        )}
      </>
    );
  };
  return (
    <>
      <div className="sayilar">
        <Sayi etiket="Bugün aranacak" deger={bugunAranacak} uyari={bugunAranacak > 0} onClick={() => setDurum('acik')} />
        <Sayi etiket="Açık aday" deger={tum.filter((a) => ['yeni', 'gorusuluyor'].includes(a.durum)).length} />
        <Sayi etiket="Bu ay başvuru" deger={buAy.length} alt={`kayda dönüşen %${donusum}`} />
        <Sayi etiket="İnternetten (bu ay)" deger={buAy.filter((a) => a.on_kayit).length} />
      </div>
      <Kart baslik={<h1>Adaylar</h1>} sag={<>
        {y.hak('rapor') && <button className="dugme" onClick={excel}>Excel</button>}
        <button className="dugme ana" onClick={() => E.aday()}>+ Aday</button>
      </>}>
        <div className="suzgec">
          <input type="search" placeholder="Ad veya telefon ile ara" value={ara} onChange={(e) => setAra(e.target.value)} />
          <select value={durum} onChange={(e) => setDurum(e.target.value)}>
            <option value="acik">Açık (yeni ve görüşülen)</option><option value="">Hepsi</option>
            {Object.entries(DURUM).map(([k, [e]]) => <option key={k} value={k}>{e}</option>)}
          </select>
        </div>
        <div className="tablo-kutu"><table>
          <thead><tr><th>Aday</th><th>Sınıf / kaynak</th>{y.subeSutunu && <th>Şube</th>}<th className="sayi-h">Verilen fiyat</th><th>Tekrar ara</th><th>Durum</th><th></th></tr></thead>
          <tbody>{liste.length ? liste.map((a) => <Satir key={a.id} a={a} />) : <tr><td colSpan={7}><Bos>Aday yok.</Bos></td></tr>}</tbody>
        </table></div>
      </Kart>
      <Kart baslik="İnternetten ön kayıt formu">
        {v.ayarlar ? (v.ayarlar.onKayit.acik
          ? <><p className="kucuk">Bu adresi kursunuzun web sitesine, sosyal medya hesaplarına ya da reklamlarınıza koyun. Gelen başvurular buraya düşer ve size anında bildirilir.</p>
            <p><code>{onKayitAdresi}</code> <button className="dugme kucuk" onClick={() => navigator.clipboard?.writeText(onKayitAdresi).then(() => bildir('Adres kopyalandı.', 'tamam'))}>Kopyala</button> <a className="dugme kucuk" href={onKayitAdresi} target="_blank" rel="noopener noreferrer">Aç</a></p></>
          : <p className="soluk kucuk">Form kapalı. Ayarlar &gt; İnternetten ön kayıt bölümünden açabilirsiniz.</p>)
          : <p className="soluk kucuk">İnternetten ön kayıt formunu yönetici açar.</p>}
      </Kart>
    </>
  );
}
