// Açılış: kurum kodu -> giriş -> personel ekranı ya da öğrenci ekranı.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiHatasi, firmaHatirla, firmaKodu } from './api';
import { Giris, FirmaKodu } from './ekranlar/Giris';
import { Kabuk } from './ekranlar/Kabuk';
import { OgrenciEkrani } from './ekranlar/OgrenciEkrani';

export interface FirmaBilgi { kod: string; ad: string; logo: string; lisans: 'acik' | 'bitti' | 'kapali'; demo: boolean }
type Durum =
  | { ad: 'yukleniyor' }
  | { ad: 'kod'; hata?: string }
  | { ad: 'hata'; mesaj: string }
  | { ad: 'lisans'; firma: FirmaBilgi }
  | { ad: 'giris'; firma: FirmaBilgi }
  | { ad: 'personel'; firma: FirmaBilgi }
  | { ad: 'ogrenci'; firma: FirmaBilgi };

export function Uygulama() {
  const [d, setD] = useState<Durum>({ ad: 'yukleniyor' });

  const basla = useCallback(async () => {
    const kod = firmaKodu();
    if (!kod) return setD({ ad: 'kod' });
    let firma: FirmaBilgi;
    try {
      firma = await api<FirmaBilgi>(`/api/firma?firma=${encodeURIComponent(kod)}`, undefined, kod);
    } catch (e) {
      if ((e as ApiHatasi).durum === 404) { firmaHatirla(null); return setD({ ad: 'kod', hata: `"${kod}" kodlu bir kurum bulunamadı.` }); }
      return setD({ ad: 'hata', mesaj: (e as Error).message });
    }
    firmaHatirla(firma.kod);
    document.title = `${firma.ad} · DC Sürücü Kursu`;
    if (firma.lisans !== 'acik') return setD({ ad: 'lisans', firma });
    try {
      const b = await api<{ tur: 'personel' | 'ogrenci' }>('/api/ben');
      setD({ ad: b.tur, firma });
    } catch (e) {
      if ((e as ApiHatasi).durum === 401) return setD({ ad: 'giris', firma });
      setD({ ad: 'hata', mesaj: (e as Error).message });
    }
  }, []);

  useEffect(() => { basla(); }, [basla]);

  const cikis = useCallback(async () => {
    try { await api('/api/cikis', {}); } catch { /* yine de çık */ }
    basla();
  }, [basla]);
  const kurumDegistir = () => {
    firmaHatirla(null);
    const u = new URL(location.href);
    if (u.searchParams.has('firma') || u.pathname.startsWith('/k/')) history.replaceState(null, '', '/');
    setD({ ad: 'kod' });
  };

  switch (d.ad) {
    case 'yukleniyor': return <p className="yukleniyor">Yükleniyor…</p>;
    case 'kod': return <FirmaKodu hata={d.hata} tamam={(kod) => { firmaHatirla(kod); basla(); }} />;
    case 'hata': return (
      <div className="giris"><div className="kart"><div className="hata">{d.mesaj}</div><button className="dugme ana" onClick={basla}>Tekrar dene</button></div></div>
    );
    case 'lisans': return (
      <div className="giris"><div className="kart">
        <h1>{d.firma.ad}</h1>
        <div className="hata">{d.firma.lisans === 'bitti' ? 'Kurumunuzun kullanım süresi dolmuştur. Kayıtlarınız saklanıyor; uzatmak için DC ile görüşün.' : 'Kurumunuzun hesabı kapalıdır. DC ile görüşün.'}</div>
        <button className="dugme" onClick={kurumDegistir}>Başka kurum kodu gir</button>
      </div></div>
    );
    case 'giris': return <Giris firma={d.firma} tamam={basla} kurumDegistir={kurumDegistir} />;
    case 'personel': return <Kabuk firma={d.firma} cikis={cikis} oturumBitti={basla} />;
    case 'ogrenci': return <OgrenciEkrani cikis={cikis} oturumBitti={basla} />;
  }
}
