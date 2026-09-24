// Şubeler, personel, belgeler, izinler ve merkezden görevlendirme.
import { useY, type EkranP } from '../baglam';
import { islem } from '../api';
import { Bos, Kart, bildir, onayla, pencere } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import type { Personel } from '../tipler';
import { gunFarki, tarih } from '../yardim';

export function Yonetim(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const yon = v.ben.rol === 'yonetici';
  const personel = y.subeSuz(v.personel).filter((p) => yon || p.rol !== 'yonetici').concat(yon && y.b.sube ? v.personel.filter((p) => p.rol === 'yonetici') : []);
  const belgeler = v.personelBelgeleri || [];
  const izinler = v.izinler || [];
  const yenile = async (m = 'Kaydedildi.') => { await y.b.yenile(); bildir(m, 'tamam'); };

  const subeForm = (id?: string) => {
    const s = v.subeler.find((x) => x.id === id);
    pencere(s ? `Şube · ${s.ad}` : 'Yeni şube', [
      { ad: 'ad', etiket: 'Şube adı', deger: s?.ad, zorunlu: true }, { ad: 'adres', etiket: 'Adres', deger: s?.adres }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: s?.telefon },
      ...(s && !s.merkez ? [{ ad: 'aktif', etiket: 'Şube açık (kapatılırsa o şubenin personeli giriş yapamaz, kayıtlar silinmez)', tip: 'onay' as const, deger: !!s.aktif }] : []),
    ], async (g) => { await islem(s ? 'sube_duzenle' : 'sube_ekle', s ? { id: s.id, ...g } : g); await yenile(s ? 'Kaydedildi.' : 'Şube açıldı. Şimdi şube müdürü ve personel ekleyin.'); });
  };
  const belgeForm = (p: Personel) => pencere(`Belge · ${p.ad}`, [
    { ad: 'tur', etiket: 'Belge', tip: 'select', secenekler: ['Usta öğretici belgesi', 'Direksiyon eğitimi sertifikası', 'Sürücü belgesi', 'Sağlık raporu', 'Adli sicil kaydı', 'SGK girişi', 'Diğer'].map((x): [string, string] => [x, x]) },
    { ad: 'no', etiket: 'Belge no' }, { ad: 'bitis', etiket: 'Geçerlilik bitiş tarihi', tip: 'date' }, { ad: 'notlar', etiket: 'Not' },
  ], async (g) => { await islem('personel_belge_ekle', { kullaniciId: p.id, ...g }); await yenile(); });
  const izinForm = (p: Personel) => pencere(`İzin · ${p.ad}`, [
    { ad: 'tur', etiket: 'İzin türü', tip: 'select', secenekler: ['Yıllık izin', 'Rapor', 'Mazeret', 'Ücretsiz izin'].map((x): [string, string] => [x, x]) },
    { ad: 'bas', etiket: 'Başlangıç', tip: 'date', deger: v.bugun, zorunlu: true }, { ad: 'bit', etiket: 'Bitiş', tip: 'date', deger: v.bugun, zorunlu: true },
    { ad: 'aciklama', etiket: 'Açıklama' },
    { tip: 'bilgi', html: 'Eğitmen izinliyken ona ders planlanamaz. İzin günlerindeki planlı dersleri başka eğitmene aktarmayı unutmayın.' },
  ], async (g) => { await islem('izin_ekle', { kullaniciId: p.id, ...g }); await yenile(); });

  return (
    <>
      {yon && (
        <Kart baslik={<h1>Şubeler</h1>} sag={<button className="dugme ana" onClick={() => subeForm()}>+ Şube aç</button>}>
          <div className="tablo-kutu"><table>
            <thead><tr><th>Şube</th><th>Adres / telefon</th><th className="sayi-h">Aktif öğrenci</th><th className="sayi-h">Personel</th><th className="sayi-h">Araç</th><th>Durum</th><th></th></tr></thead>
            <tbody>{v.subeler.map((s) => (
              <tr key={s.id} className={s.aktif ? '' : 'iptal'}>
                <td><b>{s.ad}</b>{s.merkez ? <> <span className="rozet">Merkez</span></> : null}</td><td>{s.adres}<div className="kucuk soluk">{s.telefon}</div></td>
                <td className="sayi-h">{v.ogrenciler.filter((o) => o.sube_id === s.id && o.durum === 'aktif').length}</td>
                <td className="sayi-h">{v.personel.filter((p) => p.sube_id === s.id && p.aktif).length}</td>
                <td className="sayi-h">{v.araclar.filter((a) => a.sube_id === s.id && a.aktif).length}</td>
                <td>{s.aktif ? <span className="rozet yesil">Açık</span> : <span className="rozet gri">Kapalı</span>}</td>
                <td><button className="dugme kucuk" onClick={() => subeForm(s.id)}>Düzenle</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Kart>
      )}
      <Kart baslik={<h1>Personel</h1>} sag={<>{yon && <button className="dugme" onClick={() => E.gorevlendir()}>Görevlendir</button>}<button className="dugme ana" onClick={() => E.personel(null)}>+ Personel ekle</button></>}>
        <p className="soluk kucuk">Yönetici ve şube müdürü "Yetkili girişi"nden; büro, muhasebe ve eğitmenler "Personel girişi"nden girer. Şube müdürü ve personel yalnız kendi şubesini görür.</p>
        <div className="tablo-kutu"><table>
          <thead><tr><th>Ad</th><th>Kullanıcı adı</th><th>Görev</th><th>Şube</th><th>Yetkiler</th><th>Belgeler</th><th>Durum</th><th></th></tr></thead>
          <tbody>{personel.map((p) => {
            const pb = belgeler.filter((b) => b.kullanici_id === p.id);
            const izinde = izinler.find((i) => i.kullanici_id === p.id && i.bas <= v.bugun && i.bit >= v.bugun);
            return (
              <tr key={p.id} className={p.aktif ? '' : 'iptal'}>
                <td><b>{p.ad}</b><div className="kucuk soluk">{p.telefon}</div>{izinde && <span className="rozet sari">İzinde ({tarih(izinde.bit)}’e kadar)</span>}</td>
                <td>{p.kullanici_adi}</td><td>{v.tanimlar.roller[p.rol]}</td><td>{p.sube_id ? y.subeAd(p.sube_id) : 'Bütün şubeler'}</td>
                <td className="kucuk">{['yonetici', 'sube_muduru'].includes(p.rol) ? 'Hepsi' : p.haklar?.length ? p.haklar.map((h) => v.tanimlar.haklar[h]).join(', ') : 'Yalnız kendi öğrencileri ve dersleri'}</td>
                <td className="kucuk">{pb.map((b) => {
                  const f = b.bitis ? gunFarki(v.bugun, b.bitis) : null;
                  return <div key={b.id}>{b.tur}{b.bitis && <> · {tarih(b.bitis)} {f! < 0 ? <span className="rozet kirmizi">geçti</span> : f! <= 30 ? <span className="rozet sari">{f} gün</span> : null}</>}
                    <button className="baglanti" onClick={() => onayla('Belge kaydı silinsin mi?', async () => { await islem('personel_belge_sil', { id: b.id }); await yenile(); })}> ✕</button></div>;
                })}</td>
                <td>{p.aktif ? <span className="rozet yesil">Açık</span> : <span className="rozet gri">Kapalı</span>}</td>
                <td><div className="dugmeler">
                  <button className="dugme kucuk" onClick={() => E.personel(p)}>Düzenle</button>
                  <button className="dugme kucuk" onClick={() => belgeForm(p)}>+ Belge</button>
                  <button className="dugme kucuk" onClick={() => izinForm(p)}>+ İzin</button>
                </div></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Kart>
      {izinler.filter((i) => i.bit >= v.bugun).length > 0 && (
        <Kart baslik="Yaklaşan ve süren izinler">
          <ul className="liste">{izinler.filter((i) => i.bit >= v.bugun).map((i) => (
            <li key={i.id}>{y.kisiAd(i.kullanici_id)} · {i.tur} · {tarih(i.bas)} - {tarih(i.bit)} {i.aciklama && <span className="soluk">({i.aciklama})</span>}
              <button className="dugme kucuk kirmizi" onClick={() => onayla('İzin kaydı silinsin mi?', async () => { await islem('izin_sil', { id: i.id }); await yenile(); })}>Sil</button></li>
          ))}</ul>
        </Kart>
      )}
      {v.gorevlendirmeler.length > 0 && (
        <Kart baslik="Başka şubeye görevlendirmeler">
          <div className="tablo-kutu"><table><tbody>{v.gorevlendirmeler.map((g) => (
            <tr key={g.id}><td>{y.kisiAd(g.kullanici_id)}</td><td>{y.subeAd(g.sube_id)}</td><td>{tarih(g.bas)} - {tarih(g.bit)}</td><td className="kucuk soluk">{g.aciklama}</td>
              <td>{yon && <button className="dugme kucuk kirmizi" onClick={() => onayla('Görevlendirme bugün itibarıyla bitirilsin mi?', async () => { await islem('gorevlendirme_bitir', { id: g.id }); await yenile(); })}>Bitir</button>}</td></tr>
          ))}</tbody></table></div>
        </Kart>
      )}
      {!personel.length && <Bos />}
    </>
  );
}
