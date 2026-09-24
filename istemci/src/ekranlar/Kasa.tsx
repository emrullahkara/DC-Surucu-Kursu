// Kasa: tahsilatlar, giderler, tedarikçi borçları (verecek), şube kasası gün sonu.
import { useEffect, useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { api, islem } from '../api';
import { Bos, Kart, Rozet, Sayi, bildir, pencere, onayla } from '../bilesenler/ortak';
import { SENET_DURUM } from './Ogrenciler';
import { senetYazdir } from '../yazdir';
import { eylemler } from '../eylemler';
import { makbuzYazdir } from '../yazdir';
import { YONTEM, ayBasi, excelIndir, tarih, tl, tlCsv } from '../yardim';

type Bolum = 'tahsilat' | 'gider' | 'tedarikci' | 'gunsonu' | 'senet' | 'banka' | 'fatura';

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
    const b = await api<{ beklenen: number; giren: number; iade: number; gider: number; tedarikci: number; aktarimGelen: number; aktarimGiden: number }>(`/api/kasa-beklenen?sube=${encodeURIComponent(sube)}&tarih=${v.bugun}`);
    pencere(`Gün sonu · ${y.subeAd(sube)} · ${tarih(v.bugun)}`, [
      { tip: 'bilgi', html: <>Bugün nakit giren {tl(b.giren)}, iade {tl(b.iade)}, gider {tl(b.gider)}, firmalara ödeme {tl(b.tedarikci)}{b.aktarimGelen ? `, gelen aktarım ${tl(b.aktarimGelen)}` : ''}{b.aktarimGiden ? `, giden aktarım ${tl(b.aktarimGiden)}` : ''}.<br />Kasada olması gereken nakit: <b>{tl(b.beklenen)}</b></> },
      { tip: 'bilgi', html: 'Kasa kapatıldıktan sonra bu güne nakit kayıt girilemez. Kapatmadan önce bütün nakit hareketlerin girildiğinden emin olun.' },
      { ad: 'sayilan', etiket: 'Kasada sayılan nakit (₺)', tip: 'para', deger: b.beklenen, zorunlu: true },
      { ad: 'aciklama', etiket: 'Açıklama (fark varsa nedeni)' },
    ], async (g) => {
      const r = await islem<{ fark: number }>('gun_sonu', { subeId: sube, ...g });
      await y.b.yenile();
      bildir(r.fark ? `Kasa kapatıldı. Fark: ${tl(r.fark)}` : 'Kasa kapatıldı, fark yok.', r.fark ? 'hata' : 'tamam');
    });
  };
  const excel = () => excelIndir(`kasa-${bas}-${bit}.xlsx`, [
    ['Tarih', 'Tür', 'Şube', 'Açıklama', 'Şekli', 'Giriş', 'Çıkış', 'Kaydeden', 'Durum'],
    ...odemeler.map((x) => [tarih(x.tarih), x.tur === 'iade' ? 'İade' : 'Tahsilat', y.subeAd(x.sube_id), `${y.ogrAd(x.ogrenci_id)} ${x.aciklama} ${x.makbuz_no}`, YONTEM[x.yontem] || x.yontem,
      x.tur === 'iade' ? '' : tlCsv(x.tutar), x.tur === 'iade' ? tlCsv(x.tutar) : '', x.kaydeden, x.iptal ? 'İptal' : '']),
    ...giderler.map((x) => [tarih(x.tarih), 'Gider', y.subeAd(x.sube_id), `${x.kategori} ${x.aciklama}`, YONTEM[x.yontem] || x.yontem, '', tlCsv(x.tutar), x.kaydeden, x.iptal ? 'İptal' : x.veresiye ? 'Veresiye' : '']),
    ...tedOdemeleri.map((x) => [tarih(x.tarih), 'Firmaya ödeme', y.subeAd(x.sube_id), (v.tedarikciler || []).find((t) => t.id === x.tedarikci_id)?.ad || '', YONTEM[x.yontem] || x.yontem, '', tlCsv(x.tutar), x.kaydeden, x.iptal ? 'İptal' : '']),
  ]);

  const bolumler: [Bolum, string][] = [
    ...(y.hak('tahsilat') ? [['tahsilat', 'Tahsilatlar'], ['senet', 'Senet ve çek'], ['fatura', 'Fatura listesi']] as [Bolum, string][] : []),
    ...(y.hak('kasa') ? [['gider', 'Giderler'], ['tedarikci', 'Firmalar (verecek)'], ['banka', 'Banka ve aktarım'], ['gunsonu', 'Gün sonu']] as [Bolum, string][] : []),
  ];
  const senetler = y.subeSuz(v.senetler);
  const transferler = (v.transferler || []).filter(ara);
  const ucAd = (tur: string, id: string) => (tur === 'kasa' ? `${y.subeAd(id)} kasası` : (v.bankaHesaplari || []).find((h) => h.id === id)?.ad || (v.aktarimHedefleri || []).find((h) => h.id === id)?.ad || 'hesap');
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
      {bolum === 'senet' && (
        <Kart baslik="Senet ve çekler" sag={<button className="dugme" onClick={() => excelIndir(`senetler-${v.bugun}.xlsx`, [
          ['Vade', 'Tür', 'No', 'Öğrenci', 'Borçlu', 'Tutar', 'Durum', 'Şube', 'Kaydeden'],
          ...senetler.map((x) => [tarih(x.vade), x.tur === 'cek' ? 'Çek' : 'Senet', x.no, y.ogrAd(x.ogrenci_id), x.borclu, x.tutar / 100, SENET_DURUM[x.durum][0], y.subeAd(x.sube_id), x.kaydeden]),
        ])}>Excel</button>}>
          <div className="sayilar">
            <Sayi etiket="Portföyde" deger={tl(senetler.filter((x) => x.durum === 'portfoy').reduce((a, x) => a + x.tutar, 0))} alt={`${senetler.filter((x) => x.durum === 'portfoy').length} adet`} />
            <Sayi etiket="Vadesi geçen" deger={tl(senetler.filter((x) => x.durum === 'portfoy' && x.vade < v.bugun).reduce((a, x) => a + x.tutar, 0))} uyari={senetler.some((x) => x.durum === 'portfoy' && x.vade < v.bugun)} />
            <Sayi etiket="Karşılıksız" deger={tl(senetler.filter((x) => x.durum === 'karsiliksiz').reduce((a, x) => a + x.tutar, 0))} />
          </div>
          {senetler.length ? <div className="tablo-kutu"><table>
            <thead><tr><th>Vade</th><th>Öğrenci</th>{y.subeSutunu && <th>Şube</th>}<th>Tür / no</th><th className="sayi-h">Tutar</th><th>Durum</th><th></th></tr></thead>
            <tbody>{senetler.map((x) => {
              const o = y.ogr(x.ogrenci_id);
              return (
                <tr key={x.id} className={x.durum === 'iade' ? 'iptal' : ''}>
                  <td>{tarih(x.vade)}{x.durum === 'portfoy' && x.vade < v.bugun && <div><span className="rozet kirmizi">vadesi geçti</span></div>}</td>
                  <td><button className="baglanti" onClick={() => y.b.git('ogrenci', x.ogrenci_id)}>{y.ogrAd(x.ogrenci_id)}</button><div className="kucuk soluk">{x.borclu}</div></td>
                  {y.subeSutunu && <td>{y.subeAd(x.sube_id)}</td>}
                  <td>{x.tur === 'cek' ? `Çek ${x.banka}` : 'Senet'}<div className="kucuk soluk">{x.no}</div></td>
                  <td className="sayi-h">{tl(x.tutar)}</td><td><Rozet tablo={SENET_DURUM} d={x.durum} /></td>
                  <td><div className="dugmeler">
                    {(x.durum === 'portfoy' || x.durum === 'karsiliksiz') && <button className="dugme kucuk" onClick={() => E.senetTahsil(x)}>Tahsil et</button>}
                    {y.hak('kasa') && x.durum !== 'tahsil' && <button className="dugme kucuk" onClick={() => E.senetDurum(x)}>Durum</button>}
                    {o && <button className="dugme kucuk" onClick={() => senetYazdir(v, x, o)}>Yazdır</button>}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div> : <Bos>Senet ya da çek yok. Öğrenci kartında "Ödeme durumu" bölümünden eklenir.</Bos>}
        </Kart>
      )}
      {bolum === 'banka' && (
        <>
          <Kart baslik="Banka hesapları ve POS" sag={<><button className="dugme" onClick={() => E.bankaHesap()}>+ Hesap</button><button className="dugme ana" onClick={() => E.paraAktar()}>Para aktar</button></>}>
            {(v.bankaHesaplari || []).length ? <div className="tablo-kutu"><table>
              <thead><tr><th>Hesap</th><th>Şube</th><th className="sayi-h">Bakiye</th><th></th></tr></thead>
              <tbody>{(v.bankaHesaplari || []).map((h) => (
                <tr key={h.id} className={h.aktif ? '' : 'iptal'}><td><b>{h.ad}</b><div className="kucuk soluk">{h.banka} {h.iban}</div></td><td>{h.sube_id ? y.subeAd(h.sube_id) : 'Bütün kurum'}</td>
                  <td className="sayi-h">{tl(h.bakiye)}</td><td><button className="dugme kucuk" onClick={() => E.bankaHesap(h)}>Düzenle</button></td></tr>
              ))}</tbody>
            </table></div> : <Bos>Hesap yok. Kartla ve havaleyle alınan paranın hangi hesaba geçtiğini izlemek için hesap ekleyin.</Bos>}
            <p className="soluk kucuk">Bakiye = açılış + bu hesaba bağlanan tahsilatlar - giderler - firmalara ödemeler ± aktarımlar. Banka ekstresiyle karşılaştırın.</p>
          </Kart>
          <Kart baslik="Para aktarımları (seçilen tarihler)">
            {transferler.length ? <div className="tablo-kutu"><table><tbody>{transferler.map((t) => (
              <tr key={t.id} className={t.iptal ? 'iptal' : ''}><td>{tarih(t.tarih)}</td><td>{ucAd(t.kaynak_tur, t.kaynak_id)} → {ucAd(t.hedef_tur, t.hedef_id)}<div className="kucuk soluk">{t.aciklama} · {t.kaydeden}</div></td>
                <td className="sayi-h">{tl(t.tutar)}</td>
                <td>{!t.iptal && <button className="dugme kucuk kirmizi" onClick={() => onayla('Aktarım iptal edilsin mi?', async () => { await islem('para_aktar_iptal', { id: t.id }); await y.b.yenile(); }, 'İptal et')}>İptal</button>}</td></tr>
            ))}</tbody></table></div> : <Bos>Bu aralıkta aktarım yok.</Bos>}
          </Kart>
        </>
      )}
      {bolum === 'fatura' && <FaturaListesi bas={bas} bit={bit} />}
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

// Fatura listesi: muhasebeciye verilecek (kişi, kimlik, adres, matrah, KDV). Kesilen faturanın numarası işlenir.
interface FaturaSatir { id: string; tarih: string; makbuz: string; sube: string; ad: string; tc: string; adres: string; telefon: string; eposta: string; tur: string; yontem: string; tutar: number; matrah: number; kdv: number; faturaNo: string; faturaTarih: string }
function FaturaListesi({ bas, bit }: { bas: string; bit: string }) {
  const y = useY();
  const [durum, setDurum] = useState('kesilmemis');
  const [l, setL] = useState<{ kdvOrani: number; liste: FaturaSatir[] } | null>(null);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const getir = () => api<{ kdvOrani: number; liste: FaturaSatir[] }>(`/api/fatura-listesi?bas=${bas}&bit=${bit}&durum=${durum}${y.b.sube ? `&sube=${y.b.sube}` : ''}`).then((r) => { setL(r); setSecili(new Set()); }).catch((e) => bildir(e.message, 'hata'));
  useEffect(() => { getir(); }, [bas, bit, durum, y.b.v]);
  const liste = (l?.liste || []).filter((x) => !y.b.sube || x.sube === y.subeAd(y.b.sube));
  const isaretle = () => pencere(`${secili.size} tahsilat için fatura`, [
    { tip: 'bilgi', html: 'E-arşiv / e-fatura sisteminizde kestiğiniz faturanın numarasını yazın. Toplu fatura kestiyseniz aynı numara hepsine yazılır.' },
    { ad: 'faturaNo', etiket: 'Fatura no', zorunlu: true }, { ad: 'tarih', etiket: 'Fatura tarihi', tip: 'date', deger: y.b.v.bugun },
  ], async (g) => { await islem('fatura_isaretle', { idler: [...secili], ...g }); await y.b.yenile(); bildir('Fatura işlendi.', 'tamam'); });
  const excel = () => excelIndir(`fatura-listesi-${bas}-${bit}.xlsx`, [
    ['Tarih', 'Makbuz no', 'Şube', 'Ad soyad', 'T.C. kimlik no', 'Adres', 'Telefon', 'E-posta', 'Tür', 'Ödeme şekli', 'Tutar (KDV dahil)', `Matrah`, `KDV (%${l?.kdvOrani})`, 'Fatura no', 'Fatura tarihi'],
    ...liste.map((x) => [tarih(x.tarih), x.makbuz, x.sube, x.ad, x.tc, x.adres, x.telefon, x.eposta, x.tur === 'iade' ? 'İade' : 'Tahsilat', YONTEM[x.yontem] || x.yontem, x.tutar / 100, x.matrah / 100, x.kdv / 100, x.faturaNo, tarih(x.faturaTarih)]),
  ], 'Fatura listesi');
  return (
    <Kart baslik="Fatura listesi (muhasebe için)" sag={<>
      <select value={durum} onChange={(e) => setDurum(e.target.value)} style={{ width: 'auto' }}><option value="kesilmemis">Faturası kesilmemiş</option><option value="kesilmis">Faturası kesilmiş</option><option value="">Hepsi</option></select>
      <button className="dugme" onClick={excel}>Excel</button>
      {secili.size > 0 && <button className="dugme ana" onClick={isaretle}>Seçilenlere fatura no yaz ({secili.size})</button>}
    </>}>
      <p className="soluk kucuk">Uygulamanın makbuzu yasal fatura yerine geçmez. Bu listeyi muhasebecinize verin ya da e-arşiv sisteminizde fatura kesip numarasını buraya işleyin. Tutarlar KDV dahildir; KDV oranı %{l?.kdvOrani ?? '…'} (Ayarlar'dan değişir, muhasebecinizle doğrulayın).</p>
      {!l ? <Bos>Yükleniyor…</Bos> : liste.length ? <div className="tablo-kutu"><table>
        <thead><tr><th><input type="checkbox" style={{ width: 'auto' }} checked={secili.size === liste.length} onChange={(e) => setSecili(e.target.checked ? new Set(liste.map((x) => x.id)) : new Set())} aria-label="Hepsini seç" /></th>
          <th>Tarih</th><th>Kişi</th><th className="sayi-h">Tutar</th><th className="sayi-h">Matrah</th><th className="sayi-h">KDV</th><th>Fatura</th></tr></thead>
        <tbody>{liste.map((x) => (
          <tr key={x.id}><td><input type="checkbox" style={{ width: 'auto' }} checked={secili.has(x.id)} onChange={(e) => setSecili((s0) => { const s1 = new Set(s0); if (e.target.checked) s1.add(x.id); else s1.delete(x.id); return s1; })} aria-label="Seç" /></td>
            <td>{tarih(x.tarih)}<div className="kucuk soluk">{x.makbuz}</div></td><td>{x.ad}<div className="kucuk soluk">{x.tc}</div></td>
            <td className="sayi-h">{tl(x.tutar)}</td><td className="sayi-h">{tl(x.matrah)}</td><td className="sayi-h">{tl(x.kdv)}</td>
            <td>{x.faturaNo ? <span className="kucuk">{x.faturaNo}<div className="soluk">{tarih(x.faturaTarih)}</div></span> : <span className="rozet sari">Kesilmedi</span>}</td></tr>
        ))}</tbody>
      </table></div> : <Bos>Bu aralıkta kayıt yok.</Bos>}
    </Kart>
  );
}
