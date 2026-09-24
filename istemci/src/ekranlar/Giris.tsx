// Kurum kodu ve giriş ekranı: yetkili, personel ve öğrenci için üç ayrı giriş (ilk istek).
import { useState } from 'react';
import { api } from '../api';
import type { FirmaBilgi } from '../Uygulama';

export function FirmaKodu({ hata, tamam }: { hata?: string; tamam: (kod: string) => void }) {
  const [kod, setKod] = useState('');
  return (
    <div className="giris">
      <div className="logo"><img src="/simge.svg" alt="" /><h1>DC Sürücü Kursu</h1><p className="soluk">Kurumunuzun size verdiği kurum kodunu yazın. Bu cihaz bir sonraki açılışta hatırlar.</p></div>
      <form className="kart" onSubmit={(e) => { e.preventDefault(); if (kod.trim()) tamam(kod.trim().toLocaleLowerCase('tr-TR')); }}>
        {hata && <div className="hata">{hata}</div>}
        <label className="alan"><span>Kurum kodu</span><input value={kod} onChange={(e) => setKod(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="ornek" autoFocus /></label>
        <button className="dugme ana buyuk">Devam</button>
      </form>
    </div>
  );
}

type Kapi = 'yonetici' | 'personel' | 'ogrenci';
export function Giris({ firma, tamam, kurumDegistir }: { firma: FirmaBilgi; tamam: () => void; kurumDegistir: () => void }) {
  const [kapi, setKapi] = useState<Kapi>('yonetici');
  const [a, setA] = useState({ kullaniciAdi: '', sifre: '', tc: '', kod: '' });
  const [kodGerekli, setKodGerekli] = useState(false);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const aciklama = { yonetici: 'Kurum sahibi, merkez yöneticisi ve şube müdürleri.', personel: 'Büro, muhasebe personeli ve eğitmenler.', ogrenci: 'Kursiyerler: ders, sınav ve ödeme bilgileriniz.' }[kapi];

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(''); setBekliyor(true);
    try {
      if (kapi === 'ogrenci') await api('/api/ogrenci-giris', { tc: a.tc.trim(), sifre: a.sifre });
      else {
        const r = await api<{ kodGerekli?: boolean }>('/api/giris', { kullaniciAdi: a.kullaniciAdi.trim(), sifre: a.sifre, kapi, kod: kodGerekli ? a.kod : undefined });
        if (r.kodGerekli) { setKodGerekli(true); setBekliyor(false); return; }
      }
      tamam();
    } catch (err) { setHata((err as Error).message); }
    setBekliyor(false);
  }
  const alan = (ad: keyof typeof a, etiket: string, tip = 'text', oto?: string) => (
    <label className="alan"><span>{etiket}</span>
      <input type={tip} value={a[ad]} autoComplete={oto} inputMode={ad === 'tc' || ad === 'kod' ? 'numeric' : undefined} autoCapitalize="none"
        onChange={(e) => setA({ ...a, [ad]: e.target.value })} />
    </label>
  );
  return (
    <div className="giris">
      <div className="logo">{firma.logo ? <img src={firma.logo} alt="" className="kurum-logo" /> : <img src="/simge.svg" alt="" />}<h1>{firma.ad}</h1></div>
      <div className="kapilar" role="tablist">
        {([['yonetici', 'Yetkili girişi'], ['personel', 'Personel girişi'], ['ogrenci', 'Öğrenci girişi']] as [Kapi, string][]).map(([k, e]) => (
          <button key={k} type="button" role="tab" aria-selected={kapi === k} className={kapi === k ? 'secili' : ''} onClick={() => { setKapi(k); setHata(''); setKodGerekli(false); }}>{e}</button>
        ))}
      </div>
      <form className="kart" onSubmit={gonder}>
        <p className="soluk kucuk">{aciklama}</p>
        {hata && <div className="hata">{hata}</div>}
        {kapi === 'ogrenci' ? alan('tc', 'T.C. kimlik no', 'text', 'username') : alan('kullaniciAdi', 'Kullanıcı adı', 'text', 'username')}
        {alan('sifre', 'Şifre', 'password', 'current-password')}
        {kodGerekli && <>{alan('kod', 'Doğrulama kodu (telefonunuzdaki uygulamadan 6 hane ya da kurtarma kodu)', 'text', 'one-time-code')}</>}
        <button className="dugme ana buyuk" disabled={bekliyor}>{bekliyor ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </form>
      {firma.demo && (
        <div className="bilgi kucuk">
          <b>Deneme kurumu (bütün veriler uydurmadır).</b><br />
          Yetkili: <code>patron</code> (merkez), <code>mudur</code> (Çankaya şubesi)<br />
          Personel: <code>buro</code>, <code>muhasebe</code>, <code>egitmen1</code>, <code>egitmen2</code><br />
          Şifre: <code>Deneme123!</code> · Öğrenci: T.C. <code>10000000146</code>, şifre <code>ogrenci1</code>
        </div>
      )}
      <p className="orta"><button className="baglanti" onClick={kurumDegistir}>Başka kurum kodu gir</button></p>
    </div>
  );
}
