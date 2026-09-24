// Öğrencinin kendi ekranı: ders ilerlemesi, kendi dersini seçme, sınav sonuçları, ödemeler, duyurular.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiHatasi, firmaKodu } from '../api';
import { GorunumSecici } from '../bilesenler/Gorunum';
import { dosyaIndir } from '../excel';
import { Bos, Ilerleme, IsDugmesi, Kart, Rozet, bildir, onayla } from '../bilesenler/ortak';
import type { OgrenciVeri } from '../tipler';
import { DERS_AD, DURUM_DERS, DURUM_OGR, DURUM_SINAV, DURUM_TAKSIT, SINAV_AD, gunAdi, gunEkle, tarih, telLink, tl } from '../yardim';

export function OgrenciEkrani({ cikis, oturumBitti }: { cikis: () => void; oturumBitti: () => void }) {
  const [v, setV] = useState<OgrenciVeri | null>(null);
  const yenile = useCallback(async () => {
    try { setV(await api<OgrenciVeri>('/api/ogrenci')); }
    catch (e) { if ([401, 402].includes((e as ApiHatasi).durum)) oturumBitti(); else bildir((e as Error).message, 'hata'); }
  }, [oturumBitti]);
  useEffect(() => {
    yenile();
    const t = setInterval(() => { if (document.visibilityState === 'visible') yenile(); }, 60000);
    return () => clearInterval(t);
  }, [yenile]);
  if (!v) return <p className="yukleniyor">Yükleniyor…</p>;
  const b = v.ben, g = v.gerekli, h = v.hesap;
  const ust = (
    <header className="ust">
      {v.kurum.logo && <img src={v.kurum.logo} alt="" className="ust-logo" />}
      <div><div className="kurum">{v.kurum.ad}</div><div className="kim">{b.ad} {b.soyad} · Öğrenci</div></div>
      <div className="sag"><button className="dugme kucuk ust-cikis" onClick={cikis}>Çıkış</button></div>
    </header>
  );
  if (b.sifreDegismeli) return <>{ust}<main><SifreBelirle tamam={yenile} /></main></>;

  const yaklasan = v.dersler.filter((d) => d.durum === 'planli' && d.tarih >= v.bugun).reverse();
  const yapilan = v.dersler.filter((d) => d.durum !== 'planli');
  return (
    <>
      {ust}
      <main>
        {(v.duyurular || []).map((d) => <div key={d.id} className="bilgi duyuru"><b>{d.baslik}</b><div>{d.metin}</div></div>)}
        {(v.bildirimler || []).filter((x) => x.olusturma.slice(0, 10) >= gunEkle(v.bugun, -2)).map((x) => <div key={x.id} className="bilgi duyuru">🔔 {x.metin}</div>)}
        <Kart baslik={<h1>Merhaba {b.ad}</h1>}>
          <div className="detay-bilgi">
            <div><span>Ehliyet sınıfı</span>{b.sinif_ad}</div>
            <div><span>Şube</span>{b.sube}{b.sube_telefon && <div><a href={telLink(b.sube_telefon)}>{b.sube_telefon}</a></div>}</div>
            <div><span>Eğitmenim</span>{b.egitmen || 'Henüz atanmadı'}</div>
            <div><span>Kayıt durumu</span><Rozet tablo={DURUM_OGR} d={b.durum} /></div>
          </div>
          {v.evrak && v.evrak.eksik.length > 0 && <p className="uyari-kutu">Kursa teslim etmeniz gereken evrak: <b>{v.evrak.eksik.join(', ')}</b></p>}
        </Kart>
        <div className="izgara">
          <Kart baslik="Ders ilerlemem">
            {g && <><Ilerleme ad="Teorik" deger={v.sayac.teorik} en={g.teorik} /><Ilerleme ad="Direksiyon" deger={v.sayac.direksiyon} en={g.direksiyon} /></>}
            <h3>Yaklaşan direksiyon derslerim</h3>
            {yaklasan.length ? <table><tbody>{yaklasan.map((d) => (
              <tr key={d.id}><td>{tarih(d.tarih)} {d.saat}<div className="kucuk soluk">{gunAdi(d.tarih)}</div></td><td>{DERS_AD[d.tur]}</td><td>{d.sure_dk} dk</td>
                <td>{v.dersSecimi.acik && <button className="dugme kucuk" onClick={() => onayla(`${tarih(d.tarih)} ${d.saat} dersini bırakmak istiyor musunuz?`, async () => {
                  await api('/api/ogrenci-islem', { islem: 'ders_birak', id: d.id }); await yenile(); bildir('Ders bırakıldı.', 'tamam');
                }, 'Bırak')}>Bırak</button>}</td></tr>
            ))}</tbody></table> : <Bos>Planlı ders yok.</Bos>}
          </Kart>
          {v.dersSecimi.acik && b.durum === 'aktif' && <DersSec v={v} yenile={yenile} />}
          <Kart baslik="Sınav sonuçlarım">
            {v.sinavlar.length ? <table><tbody>{v.sinavlar.map((s, i) => (
              <tr key={i}><td>{tarih(s.tarih)} {s.saat}<div className="kucuk soluk">{s.yer}</div></td><td>{SINAV_AD[s.tur]}<div className="kucuk soluk">{s.deneme}. hak (en fazla {v.sinavHakki})</div></td>
                <td><Rozet tablo={DURUM_SINAV} d={s.sonuc} />{s.puan !== null && <b> {s.puan} puan</b>}</td></tr>
            ))}</tbody></table> : <Bos>Henüz sınav kaydınız yok.</Bos>}
            <p className="soluk kucuk">E-sınavda geçme puanı {v.eSinavGecme}.</p>
          </Kart>
          <Kart baslik="Ödeme durumum">
            <div className="detay-bilgi">
              <div><span>Toplam</span>{tl(h.ucret)}</div><div><span>Ödenen</span>{tl(h.odenen)}</div><div><span>Kalan</span><b>{tl(h.kalan)}</b></div>
              {h.geciken > 0 && <div><span>Geciken</span><span className="rozet kirmizi">{tl(h.geciken)}</span></div>}
            </div>
            {v.pos?.acik && h.kalan > 0 && <InternettenOde oneri={h.geciken || (h.siradaki ? h.siradaki.tutar - h.siradaki.odenen : h.kalan)} kalan={h.kalan} yenile={yenile} />}
            {h.taksitler.length > 0 && <><h3>Taksitlerim</h3><table><tbody>{h.taksitler.map((t, i) => (
              <tr key={i}><td>{tarih(t.vade)}</td><td className="kucuk soluk">{t.ek}</td><td className="sayi-h">{tl(t.tutar)}</td><td><Rozet tablo={DURUM_TAKSIT} d={t.durum} /></td></tr>
            ))}</tbody></table></>}
          </Kart>
          <Kart baslik="Teorik derslerim">
            {v.teorikDersler.length ? <table><tbody>{v.teorikDersler.slice(0, 30).map((d, i) => (
              <tr key={i}><td>{tarih(d.tarih)} {d.saat}</td><td>{d.konu}<div className="kucuk soluk">{d.grup} · {d.derslik}</div></td>
                <td>{d.yoklama ? <span className={'rozet ' + (d.yoklama === 'geldi' ? 'yesil' : d.yoklama === 'gelmedi' ? 'kirmizi' : 'gri')}>{{ geldi: 'Katıldım', gelmedi: 'Katılmadım', izinli: 'İzinli' }[d.yoklama]}</span> : <span className="rozet">Planlı</span>}</td></tr>
            ))}</tbody></table> : <Bos>Teorik ders programınız henüz yok.</Bos>}
          </Kart>
          {v.karne && <KarnemKarti k={v.karne} />}
          {v.denemeTest?.acik && <DenemeTesti d={v.denemeTest} gecme={v.eSinavGecme} yenile={yenile} />}
          <Kart baslik="Kişisel verilerim">
            <p className="kucuk">{v.kvkk?.onay ? `Kişisel verilerinizin işlenmesine ${tarih(v.kvkk.onay)} tarihinde onay verdiniz.` : 'Kişisel verileriniz aşağıdaki metne göre işlenir.'}</p>
            <details><summary className="baglanti">Aydınlatma metnini oku</summary><div className="metin-kutu">{v.kvkk?.metin}</div></details>
            <p><button className="dugme kucuk" onClick={async () => {
              const r = await fetch('/api/verilerim', { headers: { 'X-Firma': firmaKodu() } });
              if (!r.ok) return bildir('İndirilemedi.', 'hata');
              dosyaIndir('verilerim.json', await r.blob(), 'application/json');
            }}>Kurumdaki bütün kaydımı indir</button></p>
          </Kart>
          <Kart baslik="Görünüm (bu cihaz)"><GorunumSecici /></Kart>
          <Kart baslik="Yapılan direksiyon derslerim">
            {yapilan.length ? <table><tbody>{yapilan.slice(0, 50).map((d) => (
              <tr key={d.id}><td>{tarih(d.tarih)} {d.saat}</td><td>{DERS_AD[d.tur]}</td><td><Rozet tablo={DURUM_DERS} d={d.durum} /></td></tr>
            ))}</tbody></table> : <Bos>Henüz ders yok.</Bos>}
          </Kart>
        </div>
      </main>
    </>
  );
}

function SifreBelirle({ tamam }: { tamam: () => void }) {
  const [a, setA] = useState({ eski: '', yeni: '', tekrar: '' });
  const [hata, setHata] = useState('');
  return (
    <form className="kart giris-ic" onSubmit={async (e) => {
      e.preventDefault(); setHata('');
      if (a.yeni !== a.tekrar) return setHata('Yeni şifreler aynı değil.');
      try { await api('/api/ogrenci-islem', { islem: 'ogrenci_sifre', eskiSifre: a.eski, yeniSifre: a.yeni }); bildir('Şifreniz kaydedildi.', 'tamam'); tamam(); }
      catch (err) { setHata((err as Error).message); }
    }}>
      <h1>Kendi şifrenizi belirleyin</h1>
      <p className="soluk">Kursun size verdiği ilk şifreyi değiştirmeniz gerekiyor. Yeni şifrenizi kimseyle paylaşmayın.</p>
      {hata && <div className="hata">{hata}</div>}
      <label className="alan"><span>Kursun verdiği şifre</span><input type="password" value={a.eski} onChange={(e) => setA({ ...a, eski: e.target.value })} autoComplete="current-password" /></label>
      <label className="alan"><span>Yeni şifre (en az 6 karakter)</span><input type="password" value={a.yeni} onChange={(e) => setA({ ...a, yeni: e.target.value })} autoComplete="new-password" /></label>
      <label className="alan"><span>Yeni şifre tekrar</span><input type="password" value={a.tekrar} onChange={(e) => setA({ ...a, tekrar: e.target.value })} autoComplete="new-password" /></label>
      <button className="dugme ana buyuk">Kaydet</button>
    </form>
  );
}

// Öğrenci eğitmeninin boş saatlerinden kendisi seçer; ders hemen planlanır (karar 20).
function DersSec({ v, yenile }: { v: OgrenciVeri; yenile: () => Promise<void> }) {
  const ilk = gunEkle(v.bugun, Math.max(0, v.dersSecimi.enErkenGun));
  const [gun, setGun] = useState(ilk);
  const [saatler, setSaatler] = useState<string[] | null>(null);
  useEffect(() => {
    setSaatler(null);
    api<{ saatler: string[] }>(`/api/bos-saatler?tarih=${gun}`).then((r) => setSaatler(r.saatler)).catch((e) => { bildir(e.message, 'hata'); setSaatler([]); });
  }, [gun, v]);
  const gunler = Array.from({ length: Math.min(14, v.dersSecimi.enGecGun - v.dersSecimi.enErkenGun + 1) }, (_, i) => gunEkle(ilk, i));
  if (!v.egitmenVar) return <Kart baslik="Ders seç"><Bos>Eğitmeniniz atanınca buradan kendi ders saatinizi seçebileceksiniz.</Bos></Kart>;
  const kalan = v.gerekli ? v.gerekli.direksiyon - v.sayac.direksiyon - v.dersler.filter((d) => d.durum === 'planli').length : 1;
  return (
    <Kart baslik="Direksiyon dersi seç">
      {kalan <= 0 ? <Bos>Paketinizdeki bütün direksiyon dersleri planlandı. Ek ders için kursla görüşün.</Bos> : <>
        <div className="gun-seridi">{gunler.map((x) => (
          <button key={x} className={'dugme kucuk' + (x === gun ? ' secili-d' : '')} onClick={() => setGun(x)}>{gunAdi(x).slice(0, 3)}<br />{tarih(x).slice(0, 5)}</button>
        ))}</div>
        {saatler === null ? <Bos>Yükleniyor…</Bos> : saatler.length ? (
          <div className="saat-izgara">{saatler.map((s) => (
            <IsDugmesi key={s} className="dugme" is={() => new Promise<void>((ok) => onayla(`${tarih(gun)} ${gunAdi(gun)} saat ${s} dersini seçiyorsunuz.`, async () => {
              await api('/api/ogrenci-islem', { islem: 'ders_sec', tarih: gun, saat: s }); await yenile(); bildir('Dersiniz planlandı.', 'tamam'); ok();
            }, 'Dersi al'))}>{s}</IsDugmesi>
          ))}</div>
        ) : <Bos>Bu gün eğitmeninizin boş saati yok. Başka bir gün seçin.</Bos>}
        <p className="soluk kucuk">Dersten en az 24 saat önce bırakabilirsiniz. Kalan ders hakkı: {kalan}</p>
      </>}
    </Kart>
  );
}

// Kurumun kendi sanal POS'u ile ödeme (karar 15). Ödeme sayfası ödeme firmasının güvenli sayfasıdır.
function InternettenOde({ oneri, kalan, yenile }: { oneri: number; kalan: number; yenile: () => void }) {
  const [tutar, setTutar] = useState((oneri / 100).toFixed(2).replace('.', ','));
  const [iframe, setIframe] = useState<string | null>(null);
  if (iframe) return (
    <div className="odeme-cercevesi">
      <iframe src={iframe} title="Güvenli ödeme" />
      <p className="soluk kucuk">Ödeme tamamlanınca bakiyeniz birkaç saniye içinde güncellenir. <button className="baglanti" onClick={() => { setIframe(null); yenile(); }}>Kapat</button></p>
    </div>
  );
  return (
    <div className="odeme-kutu">
      <label className="alan"><span>Kartla ödenecek tutar (₺)</span><input inputMode="decimal" value={tutar} onChange={(e) => setTutar(e.target.value)} /></label>
      <IsDugmesi className="dugme ana" is={async () => {
        const k = Math.round(Number(tutar.replace(/\./g, '').replace(',', '.')) * 100);
        if (!k || k <= 0 || k > kalan) throw new Error(`Tutar 0 ile ${tl(kalan)} arasında olmalı.`);
        const r = await api<{ adres: string }>('/api/pos-baslat', { tutar: k });
        setIframe(r.adres);
      }}>Kartla öde</IsDugmesi>
    </div>
  );
}

// Eğitim karnem: eğitmenin konu konu verdiği son puanlar ve notlar.
function KarnemKarti({ k }: { k: NonNullable<OgrenciVeri['karne']> }) {
  const sinif = (p: number) => (p <= 2 ? 'dusuk' : p === 3 ? 'orta' : 'iyi');
  const son = k.dersler[k.dersler.length - 1];
  return (
    <Kart baslik="Eğitim karnem">
      {k.hazir && <p className="rozet yesil">Eğitmeniniz sizi direksiyon sınavına hazır buldu ({tarih(k.hazir.tarih)})</p>}
      {Object.keys(k.konular).length ? <table><tbody>{k.konuListesi.filter((x) => k.konular[x]).map((x) => (
        <tr key={x}><td className="kucuk">{x}</td><td><span className={'puan-cubuk ' + sinif(k.konular[x].son)} style={{ width: `${k.konular[x].son * 14}px` }} /> {k.konular[x].son}/5</td></tr>
      ))}</tbody></table> : <Bos>Eğitmeniniz derslerden sonra karnenizi dolduracak.</Bos>}
      {son?.notu && <p className="bilgi kucuk">Eğitmeninizin son notu ({tarih(son.tarih)}): {son.notu}</p>}
      {k.konuListesi.filter((x) => !k.konular[x]).length > 0 && Object.keys(k.konular).length > 0 && <p className="soluk kucuk">Henüz çalışılmayan: {k.konuListesi.filter((x) => !k.konular[x]).join(', ')}</p>}
    </Kart>
  );
}

// E-sınav deneme testi: sorular sunucudan gelir (doğru cevaplar gelmez); bitirince sunucu puanlar ve açıklamaları döner.
interface TestSoru { id: string; konu: string; metin: string; secenekler: string[] }
interface TestSonuc { puan: number; dogru: number; sayi: number; konular: Record<string, { dogru: number; sayi: number }>; sonuclar: { id: string; cevap: number | null; dogru: number; aciklama: string }[]; gecme: number }
function DenemeTesti({ d, gecme, yenile }: { d: NonNullable<OgrenciVeri['denemeTest']>; gecme: number; yenile: () => Promise<void> }) {
  const [test, setTest] = useState<{ oturumId: string; sureDk: number; sorular: TestSoru[] } | null>(null);
  const [cevaplar, setCevaplar] = useState<Record<string, number>>({});
  const [sonuc, setSonuc] = useState<TestSonuc | null>(null);
  const [kalan, setKalan] = useState(0);
  const bitir = useRef<() => void>(() => {});
  useEffect(() => {
    if (!test || sonuc) return;
    const t = setInterval(() => setKalan((x) => { if (x <= 1) { clearInterval(t); bitir.current(); return 0; } return x - 1; }), 1000);
    return () => clearInterval(t);
  }, [test, sonuc]);
  const basla = async () => {
    const r = await api<{ oturumId: string; sureDk: number; sorular: TestSoru[] }>('/api/deneme-test', {});
    setTest(r); setCevaplar({}); setSonuc(null); setKalan(r.sureDk * 60);
    window.scrollTo(0, 0);
  };
  bitir.current = async () => {
    if (!test || sonuc) return;
    try {
      const r = await api<TestSonuc>('/api/ogrenci-islem', { islem: 'test_bitir', oturumId: test.oturumId, cevaplar });
      setSonuc(r); await yenile();
    } catch (e) { bildir((e as Error).message, 'hata'); }
  };
  if (test) return (
    <Kart baslik="Deneme testi">
      <div className="test-ust">
        <b>{sonuc ? `Sonuç: ${sonuc.puan} puan (${sonuc.dogru}/${sonuc.sayi})` : `${Object.keys(cevaplar).length}/${test.sorular.length} cevaplandı`}</b>
        {!sonuc && <span className={kalan < 300 ? 'rozet kirmizi' : 'rozet'}>{Math.floor(kalan / 60)}:{String(kalan % 60).padStart(2, '0')}</span>}
        {sonuc ? <button className="dugme kucuk" onClick={() => { setTest(null); setSonuc(null); }}>Kapat</button>
          : <IsDugmesi className="dugme ana kucuk" is={() => new Promise<void>((ok) => onayla(`${test.sorular.length - Object.keys(cevaplar).length} boş soru var. Testi bitirmek istiyor musunuz?`, async () => { await bitir.current(); ok(); }, 'Bitir'))}>Bitir</IsDugmesi>}
      </div>
      {sonuc && <p className={sonuc.puan >= sonuc.gecme ? 'bilgi' : 'hata'}>{sonuc.puan >= sonuc.gecme ? `Tebrikler! Geçme puanı ${sonuc.gecme}.` : `Geçme puanı ${sonuc.gecme}. Yanlışlarınızı aşağıda inceleyin.`}
        {' '}{Object.entries(sonuc.konular).map(([k, x]) => `${k}: ${x.dogru}/${x.sayi}`).join(' · ')}</p>}
      {test.sorular.map((q, i) => {
        const r = sonuc?.sonuclar.find((x) => x.id === q.id);
        return (
          <div key={q.id} className="test-soru">
            <div className="kucuk soluk">{i + 1}. soru · {q.konu}</div>
            <p><b>{q.metin}</b></p>
            {q.secenekler.map((x, j) => (
              <label key={j} className={'secenek' + (r ? (j === r.dogru ? ' dogru' : r.cevap === j ? ' yanlis' : '') : '')}>
                <input type="radio" name={q.id} disabled={!!sonuc} checked={cevaplar[q.id] === j} onChange={() => setCevaplar((c) => ({ ...c, [q.id]: j }))} />
                <span>{'ABCDE'[j]}) {x}</span>
              </label>
            ))}
            {r?.aciklama && <p className="soluk kucuk">{r.aciklama}</p>}
          </div>
        );
      })}
    </Kart>
  );
  return (
    <Kart baslik="E-sınav deneme testi">
      <p className="kucuk">{d.soruSayisi} soru, {d.sureDk} dakika. Geçme puanı {gecme}. Sorular her seferinde karışık gelir.</p>
      {d.havuz >= 5 ? <IsDugmesi className="dugme ana" is={basla}>Teste başla</IsDugmesi> : <Bos>Kursunuz henüz soru eklemedi.</Bos>}
      {d.sonuclar.length > 0 && <>
        <h3>Önceki testlerim</h3>
        <table><tbody>{d.sonuclar.map((x, i) => (
          <tr key={i}><td>{tarih(x.tarih)}</td><td>{x.dogru}/{x.soru_sayisi}</td><td><span className={'rozet ' + (x.puan >= gecme ? 'yesil' : 'kirmizi')}>{x.puan} puan</span></td></tr>
        ))}</tbody></table>
      </>}
    </Kart>
  );
}
