// Teorik dersler: dönemler, gruplar (sınıflar), ders programı ve yoklama (karar 21).
import { useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { islem } from '../api';
import { Bos, Kart, bildir, icerikPenceresi, onayla, pencere, pencereKapat, IsDugmesi } from '../bilesenler/ortak';
import type { TeorikGrup, TeorikOturum } from '../tipler';
import { gunEkle, tarih } from '../yardim';

export function Teorik(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const [grupId, setGrupId] = useState<string | null>(null);
  const gruplar = y.subeSuz(v.teorikGruplar);
  const grup = gruplar.find((g) => g.id === grupId) || null;
  const yonetim = y.hak('ders');
  const yenile = async (m?: string) => { await y.b.yenile(); if (m) bildir(m, 'tamam'); };

  const donemEkle = () => {
    const ay = gunEkle(v.bugun.slice(0, 8) + '01', 32).slice(0, 7);
    pencere('Yeni dönem', [
      { ad: 'ad', etiket: 'Dönem adı', deger: `${ay} dönemi`, zorunlu: true },
      { ad: 'bas', etiket: 'Başlangıç', tip: 'date', deger: ay + '-01', zorunlu: true },
      { ad: 'bit', etiket: 'Bitiş', tip: 'date', deger: gunEkle(gunEkle(ay + '-01', 32).slice(0, 8) + '01', -1), zorunlu: true },
    ], async (g) => { await islem('donem_ekle', g); await yenile('Dönem açıldı.'); });
  };
  const grupFormu = (gr?: TeorikGrup) => {
    const sube = gr?.sube_id || y.varsayilanSube();
    pencere(gr ? `Grup · ${gr.ad}` : 'Yeni teorik grup', [
      ...(!gr && v.ben.rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select' as const, secenekler: y.subeSecenek(), deger: sube }] : []),
      { ad: 'ad', etiket: 'Grup adı', deger: gr?.ad, zorunlu: true, not: 'Örnek: Ekim akşam grubu' },
      { ad: 'donemId', etiket: 'Dönem', tip: 'select', secenekler: [['', 'Seçilmedi'], ...v.donemler.map((d): [string, string] => [d.id, d.ad])], deger: gr?.donem_id || v.donemler.find((d) => d.bas <= v.bugun && d.bit >= v.bugun)?.id || '' },
      { ad: 'derslik', etiket: 'Derslik', deger: gr?.derslik },
      { ad: 'egitmenId', etiket: 'Teorik eğitmeni', tip: 'select', secenekler: y.egitmenSecenek(sube), deger: gr?.egitmen_id || '' },
      ...(gr ? [{ ad: 'aktif', etiket: 'Grup açık', tip: 'onay' as const, deger: !!gr.aktif }] : []),
    ], async (g) => {
      if (gr) await islem('grup_duzenle', { id: gr.id, ...g });
      else { const r = await islem<{ id: string }>('grup_ekle', { ...g, subeId: g.subeId || sube }); setGrupId(r.id); }
      await yenile('Kaydedildi.');
    });
  };
  const uyeler = (gr: TeorikGrup) => {
    const adaylar = v.ogrenciler.filter((o) => o.sube_id === gr.sube_id && (o.durum === 'aktif' || gr.uyeler.includes(o.id)));
    pencere(`Grup öğrencileri · ${gr.ad}`, [
      { ad: 'ogrenciler', etiket: 'Öğrenciler', tip: 'coklu', secenekler: adaylar.map((o): [string, string] => [o.id, `${o.ad} ${o.soyad} (${o.sinif}) · teorik ${o.dersler.teorik}/${v.tanimlar.siniflar[o.sinif]?.teorik ?? '?'}`]), deger: gr.uyeler },
    ], async (g) => { await islem('grup_uyeleri', { id: gr.id, ogrenciler: g.ogrenciler }); await yenile('Liste kaydedildi.'); });
  };
  const oturumPlanla = (gr: TeorikGrup) => pencere(`Teorik ders planla · ${gr.ad}`, [
    { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun, zorunlu: true }, { ad: 'saat', etiket: 'Saat', tip: 'time', deger: '18:30' },
    { ad: 'dersSaati', etiket: 'Kaç ders saati?', tip: 'number', deger: 2, min: 1, max: 8 },
    { ad: 'konu', etiket: 'Konu', tip: 'select', secenekler: v.tanimlar.teorikKonular.map((k): [string, string] => [k, k]) },
    { ad: 'tekrar', etiket: 'Kaç hafta aynı gün ve saatte tekrarlansın?', tip: 'number', deger: 1, min: 1, max: 12 },
  ], async (g) => {
    const tekrar = Math.max(1, Math.min(12, Number(g.tekrar) || 1));
    for (let i = 0; i < tekrar; i++) await islem('oturum_planla', { grupId: gr.id, tarih: gunEkle(g.tarih, i * 7), saat: g.saat, dersSaati: g.dersSaati, konu: g.konu });
    await yenile(`${tekrar} ders planlandı.`);
  }, { ikili: true });
  const yoklamaAl = (o: TeorikOturum, gr: TeorikGrup) => {
    const mevcut = new Map(v.yoklamalar.filter((x) => x.oturum_id === o.id).map((x) => [x.ogrenci_id, x.durum]));
    const durum = new Map(gr.uyeler.map((id) => [id, mevcut.get(id) || 'geldi']));
    icerikPenceresi(`Yoklama · ${gr.ad} · ${tarih(o.tarih)} ${o.saat}`, <YoklamaFormu gr={gr} durum={durum} adlar={new Map(gr.uyeler.map((id) => [id, y.ogrAd(id)]))} kaydet={async (liste) => {
      await islem('yoklama_kaydet', { oturumId: o.id, liste });
      pencereKapat();
      await yenile('Yoklama kaydedildi.');
    }} />);
  };

  if (grup) {
    const oturumlar = v.teorikOturumlar.filter((o) => o.grup_id === grup.id).sort((a, b) => (a.tarih + a.saat > b.tarih + b.saat ? 1 : -1));
    const kendisi = grup.egitmen_id === v.ben.id;
    return (
      <>
        <div className="baslik-satir"><button className="dugme kucuk" onClick={() => setGrupId(null)}>← Gruplar</button></div>
        <Kart baslik={<h1>{grup.ad}</h1>} sag={yonetim && <>
          <button className="dugme" onClick={() => grupFormu(grup)}>Düzenle</button>
          {y.hak('kayit') && <button className="dugme" onClick={() => uyeler(grup)}>Öğrenciler ({grup.uyeler.length})</button>}
          <button className="dugme ana" onClick={() => oturumPlanla(grup)}>+ Ders planla</button>
        </>}>
          <p className="soluk">{y.subeAd(grup.sube_id)} · {grup.derslik || 'derslik yok'} · Eğitmen: {y.kisiAd(grup.egitmen_id) || '—'} · {v.donemler.find((d) => d.id === grup.donem_id)?.ad || ''}</p>
          <div className="tablo-kutu"><table>
            <thead><tr><th>Öğrenci</th><th>Teorik ders</th><th>Devamsızlık</th></tr></thead>
            <tbody>{grup.uyeler.map((id) => {
              const o = y.ogr(id);
              const yk = v.yoklamalar.filter((x) => x.ogrenci_id === id && oturumlar.some((t) => t.id === x.oturum_id));
              return o ? <tr key={id} className="tikla" onClick={() => y.b.git('ogrenci', id)}><td>{o.ad} {o.soyad}</td><td>{o.dersler.teorik}/{v.tanimlar.siniflar[o.sinif]?.teorik ?? '?'}</td><td>{yk.filter((x) => x.durum === 'gelmedi').length}</td></tr> : null;
            })}</tbody>
          </table></div>
        </Kart>
        <Kart baslik="Ders programı ve yoklama">
          {oturumlar.length ? <div className="tablo-kutu"><table><tbody>{oturumlar.map((o) => {
            const yk = v.yoklamalar.filter((x) => x.oturum_id === o.id);
            const izin = yonetim || o.egitmen_id === v.ben.id || kendisi;
            return (
              <tr key={o.id} className={o.durum === 'iptal' ? 'iptal' : ''}>
                <td>{tarih(o.tarih)} {o.saat}</td><td>{o.konu}<div className="kucuk soluk">{o.ders_saati} ders saati · {y.kisiAd(o.egitmen_id)}</div></td>
                <td>{o.durum === 'yapildi' ? <span className="rozet yesil">{yk.filter((x) => x.durum === 'geldi').length}/{yk.length} geldi</span> : o.durum === 'iptal' ? <span className="rozet gri">İptal</span> : <span className="rozet">Planlı</span>}</td>
                <td><div className="dugmeler">
                  {izin && o.durum !== 'iptal' && o.tarih <= v.bugun && <button className="dugme kucuk ana" onClick={() => yoklamaAl(o, grup)}>{o.durum === 'yapildi' ? 'Yoklamayı düzelt' : 'Yoklama al'}</button>}
                  {izin && o.durum !== 'iptal' && <button className="dugme kucuk kirmizi" onClick={() => onayla('Bu ders iptal edilsin mi? Alınmış yoklama silinir.', async () => { await islem('oturum_iptal', { id: o.id }); await yenile(); }, 'İptal et')}>İptal</button>}
                </div></td>
              </tr>
            );
          })}</tbody></table></div> : <Bos>Planlanmış teorik ders yok.</Bos>}
        </Kart>
      </>
    );
  }

  const bugunkuler = y.subeSuz(v.teorikOturumlar).filter((o) => o.tarih === v.bugun && o.durum !== 'iptal');
  return (
    <>
      {bugunkuler.length > 0 && (
        <Kart baslik="Bugünkü teorik dersler">
          <ul className="liste">{bugunkuler.map((o) => {
            const gr = v.teorikGruplar.find((g) => g.id === o.grup_id)!;
            return <li key={o.id}>{o.saat} · <b>{gr?.ad}</b> · {o.konu} · {y.kisiAd(o.egitmen_id)} <button className="dugme kucuk ana" onClick={() => yoklamaAl(o, gr)}>{o.durum === 'yapildi' ? 'Yoklamayı düzelt' : 'Yoklama al'}</button></li>;
          })}</ul>
        </Kart>
      )}
      <Kart baslik={<h1>Teorik gruplar</h1>} sag={yonetim && <>
        {['yonetici', 'sube_muduru'].includes(v.ben.rol) && <button className="dugme" onClick={donemEkle}>+ Dönem</button>}
        <button className="dugme ana" onClick={() => grupFormu()}>+ Grup</button>
      </>}>
        {gruplar.length ? <div className="tablo-kutu"><table>
          <thead><tr><th>Grup</th>{y.subeSutunu && <th>Şube</th>}<th>Dönem</th><th>Eğitmen</th><th>Öğrenci</th><th>Ders</th></tr></thead>
          <tbody>{gruplar.map((g) => {
            const ot = v.teorikOturumlar.filter((o) => o.grup_id === g.id && o.durum !== 'iptal');
            return (
              <tr key={g.id} className={'tikla' + (g.aktif ? '' : ' iptal')} onClick={() => setGrupId(g.id)}>
                <td><b>{g.ad}</b><div className="kucuk soluk">{g.derslik}</div></td>{y.subeSutunu && <td>{y.subeAd(g.sube_id)}</td>}
                <td>{v.donemler.find((d) => d.id === g.donem_id)?.ad}</td><td>{y.kisiAd(g.egitmen_id)}</td><td>{g.uyeler.length}</td>
                <td>{ot.filter((o) => o.durum === 'yapildi').length}/{ot.length}</td>
              </tr>
            );
          })}</tbody>
        </table></div> : <Bos>Henüz teorik grup yok.</Bos>}
      </Kart>
      {v.donemler.length > 0 && <Kart baslik="Dönemler"><ul className="liste">{v.donemler.map((d) => <li key={d.id}><b>{d.ad}</b> · {tarih(d.bas)} - {tarih(d.bit)} · {v.ogrenciler.filter((o) => o.donem_id === d.id).length} öğrenci</li>)}</ul></Kart>}
    </>
  );
}

// Pencere, ekranın bağlamı dışında çizilir; bu yüzden adlar dışarıdan verilir.
function YoklamaFormu({ gr, durum, adlar, kaydet }: { gr: TeorikGrup; durum: Map<string, string>; adlar: Map<string, string>; kaydet: (l: { ogrenciId: string; durum: string }[]) => Promise<void> }) {
  const [d, setD] = useState(new Map(durum));
  return (
    <div>
      <p className="soluk kucuk">Gelmeyenleri işaretleyin. "Geldi" işaretlenenlerin teorik ders sayısı dersin saati kadar artar.</p>
      <ul className="yoklama">
        {gr.uyeler.map((id) => (
          <li key={id}>
            <span>{adlar.get(id)}</span>
            <span className="secim-grup">
              {(['geldi', 'gelmedi', 'izinli'] as const).map((k) => (
                <button type="button" key={k} className={'dugme kucuk' + (d.get(id) === k ? (k === 'geldi' ? ' yesil' : k === 'gelmedi' ? ' kirmizi-dolu' : ' secili-d') : '')}
                  onClick={() => setD(new Map(d).set(id, k))}>{{ geldi: 'Geldi', gelmedi: 'Gelmedi', izinli: 'İzinli' }[k]}</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="alt"><IsDugmesi className="dugme ana" is={() => kaydet([...d].map(([ogrenciId, durum]) => ({ ogrenciId, durum })))}>Yoklamayı kaydet</IsDugmesi></div>
    </div>
  );
}
