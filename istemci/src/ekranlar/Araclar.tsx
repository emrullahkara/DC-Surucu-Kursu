// Araçlar: muayene, sigorta, kasko, bakım tarihleri ve kilometre; tarihi yaklaşanlar uyarılır (karar 22).
import { useY, type EkranP } from '../baglam';
import { islem } from '../api';
import { Bos, Kart, bildir, pencere } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import type { Arac } from '../tipler';
import { gunFarki, tarih, tl } from '../yardim';

const TARIHLER = [['muayene', 'Muayene'], ['sigorta', 'Trafik sigortası'], ['kasko', 'Kasko'], ['bakim', 'Bakım']] as const;

export function Araclar(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const araclar = y.subeSuz(v.araclar);
  const Tarih = ({ g }: { g?: string }) => {
    if (!g) return <span className="soluk">—</span>;
    const f = gunFarki(v.bugun, g);
    return <>{tarih(g)}{f < 0 ? <div><span className="rozet kirmizi">{-f} gün geçti</span></div> : f <= 15 ? <div><span className="rozet sari">{f} gün kaldı</span></div> : null}</>;
  };
  const form = (a?: Arac) => pencere(a ? `Araç · ${a.plaka}` : 'Araç ekle', [
    ...(!a && y.cokSube || (a && v.ben.rol === 'yonetici') ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select' as const, secenekler: y.subeSecenek(), deger: a?.sube_id || y.varsayilanSube() }] : []),
    ...(a ? [] : [{ ad: 'plaka', etiket: 'Plaka', zorunlu: true }]),
    { ad: 'model', etiket: 'Marka / model', deger: a?.model },
    { ad: 'sinif', etiket: 'Sınıf', tip: 'select', secenekler: y.sinifSecenek(), deger: a?.sinif || 'B' },
    { ad: 'km', etiket: 'Kilometre', tip: 'number', deger: a?.km ?? '' },
    { ad: 'muayene', etiket: 'Muayene bitiş', tip: 'date', deger: a?.muayene },
    { ad: 'sigorta', etiket: 'Trafik sigortası bitiş', tip: 'date', deger: a?.sigorta },
    { ad: 'kasko', etiket: 'Kasko bitiş', tip: 'date', deger: a?.kasko },
    { ad: 'bakim', etiket: 'Sonraki bakım tarihi', tip: 'date', deger: a?.bakim },
    { ad: 'bakimKm', etiket: 'Sonraki bakım km', tip: 'number', deger: a?.bakim_km ?? '' },
    { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: a?.notlar },
    ...(a ? [{ ad: 'aktif', etiket: 'Kullanımda', tip: 'onay' as const, deger: !!a.aktif }] : []),
  ], async (g) => {
    await islem(a ? 'arac_duzenle' : 'arac_ekle', a ? { id: a.id, ...g } : { ...g, subeId: g.subeId || y.varsayilanSube() });
    await y.b.yenile(); bildir('Kaydedildi.', 'tamam');
  }, { ikili: true });
  const kmGir = (a: Arac) => pencere(`Kilometre · ${a.plaka}`, [{ ad: 'km', etiket: 'Güncel kilometre', tip: 'number', deger: a.km ?? '', zorunlu: true }],
    async (g) => { await islem('arac_duzenle', { id: a.id, km: g.km }); await y.b.yenile(); });
  const giderler = (id: string) => y.subeSuz(v.giderler).filter((g) => g.arac_id === id && !g.iptal);
  return (
    <Kart baslik={<h1>Araçlar</h1>} sag={<button className="dugme ana" onClick={() => form()}>+ Araç ekle</button>}>
      {araclar.length ? <div className="tablo-kutu"><table>
        <thead><tr><th>Plaka</th>{y.subeSutunu && <th>Şube</th>}<th>Km</th>{TARIHLER.map(([, e]) => <th key={e}>{e}</th>)}<th>Bu ay ders</th>{v.giderler && <th className="sayi-h">Gider</th>}<th></th></tr></thead>
        <tbody>{araclar.map((a) => {
          const buAy = v.dersler.filter((d) => d.arac_id === a.id && d.durum === 'tamamlandi' && d.tarih.slice(0, 7) === v.bugun.slice(0, 7)).length;
          const bakimKmYakin = a.bakim_km && a.km && a.bakim_km - a.km <= 1000;
          return (
            <tr key={a.id} className={a.aktif ? '' : 'iptal'}>
              <td><b>{a.plaka}</b><div className="kucuk soluk">{a.model} · {a.sinif}</div>{a.notlar && <div className="kucuk soluk">{a.notlar}</div>}</td>
              {y.subeSutunu && <td>{y.subeAd(a.sube_id)}</td>}
              <td>{a.km ? a.km.toLocaleString('tr-TR') : '—'}{bakimKmYakin && <div><span className="rozet sari">bakıma {(a.bakim_km! - a.km!).toLocaleString('tr-TR')} km</span></div>}</td>
              {TARIHLER.map(([k]) => <td key={k}><Tarih g={a[k]} /></td>)}
              <td>{buAy}</td>
              {v.giderler && <td className="sayi-h">{tl(giderler(a.id).reduce((x, g) => x + g.tutar, 0))}</td>}
              <td><div className="dugmeler">
                <button className="dugme kucuk" onClick={() => kmGir(a)}>Km</button>
                {y.hak('kasa') && <button className="dugme kucuk" onClick={() => E.giderEkle(a.id)}>Gider</button>}
                <button className="dugme kucuk" onClick={() => form(a)}>Düzenle</button>
              </div></td>
            </tr>
          );
        })}</tbody>
      </table></div> : <Bos>Araç yok.</Bos>}
      <p className="soluk kucuk">Tarihi 15 günden az kalan ya da geçen işlemler Özet ekranında da uyarı olarak görünür.</p>
    </Kart>
  );
}
