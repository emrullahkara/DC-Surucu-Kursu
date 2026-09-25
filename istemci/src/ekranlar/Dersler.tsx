// Direksiyon dersleri: günlük liste ve eğitmen takvimi (boş kutuya tıklayınca ders planlanır).
import { useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { DersTablosu } from '../bilesenler/DersTablosu';
import { Kart } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import { gunAdi, gunEkle, tarih } from '../yardim';

const SAATLER = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);
const dk = (s: string) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };

export function Dersler(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const [gun, setGun] = useState(v.bugun);
  const [gorunum, setGorunum] = useState<'liste' | 'takvim'>(v.ben.rol === 'egitmen' ? 'liste' : 'takvim');
  const liste = y.subeSuz(v.dersler).filter((d) => d.tarih === gun).sort((a, b) => (a.saat > b.saat ? 1 : -1));
  const planYetki = y.hak('ders') || v.ben.rol === 'egitmen';
  const subeId = y.b.sube || v.ben.sube_id || '';
  // Takvim satırları: seçili şubenin eğitmenleri (+ o gün görevli olanlar) ya da bütün eğitmenler.
  const egitmenler = v.personel.filter((p) => ['egitmen', 'sube_muduru'].includes(p.rol) && (p.aktif ?? 1)
    && (!subeId || p.sube_id === subeId || v.gorevlendirmeler.some((g) => g.kullanici_id === p.id && g.sube_id === subeId && g.bas <= gun && g.bit >= gun))
    && (p.rol === 'egitmen' || liste.some((d) => d.egitmen_id === p.id)));
  const hucre = (egitmenId: string, saat: string) => liste.find((d) => d.egitmen_id === egitmenId && d.durum !== 'iptal' && d.saat && dk(d.saat) < dk(saat) + 60 && dk(saat) < dk(d.saat) + d.sure_dk);

  return (
    <Kart baslik={<h1>Direksiyon dersleri</h1>} sag={<>
      <div className="secim-grup">
        <button className={'dugme kucuk' + (gorunum === 'takvim' ? ' secili-d' : '')} onClick={() => setGorunum('takvim')}>Eğitmen takvimi</button>
        <button className={'dugme kucuk' + (gorunum === 'liste' ? ' secili-d' : '')} onClick={() => setGorunum('liste')}>Liste</button>
      </div>
      {planYetki && <button className="dugme ana" onClick={() => E.dersPlanla(undefined, { tarih: gun })}>+ Ders planla</button>}
      {y.hak('ders') && <button className="dugme" onClick={() => E.topluPlan()}>Toplu planla</button>}
      {y.hak('ders') && <button className="dugme" onClick={() => E.topluAktar({ bas: gun })} title="Eğitmen hastalandı ya da araç arızalandı">Toplu aktar</button>}
    </>}>
      <div className="suzgec gun-sec">
        <button className="dugme" onClick={() => setGun(gunEkle(gun, -1))}>←</button>
        <input type="date" value={gun} onChange={(e) => e.target.value && setGun(e.target.value)} />
        <button className="dugme" onClick={() => setGun(gunEkle(gun, 1))}>→</button>
        {gun !== v.bugun && <button className="dugme" onClick={() => setGun(v.bugun)}>Bugün</button>}
      </div>
      <p className="soluk kucuk">{tarih(gun)} {gunAdi(gun)} · {liste.filter((d) => d.durum !== 'iptal').length} ders · {liste.filter((d) => d.durum === 'tamamlandi').length} tamamlandı · {liste.filter((d) => d.durum === 'gelmedi').length} gelmedi</p>
      {gorunum === 'liste' || !egitmenler.length ? <DersTablosu liste={liste} /> : (
        <div className="tablo-kutu">
          <table className="takvim">
            <thead><tr><th>Eğitmen</th>{SAATLER.map((s) => <th key={s}>{s}</th>)}</tr></thead>
            <tbody>
              {egitmenler.map((e) => (
                <tr key={e.id}>
                  <th>{e.ad}{e.sube_id !== subeId && subeId ? <div className="kucuk soluk">görevli</div> : y.cokSube && !subeId ? <div className="kucuk soluk">{y.subeAd(e.sube_id)}</div> : null}</th>
                  {SAATLER.map((s) => {
                    const d = hucre(e.id, s);
                    if (d) return (
                      <td key={s} className={'dolu ' + d.durum} onClick={() => y.b.git('ogrenci', d.ogrenci_id)} title={`${d.saat} ${y.ogrAd(d.ogrenci_id)}`}>
                        <div className="kucuk"><b>{d.saat === s ? y.ogrAd(d.ogrenci_id) : '↳'}</b></div>{d.saat === s && <div className="kucuk soluk">{y.aracAd(d.arac_id)}</div>}
                      </td>
                    );
                    return <td key={s} className={planYetki ? 'bos-hucre' : ''} onClick={() => planYetki && E.dersPlanla(undefined, { tarih: gun, saat: s, egitmenId: e.id })} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="soluk kucuk">Boş kutuya tıklayarak o eğitmene o saatte ders planlayabilirsiniz. Renkler: yeşil tamamlandı, kırmızı gelmedi, mavi planlı.</p>
        </div>
      )}
    </Kart>
  );
}
