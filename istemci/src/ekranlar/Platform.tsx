// DC platform yönetimi (/platform): kurs firması açma, lisans süresi, şube sınırı. Firmaların içeriği görülmez.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiHatasi } from '../api';
import { Bos, Kart, bildir, pencere } from '../bilesenler/ortak';
import { gunEkle, tarih } from '../yardim';

interface Firma { kod: string; ad: string; yetkili: string; telefon: string; eposta: string; lisans_bitis: string; aktif: number; max_sube: number; notlar: string; lisans: string }

export function PlatformEkrani() {
  const [d, setD] = useState<{ ben: string; bugun: string; firmalar: Firma[] } | null>(null);
  const [durum, setDurum] = useState<'yukleniyor' | 'giris' | 'kurulum' | 'tamam'>('yukleniyor');
  const [a, setA] = useState({ kullaniciAdi: '', sifre: '' });
  const [hata, setHata] = useState('');
  const yukle = useCallback(async () => {
    try { setD(await api('/api/platform/firmalar', undefined, '')); setDurum('tamam'); }
    catch (e) {
      if ((e as ApiHatasi).durum !== 401) return setHata((e as Error).message);
      const k = await api<{ kurulu: boolean }>('/api/platform/durum', undefined, '');
      setDurum(k.kurulu ? 'giris' : 'kurulum');
    }
  }, []);
  useEffect(() => { document.title = 'DC Platform'; yukle(); }, [yukle]);

  if (durum === 'yukleniyor') return <p className="yukleniyor">Yükleniyor…</p>;
  if (durum !== 'tamam') return (
    <div className="giris">
      <div className="logo"><img src="/simge.svg" alt="" /><h1>DC Platform yönetimi</h1><p className="soluk">{durum === 'kurulum' ? 'İlk platform yöneticisini oluşturun (yalnız sunucunun kendi bilgisayarından).' : 'Kurs firmalarını ve lisansları yönetin.'}</p></div>
      <form className="kart" onSubmit={async (e) => {
        e.preventDefault(); setHata('');
        try {
          if (durum === 'kurulum') await api('/api/platform/kurulum', a, '');
          await api('/api/platform/giris', a, '');
          yukle();
        } catch (err) { setHata((err as Error).message); }
      }}>
        {hata && <div className="hata">{hata}</div>}
        <label className="alan"><span>Kullanıcı adı</span><input value={a.kullaniciAdi} onChange={(e) => setA({ ...a, kullaniciAdi: e.target.value })} autoComplete="username" /></label>
        <label className="alan"><span>Şifre</span><input type="password" value={a.sifre} onChange={(e) => setA({ ...a, sifre: e.target.value })} autoComplete={durum === 'kurulum' ? 'new-password' : 'current-password'} /></label>
        <button className="dugme ana buyuk">{durum === 'kurulum' ? 'Oluştur' : 'Giriş yap'}</button>
      </form>
    </div>
  );
  if (!d) return null;
  const firmaAc = () => pencere('Yeni kurs firması', [
    { ad: 'ad', etiket: 'Kurum adı', zorunlu: true }, { ad: 'kod', etiket: 'Kurum kodu', zorunlu: true, not: 'Girişte yazılır. Küçük harf, rakam, tire; Türkçe harf yok. Örnek: yildiz-kurs' },
    { ad: 'yetkili', etiket: 'Yetkili kişi' }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel' }, { ad: 'eposta', etiket: 'E-posta', tip: 'email' },
    { ad: 'lisansBitis', etiket: 'Lisans bitiş', tip: 'date', deger: gunEkle(d.bugun, 365), zorunlu: true },
    { ad: 'maxSube', etiket: 'En fazla şube', tip: 'number', deger: 1, min: 1, max: 100 },
    { ad: 'subeAdi', etiket: 'İlk şubenin adı', deger: 'Merkez' },
    { tip: 'bilgi', html: 'Kurumun ilk yöneticisi (kurum sahibi):' },
    { ad: 'yAd', etiket: 'Yönetici ad soyad', zorunlu: true }, { ad: 'yKad', etiket: 'Yönetici kullanıcı adı', zorunlu: true }, { ad: 'ySifre', etiket: 'Yönetici ilk şifresi', zorunlu: true },
    { ad: 'notlar', etiket: 'Not', tip: 'textarea' },
  ], async (g) => {
    await api('/api/platform/firma-ac', { ...g, yonetici: { ad: g.yAd, kullaniciAdi: g.yKad, sifre: g.ySifre } }, '');
    await yukle(); bildir(`Firma açıldı. Giriş adresi: ${location.origin}/?firma=${g.kod}`, 'tamam');
  }, { ikili: true, genis: true });
  const duzenle = (f: Firma) => pencere(`${f.ad} (${f.kod})`, [
    { ad: 'ad', etiket: 'Kurum adı', deger: f.ad, zorunlu: true }, { ad: 'yetkili', etiket: 'Yetkili', deger: f.yetkili },
    { ad: 'telefon', etiket: 'Telefon', deger: f.telefon }, { ad: 'eposta', etiket: 'E-posta', deger: f.eposta },
    { ad: 'lisansBitis', etiket: 'Lisans bitiş', tip: 'date', deger: f.lisans_bitis }, { ad: 'maxSube', etiket: 'En fazla şube', tip: 'number', deger: f.max_sube },
    { ad: 'aktif', etiket: 'Hesap açık', tip: 'onay', deger: !!f.aktif }, { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: f.notlar },
  ], async (g) => { await api('/api/platform/firma-duzenle', { kod: f.kod, ...g }, ''); await yukle(); bildir('Kaydedildi.', 'tamam'); }, { ikili: true });
  return (
    <>
      <header className="ust"><div><div className="kurum">DC Platform</div><div className="kim">{d.ben}</div></div>
        <div className="sag"><button className="dugme kucuk ust-cikis" onClick={async () => { await api('/api/platform/cikis', {}, ''); setDurum('giris'); }}>Çıkış</button></div></header>
      <main>
        <Kart baslik={<h1>Kurs firmaları</h1>} sag={<button className="dugme ana" onClick={firmaAc}>+ Firma aç</button>}>
          {d.firmalar.length ? <div className="tablo-kutu"><table>
            <thead><tr><th>Kurum</th><th>Kod</th><th>Yetkili</th><th>Lisans</th><th className="sayi-h">Şube sınırı</th><th></th></tr></thead>
            <tbody>{d.firmalar.map((f) => (
              <tr key={f.kod}><td><b>{f.ad}</b><div className="kucuk soluk">{f.notlar}</div></td><td><code>{f.kod}</code></td><td>{f.yetkili}<div className="kucuk soluk">{f.telefon} {f.eposta}</div></td>
                <td>{tarih(f.lisans_bitis)} {f.lisans === 'acik' ? <span className="rozet yesil">Açık</span> : f.lisans === 'bitti' ? <span className="rozet kirmizi">Süre doldu</span> : <span className="rozet gri">Kapalı</span>}</td>
                <td className="sayi-h">{f.max_sube}</td><td><button className="dugme kucuk" onClick={() => duzenle(f)}>Düzenle</button></td></tr>
            ))}</tbody>
          </table></div> : <Bos>Henüz firma yok.</Bos>}
        </Kart>
      </main>
    </>
  );
}
