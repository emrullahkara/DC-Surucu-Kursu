// Açılış: kurum kodu -> giriş -> personel ekranı ya da öğrenci ekranı.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiHatasi, firmaHatirla, firmaKodu, kuyrukOku, sonVeriOku, sonVeriSil } from './api';
import { Giris, FirmaKodu } from './ekranlar/Giris';
import { Kabuk } from './ekranlar/Kabuk';
import { OgrenciEkrani } from './ekranlar/OgrenciEkrani';
import { OnKayit } from './ekranlar/OnKayit';
import { onayla } from './bilesenler/ortak';

export interface FirmaBilgi { kod: string; ad: string; logo: string; lisans: 'acik' | 'bitti' | 'kapali'; lisansBitis?: string; demo: boolean; onKayit?: boolean }
// İnternetten ön kayıt sayfası: /k/<kurum kodu>/on-kayit ya da ?firma=<kod>&onkayit=1 (giriş gerektirmez).
const onKayitSayfasi = () => /\/on-kayit\/?$/.test(location.pathname) || new URL(location.href).searchParams.has('onkayit');
type Durum =
  | { ad: 'yukleniyor' }
  | { ad: 'kod'; hata?: string }
  | { ad: 'hata'; mesaj: string }
  | { ad: 'lisans'; firma: FirmaBilgi }
  | { ad: 'giris'; firma: FirmaBilgi }
  | { ad: 'personel'; firma: FirmaBilgi }
  | { ad: 'ogrenci'; firma: FirmaBilgi }
  | { ad: 'onkayit'; firma: FirmaBilgi };

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
    if (onKayitSayfasi()) return setD({ ad: 'onkayit', firma });
    if (firma.lisans !== 'acik') return setD({ ad: 'lisans', firma });
    try {
      const b = await api<{ tur: 'personel' | 'ogrenci' }>('/api/ben');
      setD({ ad: b.tur, firma });
    } catch (e) {
      if ((e as ApiHatasi).durum === 401) return setD({ ad: 'giris', firma });
      setD({ ad: 'hata', mesaj: (e as Error).message });
    }
  }, []);
  // İnternet yokken açılış: kurum bilgisi alınamaz; eğitmenin telefonda saklanan son listesi varsa o gösterilir.
  const cevrimdisiAc = useCallback(() => {
    const s = sonVeriOku<{ kurum: { ad: string; logo: string } }>();
    if (!s) return false;
    setD({ ad: 'personel', firma: { kod: firmaKodu(), ad: s.v.kurum.ad, logo: s.v.kurum.logo, lisans: 'acik', demo: false } });
    return true;
  }, []);

  useEffect(() => { basla(); }, [basla]);
  useEffect(() => { if (d.ad === 'hata' && !navigator.onLine) cevrimdisiAc(); }, [d.ad, cevrimdisiAc]);

  const cikis = useCallback(async () => {
    const bitir = async () => {
      try { await api('/api/cikis', {}); } catch { /* yine de çık */ }
      sonVeriSil();
      basla();
    };
    // Gönderilmemiş kayıt varsa uyar: kayıtlar silinmez, aynı kişi tekrar girince gönderilir.
    const n = kuyrukOku().length;
    if (n) onayla(`${n} kayıt henüz merkeze gönderilmedi (internet yok). Çıkarsanız kayıtlar bu telefonda saklanır ve siz tekrar girdiğinizde gönderilir. Başka biri bu telefonla giriş yaparsa onun adına GÖNDERİLMEZ. Çıkılsın mı?`, bitir, 'Çık');
    else bitir();
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
      <div className="giris"><div className="kart"><div className="hata">{d.mesaj}</div><button className="dugme ana" onClick={basla}>Tekrar dene</button>
        {sonVeriOku() && <button className="dugme" onClick={cevrimdisiAc}>İnternetsiz devam et (son liste)</button>}</div></div>
    );
    case 'onkayit': return <OnKayit firma={d.firma} />;
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
