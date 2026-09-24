// Duyurular: öğrencilerin kendi ekranında görünen kısa bilgilendirmeler (şubeye ya da bütün kuruma).
import { useState } from 'react';
import { useY, type EkranP } from '../baglam';
import { api, islem } from '../api';
import { Bos, Kart, Rozet, bildir, onayla, pencere, IsDugmesi } from '../bilesenler/ortak';
import { gunEkle, tarih, whatsapp, zamanYaz } from '../yardim';

export function Duyurular(_p: EkranP) {
  const y = useY();
  const { v } = y.b;
  const l = (v.duyurular || []).filter((d) => !y.b.sube || !d.sube_id || d.sube_id === y.b.sube);
  const form = () => pencere('Yeni duyuru', [
    ...(v.ben.rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Kime', tip: 'select' as const, secenekler: [['', 'Bütün şubelerin öğrencileri'], ...y.subeSecenek()] as [string, string][], deger: y.b.sube }] : []),
    { ad: 'baslik', etiket: 'Başlık', zorunlu: true }, { ad: 'metin', etiket: 'Metin', tip: 'textarea', zorunlu: true },
    { ad: 'bas', etiket: 'Yayın başlangıcı', tip: 'date', deger: v.bugun }, { ad: 'bit', etiket: 'Yayın bitişi', tip: 'date', deger: gunEkle(v.bugun, 14) },
  ], async (g) => { await islem('duyuru_ekle', { ...g, subeId: v.ben.rol === 'yonetici' ? g.subeId : v.ben.sube_id }); await y.b.yenile(); bildir('Duyuru yayınlandı.', 'tamam'); });
  return (
    <>
    <Hatirlatmalar />
    {y.hak('kayit') && <Kart baslik={<h1>Duyurular</h1>} sag={<button className="dugme ana" onClick={form}>+ Duyuru</button>}>
      <p className="soluk kucuk">Duyurular öğrencilerin kendi ekranında, yayın tarihleri arasında görünür.</p>
      {l.length ? <ul className="liste duyuru-liste">{l.map((d) => (
        <li key={d.id} className={d.bit < v.bugun ? 'iptal' : ''}>
          <div className="baslik-satir"><b>{d.baslik}</b><span className="soluk kucuk">{tarih(d.bas)} - {tarih(d.bit)} · {d.sube_id ? y.subeAd(d.sube_id) : 'Bütün şubeler'} · {d.kaydeden}</span>
            <div className="sag"><button className="dugme kucuk kirmizi" onClick={() => onayla('Duyuru kaldırılsın mı?', async () => { await islem('duyuru_sil', { id: d.id }); await y.b.yenile(); }, 'Kaldır')}>Kaldır</button></div></div>
          <div className="duyuru-metin">{d.metin}</div>
        </li>
      ))}</ul> : <Bos>Duyuru yok.</Bos>}
    </Kart>}
    </>
  );
}

const TUR: Record<string, string> = { ders: 'Ders', sinav: 'Sınav', taksit: 'Taksit', geciken: 'Gecikme' };
const DURUM: Record<string, [string, string]> = { bekliyor: ['Bekliyor', 'sari'], gonderildi: ['Gönderildi', 'yesil'], hata: ['Gönderilemedi', 'kirmizi'], iptal: ['Gönderilmeyecek', 'gri'] };

// Hatırlatmalar: otomatik hazırlanan ders, sınav ve taksit mesajları. SMS açıksa toplu gönderilir; değilse
// öğrencinin ekranında görünür ve buradan WhatsApp ile tek tek gönderilebilir.
function Hatirlatmalar() {
  const y = useY();
  const { v } = y.b;
  const [durum, setDurum] = useState('bekliyor');
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const l = y.subeSuz(v.bildirimler).filter((b) => !durum || b.durum === durum);
  const smsAcik = v.tanimlar.sms?.acik;
  const isaretle = async (id: string, iptal = false) => { await islem('bildirim_isaretle', { id, iptal }); await y.b.yenile(); };
  return (
    <Kart baslik={<h1>Hatırlatmalar</h1>} sag={<>
      <select value={durum} onChange={(e) => { setDurum(e.target.value); setSecili(new Set()); }} style={{ width: 'auto' }}>
        <option value="bekliyor">Bekleyen</option><option value="gonderildi">Gönderilen</option><option value="hata">Gönderilemeyen</option><option value="">Hepsi (son 14 gün)</option></select>
      <IsDugmesi className="dugme" is={async () => { const r = await islem<{ eklenen: number }>('hatirlatma_hazirla'); await y.b.yenile(); bildir(`${r.eklenen} yeni hatırlatma hazırlandı.`, 'tamam'); }}>Bugünün listesini hazırla</IsDugmesi>
      {smsAcik && secili.size > 0 && <IsDugmesi className="dugme ana" is={async () => {
        const r = await api<{ gonderilen: number; hata: number }>('/api/sms-gonder', { idler: [...secili] }); setSecili(new Set()); await y.b.yenile();
        bildir(`${r.gonderilen} SMS gönderildi${r.hata ? `, ${r.hata} gönderilemedi` : ''}.`, r.hata ? 'hata' : 'tamam');
      }}>Seçilenlere SMS gönder ({secili.size})</IsDugmesi>}
    </>}>
      <p className="soluk kucuk">{smsAcik ? 'SMS açık: otomatik hatırlatmalar ayardaki saatte kendiliğinden gönderilir.' : 'SMS kapalı: hatırlatmalar öğrencinin kendi ekranında görünür. İsterseniz WhatsApp ile de gönderebilirsiniz.'} Ayarlar &gt; Otomatik hatırlatma.</p>
      {l.length ? <div className="tablo-kutu"><table><tbody>{l.map((b) => {
        const o = y.ogr(b.ogrenci_id);
        return (
          <tr key={b.id}>
            {smsAcik && <td><input type="checkbox" style={{ width: 'auto' }} disabled={b.durum === 'gonderildi'} checked={secili.has(b.id)} aria-label="Seç"
              onChange={(e) => setSecili((s0) => { const s1 = new Set(s0); if (e.target.checked) s1.add(b.id); else s1.delete(b.id); return s1; })} /></td>}
            <td className="kucuk">{zamanYaz(b.olusturma)}<div><span className="rozet">{TUR[b.tur] || b.tur}</span></div></td>
            <td>{o ? <button className="baglanti" onClick={() => y.b.git('ogrenci', b.ogrenci_id)}>{o.ad} {o.soyad}</button> : '—'}<div className="kucuk">{b.metin}</div>{b.hata && <div className="kucuk soluk">{b.hata}</div>}</td>
            <td><Rozet tablo={DURUM} d={b.durum} />{b.gonderen && <div className="kucuk soluk">{b.kanal === 'whatsapp' ? 'WhatsApp' : b.kanal} · {b.gonderen}</div>}</td>
            <td><div className="dugmeler">
              {b.durum !== 'gonderildi' && b.telefon && <a className="dugme kucuk" target="_blank" rel="noopener noreferrer" href={whatsapp(b.telefon, b.metin)} onClick={() => setTimeout(() => isaretle(b.id), 300)}>WhatsApp</a>}
              {b.durum === 'bekliyor' && <button className="dugme kucuk" onClick={() => isaretle(b.id, true)}>Gönderme</button>}
            </div></td>
          </tr>
        );
      })}</tbody></table></div> : <Bos>Hatırlatma yok.</Bos>}
    </Kart>
  );
}
