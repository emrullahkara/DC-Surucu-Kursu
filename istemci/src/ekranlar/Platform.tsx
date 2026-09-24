// DC platform yönetimi (/platform): kurs firması açma, lisans ve ödemeleri, kullanıcı ve şube sınırı,
// kullanım özeti, yedekler, yöneticiye şifre sıfırlama kodu. Firmaların içeriği (öğrenci, para) görülmez.
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiHatasi } from '../api';
import { Bos, IsDugmesi, Kart, Sayi, bildir, icerikPenceresi, pencere, pencereKapat } from '../bilesenler/ortak';
import { gunEkle, gunFarki, tarih, tl, zamanYaz } from '../yardim';

interface Firma {
  kod: string; ad: string; yetkili: string; telefon: string; eposta: string; lisans_bitis: string; aktif: number; max_sube: number; max_kullanici: number;
  yillik_ucret: number; notlar: string; lisans: string; odenen: number; sonOdeme: string;
}
interface Kullanim { kod: string; ad: string; sube?: number; personel?: number; ogrenci?: number; aktifOgrenci?: number; buAyKayit?: number; buAyDers?: number; evrakMb?: number; boyutMb?: number; sonGiris?: string; sonHareket?: string; hata?: string }
interface Durum { ben: string; totp: boolean; bugun: string; firmalar: Firma[]; yedekTuru: '' | 'dosya' | 'zaman' }
const p = <T = any,>(yol: string, govde?: unknown) => api<T>('/api/platform/' + yol, govde, '');

export function PlatformEkrani() {
  const [d, setD] = useState<Durum | null>(null);
  const [durum, setDurum] = useState<'yukleniyor' | 'giris' | 'kurulum' | 'tamam'>('yukleniyor');
  const [a, setA] = useState({ kullaniciAdi: '', sifre: '', kod: '' });
  const [kodGerekli, setKodGerekli] = useState(false);
  const [hata, setHata] = useState('');
  const [sekme, setSekme] = useState<'firmalar' | 'kullanim' | 'kayitlar'>('firmalar');
  const yukle = useCallback(async () => {
    try { setD(await p<Durum>('firmalar')); setDurum('tamam'); }
    catch (e) {
      if ((e as ApiHatasi).durum !== 401) return setHata((e as Error).message);
      const k = await p<{ kurulu: boolean }>('durum');
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
          if (durum === 'kurulum') await p('kurulum', a);
          const r = await p<{ kodGerekli?: boolean }>('giris', { kullaniciAdi: a.kullaniciAdi, sifre: a.sifre, kod: kodGerekli ? a.kod : undefined });
          if (r.kodGerekli) { setKodGerekli(true); return; }
          yukle();
        } catch (err) { setHata((err as Error).message); }
      }}>
        {hata && <div className="hata">{hata}</div>}
        <label className="alan"><span>Kullanıcı adı</span><input value={a.kullaniciAdi} onChange={(e) => setA({ ...a, kullaniciAdi: e.target.value })} autoComplete="username" /></label>
        <label className="alan"><span>Şifre</span><input type="password" value={a.sifre} onChange={(e) => setA({ ...a, sifre: e.target.value })} autoComplete={durum === 'kurulum' ? 'new-password' : 'current-password'} /></label>
        {kodGerekli && <label className="alan"><span>Doğrulama kodu (6 hane)</span><input inputMode="numeric" value={a.kod} onChange={(e) => setA({ ...a, kod: e.target.value })} autoComplete="one-time-code" autoFocus /></label>}
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
    { ad: 'maxKullanici', etiket: 'En fazla açık personel hesabı (0 = sınırsız)', tip: 'number', deger: 0, min: 0 },
    { ad: 'yillikUcret', etiket: 'Yıllık ücret (₺)', tip: 'para' },
    { ad: 'subeAdi', etiket: 'İlk şubenin adı', deger: 'Merkez' },
    { tip: 'bilgi', html: 'Kurumun ilk yöneticisi (kurum sahibi):' },
    { ad: 'yAd', etiket: 'Yönetici ad soyad', zorunlu: true }, { ad: 'yKad', etiket: 'Yönetici kullanıcı adı', zorunlu: true }, { ad: 'ySifre', etiket: 'Yönetici ilk şifresi', zorunlu: true },
    { ad: 'notlar', etiket: 'Not', tip: 'textarea' },
  ], async (g) => {
    await p('firma-ac', { ...g, yonetici: { ad: g.yAd, kullaniciAdi: g.yKad, sifre: g.ySifre } });
    await yukle(); bildir(`Firma açıldı. Giriş adresi: ${location.origin}/?firma=${g.kod}`, 'tamam');
  }, { ikili: true, genis: true });
  const duzenle = (f: Firma) => pencere(`${f.ad} (${f.kod})`, [
    { ad: 'ad', etiket: 'Kurum adı', deger: f.ad, zorunlu: true }, { ad: 'yetkili', etiket: 'Yetkili', deger: f.yetkili },
    { ad: 'telefon', etiket: 'Telefon', deger: f.telefon }, { ad: 'eposta', etiket: 'E-posta', deger: f.eposta },
    { ad: 'lisansBitis', etiket: 'Lisans bitiş', tip: 'date', deger: f.lisans_bitis }, { ad: 'maxSube', etiket: 'En fazla şube', tip: 'number', deger: f.max_sube },
    { ad: 'maxKullanici', etiket: 'En fazla açık personel (0 = sınırsız)', tip: 'number', deger: f.max_kullanici }, { ad: 'yillikUcret', etiket: 'Yıllık ücret (₺)', tip: 'para', deger: f.yillik_ucret },
    { ad: 'aktif', etiket: 'Hesap açık', tip: 'onay', deger: !!f.aktif }, { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: f.notlar },
  ], async (g) => { await p('firma-duzenle', { kod: f.kod, ...g }); await yukle(); bildir('Kaydedildi.', 'tamam'); }, { ikili: true });
  const odemeler = async (f: Firma) => {
    const r = await p<{ odemeler: { id: string; tarih: string; tutar: number; donem_bas: string; donem_bit: string; fatura_no: string; aciklama: string; kaydeden: string; iptal: number }[] }>(`lisans-odemeleri?kod=${f.kod}`);
    const ekle = () => pencere(`Lisans ödemesi · ${f.ad}`, [
      { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', deger: f.yillik_ucret, zorunlu: true }, { ad: 'tarih', etiket: 'Ödeme tarihi', tip: 'date', deger: d.bugun },
      { ad: 'donemBas', etiket: 'Dönem başı', tip: 'date', deger: f.lisans_bitis > d.bugun ? f.lisans_bitis : d.bugun },
      { ad: 'donemBit', etiket: 'Dönem sonu', tip: 'date', deger: gunEkle(f.lisans_bitis > d.bugun ? f.lisans_bitis : d.bugun, 365) },
      { ad: 'faturaNo', etiket: 'Fatura no' }, { ad: 'aciklama', etiket: 'Açıklama' },
      { ad: 'lisansUzat', etiket: 'Lisans bitiş tarihini dönem sonuna uzat', tip: 'onay', deger: true },
    ], async (g) => { await p('lisans-odeme', { kod: f.kod, ...g }); await yukle(); bildir('Ödeme kaydedildi.', 'tamam'); }, { ikili: true });
    icerikPenceresi(`Lisans ödemeleri · ${f.ad}`, (
      <div>
        <p className="kucuk">Yıllık ücret: <b>{tl(f.yillik_ucret)}</b> · toplam ödenen: <b>{tl(f.odenen)}</b> · lisans bitiş: <b>{tarih(f.lisans_bitis)}</b></p>
        {r.odemeler.length ? <div className="tablo-kutu"><table><tbody>{r.odemeler.map((o) => (
          <tr key={o.id} className={o.iptal ? 'iptal' : ''}><td>{tarih(o.tarih)}</td><td className="sayi-h">{tl(o.tutar)}</td><td className="kucuk">{o.donem_bas && `${tarih(o.donem_bas)} - ${tarih(o.donem_bit)}`}<div className="soluk">{o.fatura_no} {o.aciklama}</div></td>
            <td>{!o.iptal && <IsDugmesi className="dugme kucuk kirmizi" is={async () => { await p('lisans-odeme', { kod: f.kod, iptalId: o.id }); await yukle(); pencereKapat(); bildir('İptal edildi.', 'tamam'); }}>İptal</IsDugmesi>}</td></tr>
        ))}</tbody></table></div> : <Bos>Ödeme kaydı yok.</Bos>}
        <div className="alt"><button type="button" className="dugme" onClick={pencereKapat}>Kapat</button><button type="button" className="dugme ana" onClick={ekle}>+ Ödeme</button></div>
      </div>
    ));
  };
  const yedekler = async (f: Firma) => {
    const r = await p<{ yedekler: { ad: string; zaman: string; boyut: number }[]; tur: string }>(`yedekler?kod=${f.kod}`);
    const don = (secim: { ad?: string; zaman?: string }, yazi: string) => pencere(`Yedekten dön · ${f.ad}`, [
      { tip: 'bilgi', html: <>Kurumun bütün kayıtları <b>{yazi}</b> haline döner; sonrasında girilen kayıtlar kaybolur. {r.tur === 'dosya' ? 'Dönmeden önce bugünkü hal ayrıca yedeklenir.' : 'Dönmeden önceki ana da yeniden dönülebilir.'} Kuruma önceden haber verin.</> },
      { ad: 'onay', etiket: `Onay için firma kodunu yazın (${f.kod})`, zorunlu: true },
    ], async (g) => { await p('yedek-don', { kod: f.kod, ...secim, onay: g.onay }); bildir('Yedeğe dönüldü.', 'tamam'); }, { dugme: 'Yedeğe dön', tehlike: true });
    icerikPenceresi(`Yedekler · ${f.ad}`, r.tur === 'zaman' ? (
      <ZamanaDon don={(z) => don({ zaman: new Date(z).toISOString() }, zamanYaz(new Date(z).toISOString()))} />
    ) : (
      <div>
        <p className="kucuk">Her gün kendiliğinden bir yedek alınır ve son 30 gün saklanır. Veri anahtarı dosyası (veri-anahtari.txt) yedeklerle birlikte ayrıca saklanmalıdır.</p>
        {r.yedekler.length ? <div className="tablo-kutu"><table><tbody>{r.yedekler.map((x) => (
          <tr key={x.ad}><td className="kucuk">{x.ad}</td><td className="kucuk">{zamanYaz(x.zaman)}</td><td className="sayi-h kucuk">{(x.boyut / 1048576).toFixed(1)} MB</td>
            <td><button type="button" className="dugme kucuk kirmizi" onClick={() => don({ ad: x.ad }, zamanYaz(x.zaman))}>Bu yedeğe dön</button></td></tr>
        ))}</tbody></table></div> : <Bos>Henüz yedek yok.</Bos>}
        <div className="alt"><button type="button" className="dugme" onClick={pencereKapat}>Kapat</button>
          <IsDugmesi className="dugme ana" is={async () => { const y = await p<{ ad: string }>('yedek-al', { kod: f.kod }); pencereKapat(); bildir(`Yedek alındı: ${y.ad}`, 'tamam'); }}>Şimdi yedek al</IsDugmesi></div>
      </div>
    ));
  };
  const yoneticiKodu = (f: Firma) => pencere(`Yönetici şifre sıfırlama · ${f.ad}`, [
    { tip: 'bilgi', html: 'Kurumun yöneticisi şifresini unuttuysa ve kurumda kodu verecek başka yönetici yoksa kullanın. Kişinin kimliğinden telefonla emin olun.' },
    { ad: 'kullaniciAdi', etiket: 'Yöneticinin kullanıcı adı', zorunlu: true },
  ], async (g) => {
    const r = await p<{ kod: string; ad: string }>('yonetici-kodu', { kod: f.kod, kullaniciAdi: g.kullaniciAdi });
    setTimeout(() => icerikPenceresi('Sıfırlama kodu', (
      <div><p className="kucuk">{r.ad} giriş ekranında "Şifremi unuttum &gt; Kodum var" ile bu kodu kullanır. 60 dakika geçerli, tek kullanımlık.</p>
        <div className="kod-kutu">{r.kod}</div><div className="alt"><button type="button" className="dugme ana" onClick={pencereKapat}>Tamam</button></div></div>
    ), false), 50);
  }, { dugme: 'Kod üret' });
  const hesabim = () => icerikPenceresi('Platform hesabım', <PlatformHesap totp={d.totp} yenile={yukle} />, false);
  const kalanGun = (f: Firma) => gunFarki(d.bugun, f.lisans_bitis);
  const yaklasan = d.firmalar.filter((f) => f.aktif && kalanGun(f) >= 0 && kalanGun(f) <= 30);
  return (
    <>
      <header className="ust"><div><div className="kurum">DC Platform</div><div className="kim">{d.ben}{d.totp ? ' · ek doğrulama açık' : ''}</div></div>
        <div className="sag"><button className="dugme kucuk ust-cikis" onClick={hesabim}>Hesabım</button>
          <button className="dugme kucuk ust-cikis" onClick={async () => { await p('cikis', {}); setDurum('giris'); }}>Çıkış</button></div></header>
      <nav className="menu">{([['firmalar', 'Kurs firmaları'], ['kullanim', 'Kullanım'], ['kayitlar', 'Kayıtlar']] as const).map(([k, e]) => (
        <button key={k} className={sekme === k ? 'secili' : ''} onClick={() => setSekme(k)}>{e}</button>
      ))}</nav>
      <main>
        {!d.totp && <p className="uyari-kutu">Platform hesabınızda ek doğrulama kodu kapalı. Güvenlik için açmanız önerilir. <button className="dugme kucuk" onClick={hesabim}>Aç</button></p>}
        {sekme === 'firmalar' && <>
          <div className="sayilar">
            <Sayi etiket="Açık firma" deger={d.firmalar.filter((f) => f.lisans === 'acik').length} />
            <Sayi etiket="30 gün içinde lisansı biten" deger={yaklasan.length} uyari={yaklasan.length > 0} />
            <Sayi etiket="Süresi dolan / kapalı" deger={d.firmalar.filter((f) => f.lisans !== 'acik').length} />
            <Sayi etiket="Yıllık ücret toplamı" deger={tl(d.firmalar.filter((f) => f.aktif).reduce((x, f) => x + f.yillik_ucret, 0))} />
          </div>
          <Kart baslik={<h1>Kurs firmaları</h1>} sag={<button className="dugme ana" onClick={firmaAc}>+ Firma aç</button>}>
            {d.firmalar.length ? <div className="tablo-kutu"><table>
              <thead><tr><th>Kurum</th><th>Kod</th><th>Yetkili</th><th>Lisans</th><th className="sayi-h">Sınır</th><th className="sayi-h">Ödenen</th><th></th></tr></thead>
              <tbody>{d.firmalar.map((f) => (
                <tr key={f.kod}><td><b>{f.ad}</b><div className="kucuk soluk">{f.notlar}</div></td><td><code>{f.kod}</code></td><td>{f.yetkili}<div className="kucuk soluk">{f.telefon} {f.eposta}</div></td>
                  <td>{tarih(f.lisans_bitis)} {f.lisans === 'acik' ? (kalanGun(f) <= 30 ? <span className="rozet sari">{kalanGun(f)} gün</span> : <span className="rozet yesil">Açık</span>) : f.lisans === 'bitti' ? <span className="rozet kirmizi">Süre doldu</span> : <span className="rozet gri">Kapalı</span>}</td>
                  <td className="sayi-h kucuk">{f.max_sube} şube<div className="soluk">{f.max_kullanici ? `${f.max_kullanici} kişi` : 'kişi sınırsız'}</div></td>
                  <td className="sayi-h">{tl(f.odenen)}<div className="kucuk soluk">{f.sonOdeme ? `son ${tarih(f.sonOdeme)}` : 'ödeme yok'}</div></td>
                  <td><div className="dugmeler">
                    <button className="dugme kucuk" onClick={() => duzenle(f)}>Düzenle</button>
                    <button className="dugme kucuk" onClick={() => odemeler(f).catch((e) => bildir(e.message, 'hata'))}>Ödemeler</button>
                    {d.yedekTuru && <button className="dugme kucuk" onClick={() => yedekler(f).catch((e) => bildir(e.message, 'hata'))}>Yedekler</button>}
                    <button className="dugme kucuk" onClick={() => yoneticiKodu(f)}>Şifre kodu</button>
                  </div></td></tr>
              ))}</tbody>
            </table></div> : <Bos>Henüz firma yok.</Bos>}
          </Kart>
        </>}
        {sekme === 'kullanim' && <KullanimTablosu />}
        {sekme === 'kayitlar' && <PlatformKayitlari />}
      </main>
    </>
  );
}

function ZamanaDon({ don }: { don: (zaman: string) => void }) {
  const [z, setZ] = useState(new Date(Date.now() - 3600000).toISOString().slice(0, 16));
  return (
    <div>
      <p className="kucuk">Bulut sürümünde kurumun kayıtları son 30 gün içindeki herhangi bir ana döndürülebilir (dakikasına kadar).</p>
      <label className="alan"><span>Dönülecek an (bilgisayarınızın saatine göre)</span><input type="datetime-local" value={z} onChange={(e) => setZ(e.target.value)} /></label>
      <div className="alt"><button type="button" className="dugme" onClick={pencereKapat}>Kapat</button><button type="button" className="dugme kirmizi-dolu" onClick={() => don(z)}>Bu ana dön</button></div>
    </div>
  );
}

function KullanimTablosu() {
  const [l, setL] = useState<Kullanim[] | null>(null);
  useEffect(() => { p<{ firmalar: Kullanim[] }>('kullanim').then((r) => setL(r.firmalar)).catch((e) => bildir(e.message, 'hata')); }, []);
  if (!l) return <Bos>Yükleniyor…</Bos>;
  return (
    <Kart baslik={<h1>Kullanım</h1>}>
      <p className="soluk kucuk">Yalnız sayılar gösterilir; firmaların öğrenci, para ya da kişi bilgisi platforma gelmez.</p>
      <div className="tablo-kutu"><table>
        <thead><tr><th>Kurum</th><th className="sayi-h">Şube</th><th className="sayi-h">Personel</th><th className="sayi-h">Aktif öğrenci</th><th className="sayi-h">Toplam öğrenci</th><th className="sayi-h">Bu ay kayıt</th><th className="sayi-h">Bu ay ders</th><th className="sayi-h">Veri</th><th>Son giriş</th></tr></thead>
        <tbody>{l.map((f) => f.hata ? <tr key={f.kod}><td>{f.ad}</td><td colSpan={8} className="kucuk">{f.hata}</td></tr> : (
          <tr key={f.kod}><td><b>{f.ad}</b><div className="kucuk soluk">{f.kod}</div></td><td className="sayi-h">{f.sube}</td><td className="sayi-h">{f.personel}</td><td className="sayi-h">{f.aktifOgrenci}</td>
            <td className="sayi-h">{f.ogrenci}</td><td className="sayi-h">{f.buAyKayit}</td><td className="sayi-h">{f.buAyDers}</td><td className="sayi-h kucuk">{f.boyutMb} MB<div className="soluk">evrak {f.evrakMb} MB</div></td>
            <td className="kucuk">{f.sonGiris ? zamanYaz(f.sonGiris) : '—'}</td></tr>
        ))}</tbody>
      </table></div>
    </Kart>
  );
}

function PlatformKayitlari() {
  const [l, setL] = useState<{ id: number; zaman: string; kullanici: string; metin: string }[] | null>(null);
  useEffect(() => { p<{ kayitlar: NonNullable<typeof l> }>('kayitlar').then((r) => setL(r.kayitlar)).catch((e) => bildir(e.message, 'hata')); }, []);
  return (
    <Kart baslik={<h1>Platform kayıtları</h1>}>
      {!l ? <Bos>Yükleniyor…</Bos> : l.length ? <div className="tablo-kutu"><table><tbody>{l.map((x) => (
        <tr key={x.id}><td className="kucuk">{zamanYaz(x.zaman)}</td><td>{x.metin}</td><td className="kucuk">{x.kullanici}</td></tr>
      ))}</tbody></table></div> : <Bos />}
    </Kart>
  );
}

// Platform hesabı: şifre değiştirme ve ek doğrulama kodu (Authenticator).
function PlatformHesap({ totp, yenile }: { totp: boolean; yenile: () => Promise<void> }) {
  const [a, setA] = useState({ eskiSifre: '', yeniSifre: '', kod: '', sifre: '' });
  const [kurulum, setKurulum] = useState<{ gizli: string; resim: string } | null>(null);
  const [hata, setHata] = useState('');
  const alan = (ad: keyof typeof a, etiket: string, tip = 'password') => <label className="alan"><span>{etiket}</span><input type={tip} value={a[ad]} onChange={(e) => setA({ ...a, [ad]: e.target.value })} /></label>;
  const dene = (f: () => Promise<void>) => async () => { setHata(''); try { await f(); } catch (e) { setHata((e as Error).message); } };
  return (
    <div>
      {hata && <div className="hata">{hata}</div>}
      <h3>Şifre değiştir</h3>
      {alan('eskiSifre', 'Mevcut şifre')}{alan('yeniSifre', 'Yeni şifre (en az 8 karakter)')}
      <IsDugmesi className="dugme" is={dene(async () => { await p('sifre', { eskiSifre: a.eskiSifre, yeniSifre: a.yeniSifre }); bildir('Şifre değiştirildi.', 'tamam'); setA({ ...a, eskiSifre: '', yeniSifre: '' }); })}>Şifreyi değiştir</IsDugmesi>
      <h3 style={{ marginTop: 16 }}>Ek doğrulama kodu</h3>
      {totp ? <>
        <p className="kucuk"><span className="rozet yesil">Açık</span> Kapatmak için şifreniz ve telefondaki kod gerekir.</p>
        {alan('sifre', 'Şifre')}{alan('kod', '6 haneli kod', 'text')}
        <IsDugmesi className="dugme kirmizi" is={dene(async () => { await p('totp-kapat', { sifre: a.sifre, kod: a.kod }); await yenile(); pencereKapat(); bildir('Kapatıldı.', 'tamam'); })}>Kapat</IsDugmesi>
      </> : kurulum ? <>
        <p className="kucuk">Authenticator uygulamasıyla okutun, sonra 6 haneli kodu yazın.</p>
        <p className="orta"><img src={kurulum.resim} alt="Doğrulama kodu karesi" width={200} height={200} /></p>
        <p className="orta kucuk"><code>{kurulum.gizli.match(/.{1,4}/g)?.join(' ')}</code></p>
        {alan('kod', '6 haneli kod', 'text')}
        <IsDugmesi className="dugme ana" is={dene(async () => { await p('totp-ac', { kod: a.kod }); await yenile(); pencereKapat(); bildir('Ek doğrulama açıldı.', 'tamam'); })}>Doğrula ve aç</IsDugmesi>
      </> : <IsDugmesi className="dugme ana" is={dene(async () => { const r = await p<{ gizli: string; uri: string }>('totp-baslat', {}); setKurulum({ gizli: r.gizli, resim: await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }) }); })}>Aç</IsDugmesi>}
      <div className="alt"><button type="button" className="dugme" onClick={pencereKapat}>Kapat</button></div>
    </div>
  );
}
