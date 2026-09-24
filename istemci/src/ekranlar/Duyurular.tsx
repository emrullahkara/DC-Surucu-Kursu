// Duyurular: öğrencilerin kendi ekranında görünen kısa bilgilendirmeler (şubeye ya da bütün kuruma).
import { useY, type EkranP } from '../baglam';
import { islem } from '../api';
import { Bos, Kart, bildir, onayla, pencere } from '../bilesenler/ortak';
import { gunEkle, tarih } from '../yardim';

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
    <Kart baslik={<h1>Duyurular</h1>} sag={<button className="dugme ana" onClick={form}>+ Duyuru</button>}>
      <p className="soluk kucuk">Duyurular öğrencilerin kendi ekranında, yayın tarihleri arasında görünür.</p>
      {l.length ? <ul className="liste duyuru-liste">{l.map((d) => (
        <li key={d.id} className={d.bit < v.bugun ? 'iptal' : ''}>
          <div className="baslik-satir"><b>{d.baslik}</b><span className="soluk kucuk">{tarih(d.bas)} - {tarih(d.bit)} · {d.sube_id ? y.subeAd(d.sube_id) : 'Bütün şubeler'} · {d.kaydeden}</span>
            <div className="sag"><button className="dugme kucuk kirmizi" onClick={() => onayla('Duyuru kaldırılsın mı?', async () => { await islem('duyuru_sil', { id: d.id }); await y.b.yenile(); }, 'Kaldır')}>Kaldır</button></div></div>
          <div className="duyuru-metin">{d.metin}</div>
        </li>
      ))}</ul> : <Bos>Duyuru yok.</Bos>}
    </Kart>
  );
}
