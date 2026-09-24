// Hesabım: bilgiler, şifre değiştirme, isteğe bağlı ek doğrulama kodu (karar 18), kayıt defteri.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useY, type EkranP } from '../baglam';
import { api, islem } from '../api';
import { Bos, Kart, bildir, icerikPenceresi, pencere, pencereKapat, IsDugmesi } from '../bilesenler/ortak';
import { zamanYaz } from '../yardim';

export function Hesap(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const b = v.ben;
  const sifre = () => pencere('Şifre değiştir', [
    { ad: 'eskiSifre', etiket: 'Mevcut şifre', tip: 'password', zorunlu: true, otomatik: 'current-password' },
    { ad: 'yeniSifre', etiket: 'Yeni şifre (en az 8 karakter)', tip: 'password', zorunlu: true, otomatik: 'new-password' },
  ], async (g) => { await islem('sifre_degistir', g); bildir('Şifreniz değiştirildi.', 'tamam'); });

  const totpAc = async () => {
    const r = await islem<{ gizli: string; uri: string }>('totp_baslat');
    const resim = await QRCode.toDataURL(r.uri, { margin: 1, width: 220 });
    icerikPenceresi('Ek doğrulama kodunu aç', <TotpKurulum resim={resim} gizli={r.gizli} bitti={async (kodlar) => {
      await y.b.yenile();
      icerikPenceresi('Kurtarma kodları', (
        <div>
          <p className="hata">Bu kodları şimdi yazın ya da yazdırın. Bir daha gösterilmez. Telefonunuzu kaybederseniz her biriyle bir kez giriş yapabilirsiniz.</p>
          <ul className="kodlar">{kodlar.map((k) => <li key={k}><code>{k}</code></li>)}</ul>
          <div className="alt"><button type="button" className="dugme" onClick={() => window.print()}>Yazdır</button><button type="button" className="dugme ana" onClick={pencereKapat}>Yazdım, kapat</button></div>
        </div>
      ), false);
    }} />, false);
  };
  const totpKapat = () => pencere('Ek doğrulama kodunu kapat', [
    { ad: 'sifre', etiket: 'Şifreniz', tip: 'password', zorunlu: true, otomatik: 'current-password' },
    { ad: 'kod', etiket: 'Telefondaki 6 haneli kod', zorunlu: true },
  ], async (g) => { await islem('totp_kapat', g); await y.b.yenile(); bildir('Ek doğrulama kapatıldı.', 'tamam'); }, { tehlike: true, dugme: 'Kapat' });

  return (
    <>
      <Kart baslik={<h1>Hesabım</h1>}>
        <div className="detay-bilgi">
          <div><span>Ad</span>{b.ad}</div><div><span>Kullanıcı adı</span>{b.kullanici_adi}</div>
          <div><span>Görev</span>{v.tanimlar.roller[b.rol]}</div><div><span>Şube</span>{b.sube_id ? y.subeAd(b.sube_id) : 'Bütün şubeler'}</div>
        </div>
        <h3>Yetkilerim</h3>
        <p className="kucuk">{b.haklar.length ? b.haklar.map((h) => v.tanimlar.haklar[h]).join(' · ') : 'Yalnız kendi öğrencileriniz ve dersleriniz.'}</p>
        <div className="dugmeler"><button className="dugme" onClick={sifre}>Şifremi değiştir</button></div>
      </Kart>
      <Kart baslik="Ek doğrulama kodu (isteğe bağlı)">
        <p className="kucuk">Açarsanız girişte şifreden sonra telefonunuzdaki Google Authenticator veya Microsoft Authenticator uygulamasının gösterdiği 6 haneli kod da istenir. Şifreniz başkasının eline geçse bile hesabınıza girilemez.</p>
        {b.totp ? <p><span className="rozet yesil">Açık</span> <button className="dugme kucuk kirmizi" onClick={totpKapat}>Kapat</button></p>
          : <IsDugmesi className="dugme ana" is={totpAc}>Aç</IsDugmesi>}
      </Kart>
      {(b.rol === 'yonetici' || b.rol === 'sube_muduru') && <KayitDefteri />}
    </>
  );
}

// Pencere, ekran bağlamı dışında çizilir; gereken her şey dışarıdan verilir.
function TotpKurulum({ resim, gizli, bitti }: { resim: string; gizli: string; bitti: (kodlar: string[]) => Promise<void> }) {
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState('');
  return (
    <div>
      <ol className="kucuk">
        <li>Telefonunuza Google Authenticator veya Microsoft Authenticator uygulamasını kurun.</li>
        <li>Uygulamada "+" ile aşağıdaki kareyi okutun. Okutamazsanız anahtarı elle yazın.</li>
        <li>Uygulamanın gösterdiği 6 haneli kodu aşağıya yazın.</li>
      </ol>
      <p className="orta"><img src={resim} alt="Doğrulama kodu karesi" width={220} height={220} /></p>
      <p className="orta kucuk"><code>{gizli.match(/.{1,4}/g)?.join(' ')}</code></p>
      {hata && <div className="hata">{hata}</div>}
      <label className="alan"><span>6 haneli kod</span><input inputMode="numeric" value={kod} onChange={(e) => setKod(e.target.value)} autoComplete="one-time-code" /></label>
      <div className="alt">
        <button type="button" className="dugme" onClick={pencereKapat}>Vazgeç</button>
        <IsDugmesi className="dugme ana" is={async () => {
          try { const r = await islem<{ kurtarmaKodlari: string[] }>('totp_ac', { kod }); await bitti(r.kurtarmaKodlari); }
          catch (e) { setHata((e as Error).message); }
        }}>Doğrula ve aç</IsDugmesi>
      </div>
    </div>
  );
}

// Kim, ne zaman, ne yaptı. Silinen veya iptal edilen hiçbir şey kaybolmaz.
function KayitDefteri() {
  const y = useY();
  const [l, setL] = useState<{ id: number; zaman: string; sube_id: string | null; kullanici: string; tur: string; metin: string }[] | null>(null);
  const [ara, setAra] = useState('');
  const [kisi, setKisi] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api<{ olaylar: typeof l }>(`/api/kayit-defteri?ara=${encodeURIComponent(ara)}&kisi=${encodeURIComponent(kisi)}${y.b.sube ? `&sube=${y.b.sube}` : ''}`)
      .then((r) => setL(r.olaylar)).catch((e) => bildir(e.message, 'hata')), 250);
    return () => clearTimeout(t);
  }, [ara, kisi, y.b.sube, y.b.v]);
  const kisiler = [...new Set((l || []).map((x) => x.kullanici))];
  return (
    <Kart baslik="Kayıt defteri">
      <div className="suzgec">
        <input type="search" placeholder="Ara (öğrenci adı, işlem…)" value={ara} onChange={(e) => setAra(e.target.value)} />
        <select value={kisi} onChange={(e) => setKisi(e.target.value)}><option value="">Herkes</option>{kisiler.map((k) => <option key={k} value={k}>{k}</option>)}</select>
      </div>
      {!l ? <Bos>Yükleniyor…</Bos> : l.length ? (
        <div className="tablo-kutu"><table><tbody>{l.map((o) => (
          <tr key={o.id}><td className="kucuk">{zamanYaz(o.zaman)}</td><td>{o.metin}</td><td className="kucuk">{o.kullanici}</td>{y.subeSutunu && <td className="kucuk">{y.subeAd(o.sube_id)}</td>}</tr>
        ))}</tbody></table></div>
      ) : <Bos>Kayıt bulunamadı.</Bos>}
    </Kart>
  );
}
