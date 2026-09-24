// Kasa: tahsilatlar, giderler, tedarikçi borçları (verecek), şube kasası gün sonu.
import { useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { api, islem } from '../api';
import { Bos, Kart, Sayi, bildir, pencere } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import { makbuzYazdir } from '../yazdir';
import { YONTEM, ayBasi, csvIndir, tarih, tl, tlCsv } from '../yardim';

type Bolum = 'tahsilat' | 'gider' | 'tedarikci' | 'gunsonu';

export function Kasa(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const [bas, setBas] = useState(ayBasi(v.bugun));
  const [bit, setBit] = useState(v.bugun);
  const [bolum, setBolum] = useState<Bolum>(y.hak('tahsilat') ? 'tahsilat' : 'gider');
  const ara = (x: { tarih: string }) => x.tarih >= bas && x.tarih <= bit;
  const odemeler = y.subeSuz(v.odemeler).filter(ara);
  const giderler = y.subeSuz(v.giderler).filter(ara);
  const tedOdemeleri = y.subeSuz(v.tedarikciOdemeleri).filter(ara);
  const gelir = odemeler.filter((x) => !x.iptal).reduce((a, x) => a + (x.tur === 'iade' ? -x.tutar : x.tutar), 0);
  const gider = giderler.filter((x) => !x.iptal).reduce((a, x) => a + x.tutar, 0);
  const cikis = giderler.filter((x) => !x.iptal && !x.veresiye).reduce((a, x) => a + x.tutar, 0) + tedOdemeleri.filter((x) => !x.iptal).reduce((a, x) => a + x.tutar, 0);
  const yontemler = Object.keys(YONTEM).map((k) => [k, odemeler.filter((x) => !x.iptal && x.yontem === k).reduce((a, x) => a + (x.tur === 'iade' ? -x.tutar : x.tutar), 0)] as const).filter(([, t]) => t);
  const tedBorc = (v.tedarikciler || []).reduce((a, t) => a + Math.max(0, t.bakiye), 0);

  const gunSonu = async () => {
    const sube = y.varsayilanSube();
    const b = await api<{ beklenen: number; giren: number; iade: number; gider: number; tedarikci: number }>(`/api/kasa-beklenen?sube=${encodeURIComponent(sube)}&tarih=${v.bugun}`);
    pencere(`Gün sonu · ${y.subeAd(sube)} · ${tarih(v.bugun)}`, [
      { tip: 'bilgi', html: <>Bugün nakit giren {tl(b.giren)}, iade {tl(b.iade)}, gider {tl(b.gider)}, firmalara ödeme {tl(b.tedarikci)}.<br />Kasada olması gereken nakit: <b>{tl(b.beklenen)}</b></> },
      { ad: 'sayilan', etiket: 'Kasada sayılan nakit (₺)', tip: 'para', deger: b.beklenen, zorunlu: true },
      { ad: 'aciklama', etiket: 'Açıklama (fark varsa nedeni)' },
    ], async (g) => {
      const r = await islem<{ fark: number }>('gun_sonu', { subeId: sube, ...g });
      await y.b.yenile();
      bildir(r.fark ? `Kasa kapatıldı. Fark: ${tl(r.fark)}` : 'Kasa kapatıldı, fark yok.', r.fark ? 'hata' : 'tamam');
    });
  };
  const excel = () => csvIndir(`kasa-${bas}-${bit}.csv`, [
    ['Tarih', 'Tür', 'Şube', 'Açıklama', 'Şekli', 'Giriş', 'Çıkış', 'Kaydeden', 'Durum'],
    ...odemeler.map((x) => [tarih(x.tarih), x.tur === 'iade' ? 'İade' : 'Tahsilat', y.subeAd(x.sube_id), `${y.ogrAd(x.ogrenci_id)} ${x.aciklama} ${x.makbuz_no}`, YONTEM[x.yontem] || x.yontem,
      x.tur === 'iade' ? '' : tlCsv(x.tutar), x.tur === 'iade' ? tlCsv(x.tutar) : '', x.kaydeden, x.iptal ? 'İptal' : '']),
    ...giderler.map((x) => [tarih(x.tarih), 'Gider', y.subeAd(x.sube_id), `${x.kategori} ${x.aciklama}`, YONTEM[x.yontem] || x.yontem, '', tlCsv(x.tutar), x.kaydeden, x.iptal ? 'İptal' : x.veresiye ? 'Veresiye' : '']),
    ...tedOdemeleri.map((x) => [tarih(x.tarih), 'Firmaya ödeme', y.subeAd(x.sube_id), (v.tedarikciler || []).find((t) => t.id === x.tedarikci_id)?.ad || '', YONTEM[x.yontem] || x.yontem, '', tlCsv(x.tutar), x.kaydeden, x.iptal ? 'İptal' : '']),
  ]);

  const bolumler: [Bolum, string][] = [
    ...(y.hak('tahsilat') ? [['tahsilat', 'Tahsilatlar'] as [Bolum, string]] : []),
    ...(y.hak('kasa') ? [['gider', 'Giderler'], ['tedarikci', 'Firmalar (verecek)'], ['gunsonu', 'Gün sonu']] as [Bolum, string][] : []),
  ];
  return (
    <>
      <div className="suzgec">
        <label className="alan"><span>Başlangıç</span><input type="date" value={bas} onChange={(e) => setBas(e.target.value)} /></label>
        <label className="alan"><span>Bitiş</span><input type="date" value={bit} onChange={(e) => setBit(e.target.value)} /></label>
        {y.hak('rapor') && <button className="dugme" onClick={excel}>Excel</button>}
        {y.hak('kasa') && <button className="dugme" onClick={gunSonu}>Gün sonu (kasa sayımı)</button>}
      </div>
      <div className="sayilar">
        {y.hak('tahsilat') && <Sayi etiket="Tahsilat (iade düşülmüş)" deger={tl(gelir)} alt={yontemler.map(([k, t]) => `${YONTEM[k]}: ${tl(t)}`).join(' · ')} />}
        {y.hak('kasa') && <Sayi etiket="Gider" deger={tl(gider)} alt={`kasadan çıkan ${tl(cikis)}`} />}
        {y.hak('kasa') && <Sayi etiket="Fark" deger={tl(gelir - gider)} />}
        {y.hak('kasa') && <Sayi etiket="Firmalara borç" deger={tl(tedBorc)} uyari={tedBorc > 0} onClick={() => setBolum('tedarikci')} />}
      </div>
      <div className="sekmeler">{bolumler.map(([k, e]) => <button key={k} className={bolum === k ? 'secili' : ''} onClick={() => setBolum(k)}>{e}</button>)}</div>

      {bolum === 'tahsilat' && (
        <Kart baslik="Tahsilatlar" sag={<button className="dugme ana" onClick={() => E.odemeAl()}>+ Ödeme al</button>}>
          {odemeler.length ? <div className="tablo-kutu"><table>
            <thead><tr><th>Tarih</th><th>Öğrenci</th>{y.subeSutunu && <th>Şube</th>}<th>Şekli</th><th>Kaydeden</th><th className="sayi-h">Tutar</th><th></th></tr></thead>
            <tbody>{odemeler.map((x) => {
              const o = y.ogr(x.ogrenci_id);
              return (
                <tr key={x.id} className={x.iptal ? 'iptal' : ''}>
                  <td>{tarih(x.tarih)}<div className="kucuk soluk">{x.makbuz_no}</div></td>
                  <td><button className="baglanti" onClick={() => y.b.git('ogrenci', x.ogrenci_id)}>{y.ogrAd(x.ogrenci_id)}</button><div className="kucuk soluk">{x.tur === 'iade' ? 'İADE · ' : ''}{x.aciklama}</div></td>
                  {y.subeSutunu && <td>{y.subeAd(x.sube_id)}</td>}
                  <td>{YONTEM[x.yontem] || x.yontem}</td><td>{x.kaydeden}</td>
                  <td className="sayi-h">{x.tur === 'iade' ? '-' : ''}{tl(x.tutar)}</td>
                  <td><div className="dugmeler">
                    {!x.iptal && o && <button className="dugme kucuk" onClick={() => makbuzYazdir(v, x, o)}>Makbuz</button>}
                    {!x.iptal && y.hak('kasa') && <button className="dugme kucuk kirmizi" onClick={() => E.odemeIptal(x.id)}>İptal</button>}
                    {!!x.iptal && <span className="kucuk">{x.iptal_nedeni}</span>}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div> : <Bos>Bu aralıkta tahsilat yok.</Bos>}
        </Kart>
      )}
      {bolum === 'gider' && (
        <Kart baslik="Giderler" sag={<button className="dugme ana" onClick={() => E.giderEkle()}>+ Gider gir</button>}>
          {giderler.length ? <div className="tablo-kutu"><table>
            <thead><tr><th>Tarih</th><th>Tür</th>{y.subeSutunu && <th>Şube</th>}<th>Açıklama</th><th>Şekli</th><th className="sayi-h">Tutar</th><th></th></tr></thead>
            <tbody>{giderler.map((x) => (
              <tr key={x.id} className={x.iptal ? 'iptal' : ''}>
                <td>{tarih(x.tarih)}</td><td>{x.kategori}</td>{y.subeSutunu && <td>{y.subeAd(x.sube_id)}</td>}
                <td>{x.aciklama}<div className="kucuk soluk">{(v.tedarikciler || []).find((t) => t.id === x.tedarikci_id)?.ad}{x.arac_id ? ` · ${y.aracAd(x.arac_id)}` : ''} · {x.kaydeden}</div></td>
                <td>{x.veresiye ? <span className="rozet sari">Veresiye</span> : YONTEM[x.yontem] || x.yontem}</td>
                <td className="sayi-h">{tl(x.tutar)}</td>
                <td>{!x.iptal && <button className="dugme kucuk kirmizi" onClick={() => E.giderIptal(x.id)}>İptal</button>}</td>
              </tr>
            ))}</tbody>
          </table></div> : <Bos>Bu aralıkta gider yok.</Bos>}
        </Kart>
      )}
      {bolum === 'tedarikci' && (
        <>
          <Kart baslik="Firmalar ve borçlarımız" sag={<><button className="dugme" onClick={() => E.tedarikciEkle()}>+ Firma</button><button className="dugme ana" onClick={() => E.tedarikciOdeme()}>Firmaya ödeme</button></>}>
            {(v.tedarikciler || []).length ? <div className="tablo-kutu"><table>
              <thead><tr><th>Firma</th><th>Telefon</th><th className="sayi-h">Borcumuz</th><th></th></tr></thead>
              <tbody>{(v.tedarikciler || []).map((t) => (
                <tr key={t.id} className={t.aktif ? '' : 'iptal'}>
                  <td><b>{t.ad}</b><div className="kucuk soluk">{t.notlar}</div></td><td>{t.telefon}</td>
                  <td className="sayi-h">{t.bakiye > 0 ? <span className="rozet kirmizi">{tl(t.bakiye)}</span> : tl(t.bakiye)}</td>
                  <td><div className="dugmeler">
                    {t.bakiye > 0 && <button className="dugme kucuk" onClick={() => E.tedarikciOdeme(t.id)}>Öde</button>}
                    <button className="dugme kucuk" onClick={() => E.tedarikciEkle(t)}>Düzenle</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div> : <Bos>Firma kaydı yok. Veresiye alışlar için firma ekleyin.</Bos>}
            <p className="soluk kucuk">Borç, "veresiye" girilen giderlerden yapılan ödemeler düşülerek hesaplanır. {v.ben.rol !== 'yonetici' && 'Tutarlar şubenize aittir.'}</p>
          </Kart>
          <Kart baslik="Firmalara yapılan ödemeler">
            {tedOdemeleri.length ? <div className="tablo-kutu"><table><tbody>{tedOdemeleri.map((x) => (
              <tr key={x.id} className={x.iptal ? 'iptal' : ''}><td>{tarih(x.tarih)}</td><td>{(v.tedarikciler || []).find((t) => t.id === x.tedarikci_id)?.ad}<div className="kucuk soluk">{x.aciklama}</div></td>
                {y.subeSutunu && <td>{y.subeAd(x.sube_id)}</td>}<td>{YONTEM[x.yontem]}</td><td className="sayi-h">{tl(x.tutar)}</td>
                <td>{!x.iptal && <button className="dugme kucuk kirmizi" onClick={async () => { await islem('tedarikci_odeme_iptal', { id: x.id }); await y.b.yenile(); }}>İptal</button>}</td></tr>
            ))}</tbody></table></div> : <Bos>Bu aralıkta ödeme yok.</Bos>}
          </Kart>
        </>
      )}
      {bolum === 'gunsonu' && (
        <Kart baslik="Gün sonu kayıtları" sag={<button className="dugme ana" onClick={gunSonu}>Bugünün kasasını kapat</button>}>
          {y.subeSuz(v.gunSonlari).length ? <div className="tablo-kutu"><table>
            <thead><tr><th>Tarih</th>{y.subeSutunu && <th>Şube</th>}<th className="sayi-h">Olması gereken</th><th className="sayi-h">Sayılan</th><th className="sayi-h">Fark</th><th>Açıklama</th></tr></thead>
            <tbody>{y.subeSuz(v.gunSonlari).map((g) => (
              <tr key={g.id}><td>{tarih(g.tarih)}</td>{y.subeSutunu && <td>{y.subeAd(g.sube_id)}</td>}<td className="sayi-h">{tl(g.beklenen)}</td><td className="sayi-h">{tl(g.sayilan)}</td>
                <td className="sayi-h">{g.fark ? <span className={'rozet ' + (g.fark < 0 ? 'kirmizi' : 'sari')}>{g.fark > 0 ? '+' : '-'}{tl(Math.abs(g.fark))}</span> : 'Yok'}</td><td>{g.aciklama}<div className="kucuk soluk">{g.kaydeden}</div></td></tr>
            ))}</tbody>
          </table></div> : <Bos>Henüz gün sonu yapılmamış.</Bos>}
          <p className="soluk kucuk">Yalnız nakit hareketler hesaba girer. Olması gereken tutar, bir önceki gün sonunda sayılan nakitten başlar.</p>
        </Kart>
      )}
    </>
  );
}
