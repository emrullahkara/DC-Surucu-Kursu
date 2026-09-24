// Direksiyon derslerinin listesi (özet, ders ve öğrenci ekranlarında ortak).
import { useY } from '../baglam';
import { eylemler } from '../eylemler';
import type { Ders } from '../tipler';
import { DERS_AD, DURUM_DERS, tarih } from '../yardim';
import { Bos, IsDugmesi, Rozet } from './ortak';

export function DersTablosu({ liste, tarihGoster = false, ogrenciGoster = true }: { liste: Ders[]; tarihGoster?: boolean; ogrenciGoster?: boolean }) {
  const y = useY();
  const E = eylemler(y.b);
  const ben = y.b.v.ben;
  if (!liste.length) return <Bos />;
  return (
    <div className="tablo-kutu">
      <table>
        <thead><tr>
          {tarihGoster && <th>Tarih</th>}<th>Saat</th>{ogrenciGoster && <th>Öğrenci</th>}<th>Tür</th><th>Eğitmen</th><th>Araç</th>
          {y.subeSutunu && <th>Şube</th>}<th>Durum</th><th></th>
        </tr></thead>
        <tbody>
          {liste.map((d) => {
            const kendi = d.egitmen_id === ben.id;
            const sonucVer = d.durum === 'planli' && (kendi || y.hak('ders'));
            return (
              <tr key={d.id}>
                {tarihGoster && <td>{tarih(d.tarih)}</td>}
                <td>{d.saat}<div className="kucuk soluk">{d.sure_dk} dk</div></td>
                {ogrenciGoster && <td><button className="baglanti" onClick={() => y.b.git('ogrenci', d.ogrenci_id)}>{y.ogrAd(d.ogrenci_id)}</button></td>}
                <td>{DERS_AD[d.tur]}</td><td>{y.kisiAd(d.egitmen_id)}</td><td>{y.aracAd(d.arac_id)}</td>
                {y.subeSutunu && <td>{y.subeAd(d.sube_id)}</td>}
                <td><Rozet tablo={DURUM_DERS} d={d.durum} />{d.notu && <div className="kucuk soluk">{d.notu}</div>}
                  {d.konum && <KonumBag konum={d.konum} />}</td>
                <td>
                  <div className="dugmeler">
                    {sonucVer && <IsDugmesi className="dugme yesil kucuk" is={() => E.dersTamam(d)}>Tamamlandı</IsDugmesi>}
                    {sonucVer && <button className="dugme kucuk kirmizi" onClick={() => E.dersGelmedi(d)}>Gelmedi</button>}
                    {!sonucVer && y.hak('ders') && <button className="dugme kucuk" onClick={() => E.dersDurum(d)}>Değiştir</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function KonumBag({ konum }: { konum: string }) {
  try {
    const k = JSON.parse(konum) as { enlem: number; boylam: number; hassasiyet: number };
    return <div className="kucuk"><a href={`https://www.openstreetmap.org/?mlat=${k.enlem}&mlon=${k.boylam}#map=17/${k.enlem}/${k.boylam}`} target="_blank" rel="noopener noreferrer">📍 Konum ({k.hassasiyet} m)</a></div>;
  } catch { return null; }
}
