// Raporlar: şube karşılaştırması ve şubeler toplamı, geciken alacak yaşları, eğitmen ders ve prim raporu.
import { useCallback, useEffect, useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { api } from '../api';
import { Bos, Kart, Sayi, bildir } from '../bilesenler/ortak';
import { YONTEM, ayBasi, csvIndir, gunEkle, tl, tlCsv } from '../yardim';

interface Satir {
  sube_id?: string; sube: string; yeniKayit: number; aktifOgrenci: number; tamamlananDers: number; gelmeyen: number;
  eSinav: { gecen: number; giren: number }; direksiyonSinav: { gecen: number; giren: number };
  tahsilat: number; gider: number; net: number; alacak: number; geciken: number; yontemler: Record<string, number>; tedarikciBorcu: number;
}
interface Rapor {
  bas: string; bit: string; satirlar: Satir[]; toplam: Satir; alacakYaslari: Record<string, number>; prim: { direksiyon: number; teorik: number };
  egitmenler: { id: string; ad: string; sube_id: string; direksiyon: number; teorik: number; gelmeyen: number; dakika: number; prim: number }[];
}
const oran = (x: { gecen: number; giren: number }) => (x.giren ? `${x.gecen}/${x.giren} (%${Math.round((100 * x.gecen) / x.giren)})` : '—');

export function Raporlar(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const [bas, setBas] = useState(ayBasi(v.bugun));
  const [bit, setBit] = useState(v.bugun);
  const [r, setR] = useState<Rapor | null>(null);
  const getir = useCallback(async () => {
    try { setR(await api<Rapor>(`/api/rapor?bas=${bas}&bit=${bit}`)); } catch (e) { bildir((e as Error).message, 'hata'); }
  }, [bas, bit]);
  useEffect(() => { getir(); }, [getir, v]);
  const hazir = (g: 'bu-ay' | 'gecen-ay' | 'bu-yil' | '30') => {
    if (g === 'bu-ay') { setBas(ayBasi(v.bugun)); setBit(v.bugun); }
    if (g === 'gecen-ay') { const s = gunEkle(ayBasi(v.bugun), -1); setBas(ayBasi(s)); setBit(s); }
    if (g === 'bu-yil') { setBas(v.bugun.slice(0, 4) + '-01-01'); setBit(v.bugun); }
    if (g === '30') { setBas(gunEkle(v.bugun, -30)); setBit(v.bugun); }
  };
  const excel = () => {
    if (!r) return;
    const s = (x: Satir) => [x.sube, x.yeniKayit, x.aktifOgrenci, x.tamamlananDers, x.gelmeyen, x.eSinav.gecen, x.eSinav.giren, x.direksiyonSinav.gecen, x.direksiyonSinav.giren, tlCsv(x.tahsilat), tlCsv(x.gider), tlCsv(x.net), tlCsv(x.alacak), tlCsv(x.geciken), tlCsv(x.tedarikciBorcu)];
    csvIndir(`sube-raporu-${r.bas}-${r.bit}.csv`, [
      ['Şube', 'Yeni kayıt', 'Aktif öğrenci', 'Yapılan ders', 'Gelmeyen', 'E-sınav geçen', 'E-sınava giren', 'Direksiyon geçen', 'Direksiyona giren', 'Tahsilat', 'Gider', 'Net', 'Toplam alacak', 'Geciken', 'Firmalara borç'],
      ...r.satirlar.map(s), s(r.toplam), [], ['Eğitmen', 'Şube', 'Direksiyon', 'Teorik', 'Gelmeyen', 'Saat', 'Prim'],
      ...r.egitmenler.map((e) => [e.ad, y.subeAd(e.sube_id), e.direksiyon, e.teorik, e.gelmeyen, (e.dakika / 60).toFixed(1).replace('.', ','), tlCsv(e.prim)]),
    ]);
  };
  const Tr = ({ x, toplam = false }: { x: Satir; toplam?: boolean }) => (
    <tr className={toplam ? 'toplam' : ''}>
      <td>{x.sube}</td><td className="sayi-h">{x.yeniKayit}</td><td className="sayi-h">{x.aktifOgrenci}</td><td className="sayi-h">{x.tamamlananDers}</td><td className="sayi-h">{x.gelmeyen}</td>
      <td className="sayi-h">{oran(x.eSinav)}</td><td className="sayi-h">{oran(x.direksiyonSinav)}</td>
      <td className="sayi-h">{tl(x.tahsilat)}</td><td className="sayi-h">{tl(x.gider)}</td><td className="sayi-h">{tl(x.net)}</td>
      <td className="sayi-h">{tl(x.alacak)}</td><td className="sayi-h">{tl(x.geciken)}</td>
    </tr>
  );
  const enFazla = r ? Math.max(1, ...r.satirlar.map((x) => x.tahsilat)) : 1;
  return (
    <>
      <Kart baslik={<h1>Raporlar</h1>} sag={<><button className="dugme" onClick={excel}>Excel</button><button className="dugme" onClick={() => window.print()}>Yazdır</button></>}>
        <div className="suzgec">
          <label className="alan"><span>Başlangıç</span><input type="date" value={bas} onChange={(e) => setBas(e.target.value)} /></label>
          <label className="alan"><span>Bitiş</span><input type="date" value={bit} onChange={(e) => setBit(e.target.value)} /></label>
          <div className="secim-grup">
            <button className="dugme kucuk" onClick={() => hazir('bu-ay')}>Bu ay</button><button className="dugme kucuk" onClick={() => hazir('gecen-ay')}>Geçen ay</button>
            <button className="dugme kucuk" onClick={() => hazir('30')}>Son 30 gün</button><button className="dugme kucuk" onClick={() => hazir('bu-yil')}>Bu yıl</button>
          </div>
        </div>
        {!r ? <Bos>Yükleniyor…</Bos> : (
          <>
            <div className="sayilar">
              <Sayi etiket="Tahsilat" deger={tl(r.toplam.tahsilat)} alt={Object.entries(r.toplam.yontemler).map(([k, t]) => `${YONTEM[k] || k}: ${tl(t)}`).join(' · ')} />
              <Sayi etiket="Gider" deger={tl(r.toplam.gider)} />
              <Sayi etiket="Net" deger={tl(r.toplam.net)} />
              <Sayi etiket="Toplam alacak (bugün)" deger={tl(r.toplam.alacak)} alt={`geciken ${tl(r.toplam.geciken)}`} uyari={r.toplam.geciken > 0} />
              <Sayi etiket="Yeni kayıt" deger={r.toplam.yeniKayit} />
              <Sayi etiket="Yapılan direksiyon dersi" deger={r.toplam.tamamlananDers} alt={`${r.toplam.gelmeyen} gelmedi`} />
            </div>
            <h2>Şube karşılaştırması</h2>
            <div className="tablo-kutu"><table>
              <thead><tr><th>Şube</th><th className="sayi-h">Yeni kayıt</th><th className="sayi-h">Aktif</th><th className="sayi-h">Ders</th><th className="sayi-h">Gelmeyen</th>
                <th className="sayi-h">E-sınav geçen</th><th className="sayi-h">Direksiyon geçen</th><th className="sayi-h">Tahsilat</th><th className="sayi-h">Gider</th>
                <th className="sayi-h">Net</th><th className="sayi-h">Alacak</th><th className="sayi-h">Geciken</th></tr></thead>
              <tbody>{r.satirlar.map((x) => <Tr key={x.sube_id} x={x} />)}{r.satirlar.length > 1 && <Tr x={r.toplam} toplam />}</tbody>
            </table></div>
            {r.satirlar.length > 1 && (
              <div className="cubuklar" aria-label="Şubelere göre tahsilat">
                {r.satirlar.map((x) => (
                  <div key={x.sube_id} className="cubuk-satir">
                    <span className="cubuk-ad">{x.sube}</span>
                    <span className="cubuk-kutu"><progress max={enFazla} value={Math.max(0, x.tahsilat)} /></span>
                    <span className="cubuk-deger">{tl(x.tahsilat)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="soluk kucuk">Aktif öğrenci, alacak ve geciken bugünkü durumu gösterir; diğer sütunlar seçilen tarih aralığına göredir.</p>
          </>
        )}
      </Kart>
      {r && (
        <div className="izgara">
          <Kart baslik="Geciken alacağın yaşı">
            <table><tbody>{Object.entries(r.alacakYaslari).map(([k, t]) => <tr key={k}><td>{k} gün</td><td className="sayi-h">{tl(t)}</td></tr>)}</tbody></table>
            <p className="soluk kucuk">Öğrencinin ödenmemiş en eski taksidinin vadesinden bugüne geçen gün.</p>
          </Kart>
          <Kart baslik="Eğitmen dersleri ve prim">
            {r.egitmenler.length ? <div className="tablo-kutu"><table>
              <thead><tr><th>Eğitmen</th><th className="sayi-h">Direksiyon</th><th className="sayi-h">Teorik</th><th className="sayi-h">Saat</th><th className="sayi-h">Gelmeyen</th><th className="sayi-h">Prim</th></tr></thead>
              <tbody>{r.egitmenler.map((e) => (
                <tr key={e.id}><td>{e.ad}<div className="kucuk soluk">{y.subeAd(e.sube_id) || 'Merkez'}</div></td><td className="sayi-h">{e.direksiyon}</td><td className="sayi-h">{e.teorik}</td>
                  <td className="sayi-h">{(e.dakika / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</td><td className="sayi-h">{e.gelmeyen}</td><td className="sayi-h">{tl(e.prim)}</td></tr>
              ))}</tbody>
            </table></div> : <Bos>Bu aralıkta ders yok.</Bos>}
            <p className="soluk kucuk">Ders başı prim: direksiyon {tl(r.prim.direksiyon)}, teorik {tl(r.prim.teorik)} (Ayarlar'dan değişir). Teorik sayısı bireysel teorik derslerdir; grup dersleri yoklamadan sayılır.</p>
          </Kart>
        </div>
      )}
    </>
  );
}
