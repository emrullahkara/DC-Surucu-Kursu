// İnternetten ön kayıt formu (giriş gerektirmez). Kursun web sitesine bağlantı olarak konur:
//   https://<adres>/k/<kurum kodu>/on-kayit
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FirmaBilgi } from '../Uygulama';

interface Bilgi { kurum: string; logo: string; telefon: string; mesaj: string; subeler: { id: string; ad: string }[]; siniflar: { kod: string; ad: string }[]; kaynaklar: string[]; kvkk: string | null }

export function OnKayit({ firma }: { firma: FirmaBilgi }) {
  const [b, setB] = useState<Bilgi | null>(null);
  const [hata, setHata] = useState('');
  const [bitti, setBitti] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [metinAcik, setMetinAcik] = useState(false);
  const [f, setF] = useState({ ad: '', soyad: '', telefon: '', eposta: '', sinif: 'B', subeId: '', kaynak: '', not: '', kvkkOnay: false, web: '' });
  useEffect(() => {
    api<Bilgi>('/api/on-kayit-bilgi', undefined, firma.kod).then((x) => { setB(x); setF((o) => ({ ...o, subeId: x.subeler.length === 1 ? x.subeler[0].id : '' })); }).catch((e) => setHata(e.message));
    document.title = `Ön kayıt · ${firma.ad}`;
  }, [firma.kod, firma.ad]);
  const koy = (a: keyof typeof f, v: string | boolean) => setF((o) => ({ ...o, [a]: v }));
  if (hata && !b) return <div className="giris"><div className="kart"><h1>{firma.ad}</h1><div className="hata">{hata}</div></div></div>;
  if (!b) return <p className="yukleniyor">Yükleniyor…</p>;
  if (bitti) return (
    <div className="giris"><div className="kart orta">
      {b.logo && <img src={b.logo} alt="" className="kurum-logo" />}
      <h1>Teşekkürler</h1><p>{bitti}</p>
      {b.telefon && <p className="soluk">Acele etmek isterseniz: <a href={`tel:${b.telefon.replace(/[^\d+]/g, '')}`}>{b.telefon}</a></p>}
    </div></div>
  );
  return (
    <div className="giris">
      <div className="logo">{b.logo ? <img src={b.logo} alt="" className="kurum-logo" /> : <img src="/simge.svg" alt="" />}<h1>{b.kurum}</h1><p className="soluk">Ön kayıt formu</p></div>
      <form className="kart" onSubmit={async (e) => {
        e.preventDefault(); setHata(''); setBekliyor(true);
        try { const r = await api<{ mesaj: string }>('/api/on-kayit', f, firma.kod); setBitti(r.mesaj); }
        catch (err) { setHata((err as Error).message); window.scrollTo(0, 0); }
        setBekliyor(false);
      }}>
        {b.mesaj && <p className="bilgi">{b.mesaj}</p>}
        {hata && <div className="hata">{hata}</div>}
        <label className="alan"><span>Adınız *</span><input value={f.ad} onChange={(e) => koy('ad', e.target.value)} autoComplete="given-name" required /></label>
        <label className="alan"><span>Soyadınız *</span><input value={f.soyad} onChange={(e) => koy('soyad', e.target.value)} autoComplete="family-name" required /></label>
        <label className="alan"><span>Cep telefonunuz *</span><input type="tel" value={f.telefon} onChange={(e) => koy('telefon', e.target.value)} autoComplete="tel" placeholder="05xx xxx xx xx" required /></label>
        <label className="alan"><span>E-posta</span><input type="email" value={f.eposta} onChange={(e) => koy('eposta', e.target.value)} autoComplete="email" /></label>
        <label className="alan"><span>Almak istediğiniz ehliyet</span><select value={f.sinif} onChange={(e) => koy('sinif', e.target.value)}>{b.siniflar.map((s) => <option key={s.kod} value={s.kod}>{s.ad}</option>)}</select></label>
        {b.subeler.length > 1 && <label className="alan"><span>Size yakın şube</span><select value={f.subeId} onChange={(e) => koy('subeId', e.target.value)}><option value="">Fark etmez</option>{b.subeler.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}</select></label>}
        <label className="alan"><span>Bizi nereden duydunuz?</span><select value={f.kaynak} onChange={(e) => koy('kaynak', e.target.value)}><option value="">Seçiniz</option>{b.kaynaklar.filter((k) => k !== 'İnternet (ön kayıt)').map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label className="alan"><span>Eklemek istedikleriniz</span><textarea rows={2} value={f.not} onChange={(e) => koy('not', e.target.value)} /></label>
        {/* Tuzak alan: insanlar görmez. */}
        <input type="text" name="web" tabIndex={-1} autoComplete="off" value={f.web} onChange={(e) => koy('web', e.target.value)} style={{ position: 'absolute', left: '-5000px', width: 1, height: 1 }} aria-hidden="true" />
        <div className="secenekler"><label><input type="checkbox" checked={f.kvkkOnay} onChange={(e) => koy('kvkkOnay', e.target.checked)} />
          <span>Kişisel verilerimin başvurumun değerlendirilmesi ve benimle iletişime geçilmesi amacıyla işlenmesine onay veriyorum. {b.kvkk && <button type="button" className="baglanti" onClick={() => setMetinAcik(!metinAcik)}>Aydınlatma metni</button>}</span></label></div>
        {metinAcik && b.kvkk && <div className="metin-kutu">{b.kvkk}</div>}
        <button className="dugme ana buyuk" disabled={bekliyor} style={{ marginTop: 10 }}>{bekliyor ? 'Gönderiliyor…' : 'Başvur'}</button>
        <p className="soluk kucuk">Başvurunuz kursa iletilir; size telefonla dönüş yapılır. Kimlik bilgisi istenmez.</p>
      </form>
    </div>
  );
}
