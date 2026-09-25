// Personel ekranının çerçevesi: üst şerit, menü, canlı bağlantı, internetsiz kayıt sırası.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiHatasi, firmaKodu, kuyrukGonder, kuyrukOku, kuyrukSahibiAyarla, sonVeriOku, sonVeriYaz } from '../api';
import { BaglamC, type Baglam, type Sekme } from '../baglam';
import { bildir } from '../bilesenler/ortak';
import type { Olay, Veri } from '../tipler';
import type { FirmaBilgi } from '../Uygulama';
import { Ozet } from './Ozet';
import { Ogrenciler, OgrenciDetay } from './Ogrenciler';
import { Dersler } from './Dersler';
import { Teorik } from './Teorik';
import { Sinavlar } from './Sinavlar';
import { Kasa } from './Kasa';
import { Raporlar } from './Raporlar';
import { Araclar } from './Araclar';
import { Yonetim } from './Yonetim';
import { Ayarlar } from './Ayarlar';
import { Hesap } from './Hesap';
import { Duyurular } from './Duyurular';
import { Adaylar } from './Adaylar';
import { gunFarki, tarih, zamanYaz } from '../yardim';

export function Kabuk({ firma, cikis, oturumBitti }: { firma: FirmaBilgi; cikis: () => void; oturumBitti: () => void }) {
  const [v, setV] = useState<Veri | null>(null);
  const [sekme, setSekme] = useState<Sekme>('ozet');
  const [ogrId, setOgrId] = useState<string | null>(null);
  const [sube, setSube] = useState('');
  const [canli, setCanli] = useState(false);
  const [, setSayac] = useState(0);
  const [yeniOlay, setYeniOlay] = useState<Set<number>>(new Set());
  const [cevrimdisi, setCevrimdisi] = useState<string | null>(null);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bayat = useRef(false);

  const yenile = useCallback(async () => {
    try {
      const yeni = await api<Veri>('/api/veri');
      kuyrukSahibiAyarla(yeni.ben.id);
      sonVeriYaz(yeni);
      setCevrimdisi(null);
      setV(yeni);
    } catch (e) {
      const d = (e as ApiHatasi).durum;
      if (d === 401 || d === 402) oturumBitti();
      else if (!d) {
        setCanli(false);
        // İnternet yok: eğitmenin telefonda saklanan son listesi gösterilir.
        setV((eski) => {
          if (eski) return eski;
          const s = sonVeriOku<Veri>();
          if (s) { kuyrukSahibiAyarla(s.v.ben.id); setCevrimdisi(s.zaman); return s.v; }
          return eski;
        });
      } else bildir((e as Error).message, 'hata');
    }
  }, [oturumBitti]);
  // Canlı olaylar art arda gelirse (ör. toplu işlem) ekran bir kez yenilenir; ekran görünmüyorsa
  // yenileme ekran açılana kadar bekletilir (telefonda pil ve internet tasarrufu).
  const yenileGecikmeli = useCallback(() => {
    clearTimeout(zamanlayici.current);
    if (document.visibilityState === 'hidden') { bayat.current = true; return; }
    zamanlayici.current = setTimeout(yenile, 1200);
  }, [yenile]);
  useEffect(() => {
    const gorunur = () => { if (document.visibilityState === 'visible' && bayat.current) { bayat.current = false; yenile(); } };
    document.addEventListener('visibilitychange', gorunur);
    return () => document.removeEventListener('visibilitychange', gorunur);
  }, [yenile]);
  const kuyrugu = useCallback(async () => {
    if (!kuyrukOku().length) return;
    const n = await kuyrukGonder((m) => bildir(m, 'hata'));
    if (n) { bildir(`${n} bekleyen kayıt merkeze iletildi.`, 'tamam'); await yenile(); }
    setSayac((x) => x + 1);
  }, [yenile]);

  useEffect(() => { yenile(); }, [yenile]);

  // Canlı bağlantı: başka biri (ör. sahadaki eğitmen) kayıt girince ekran kendiliğinden yenilenir.
  useEffect(() => {
    const k = new EventSource(`/api/canli?firma=${encodeURIComponent(firmaKodu())}`);
    k.addEventListener('open', () => { setCanli(true); yenileGecikmeli(); kuyrugu(); });
    k.addEventListener('error', () => setCanli(false));
    k.addEventListener('degisti', (e) => {
      let o: Olay | null = null;
      try { o = JSON.parse((e as MessageEvent).data); } catch { return; }
      if (!o) return;
      setV((eski) => { if (eski && o!.kullanici !== eski.ben.ad) bildir(o!.metin); return eski; });
      setYeniOlay((s) => new Set(s).add(o!.id));
      yenileGecikmeli();
    });
    const cevrim = () => kuyrugu();
    window.addEventListener('online', cevrim);
    const t = setInterval(kuyrugu, 20000);
    return () => { k.close(); window.removeEventListener('online', cevrim); clearInterval(t); };
  }, [yenileGecikmeli, kuyrugu]);

  const git = useCallback((s: Sekme, id?: string) => { setSekme(s); if (id) setOgrId(id); window.scrollTo(0, 0); }, []);
  const b: Baglam | null = useMemo(() => v && ({ v, yenile, sube, subeSec: setSube, git, sekme, ogrId, canli, cevrimdisi, yerel: () => setSayac((x) => x + 1) }), [v, yenile, sube, git, sekme, ogrId, canli, cevrimdisi]);
  if (!v || !b) return <p className="yukleniyor">Yükleniyor…</p>;

  const hak = (h: string) => v.ben.haklar.includes(h as never);
  const menu: [Sekme, string][] = [
    ['ozet', v.ben.rol === 'egitmen' ? 'Sahada' : 'Özet'], ['ogrenciler', 'Öğrenciler'], ['dersler', 'Direksiyon'], ['teorik', 'Teorik'], ['sinavlar', 'Sınavlar'],
    ...(hak('tahsilat') || hak('kasa') ? [['kasa', 'Kasa'] as [Sekme, string]] : []),
    ...(hak('rapor') ? [['raporlar', 'Raporlar'] as [Sekme, string]] : []),
    ...(hak('personel') ? [['araclar', 'Araçlar'] as [Sekme, string]] : []),
    ...(hak('kayit') ? [['adaylar', 'Adaylar'] as [Sekme, string]] : []),
    ...(hak('kayit') || hak('tahsilat') ? [['duyurular', 'Duyuru ve hatırlatma'] as [Sekme, string]] : []),
    ...(hak('personel') ? [['yonetim', v.ben.rol === 'yonetici' ? 'Şubeler ve personel' : 'Personel'] as [Sekme, string]] : []),
    ...(v.ben.rol === 'yonetici' ? [['ayarlar', 'Ayarlar'] as [Sekme, string]] : []),
    ['hesap', 'Hesabım'],
  ];
  const secili = sekme === 'ogrenci' ? 'ogrenciler' : sekme;
  const kuyruk = kuyrukOku().length;
  const cokSube = v.ben.rol === 'yonetici' && v.subeler.length > 1;
  const Ekran = { ozet: Ozet, ogrenciler: Ogrenciler, ogrenci: OgrenciDetay, dersler: Dersler, teorik: Teorik, sinavlar: Sinavlar, kasa: Kasa,
    raporlar: Raporlar, araclar: Araclar, yonetim: Yonetim, ayarlar: Ayarlar, hesap: Hesap, duyurular: Duyurular, adaylar: Adaylar }[sekme] || Ozet;
  // Lisans bitişine 30 gün kala yöneticiye uyarı.
  const lisansKalan = firma.lisansBitis ? gunFarki(v.bugun, firma.lisansBitis) : 999;

  return (
    <BaglamC.Provider value={b}>
      <header className="ust">
        {v.kurum.logo && <img src={v.kurum.logo} alt="" className="ust-logo" />}
        <div>
          <div className="kurum">{v.kurum.ad}</div>
          <div className="kim">{v.ben.ad} · {v.tanimlar.roller[v.ben.rol]}{v.ben.sube_id ? ' · ' + (v.subeler.find((s) => s.id === v.ben.sube_id)?.ad || '') : ''}</div>
        </div>
        <div className="sag">
          {cokSube && (
            <select aria-label="Şube" value={sube} onChange={(e) => setSube(e.target.value)}>
              <option value="">Bütün şubeler</option>
              {v.subeler.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
          )}
          {kuyruk > 0 && <span className="isaret kopuk">{kuyruk} kayıt gönderilmeyi bekliyor</span>}
          <span className={'isaret' + (canli ? '' : ' kopuk')}>{canli ? '● Canlı' : '○ Bağlantı yok'}</span>
          <button className="dugme kucuk ust-cikis" onClick={cikis}>Çıkış</button>
        </div>
      </header>
      {cevrimdisi && <div className="serit kopuk">İnternet yok. {zamanYaz(cevrimdisi)} tarihli son liste gösteriliyor; girdiğiniz ders sonuçları telefonda bekler ve bağlantı gelince gönderilir.</div>}
      {v.ben.rol === 'yonetici' && lisansKalan <= 30 && <div className="serit uyari">Kullanım süreniz {tarih(firma.lisansBitis)} tarihinde bitiyor ({Math.max(0, lisansKalan)} gün). Kesinti olmaması için DC ile görüşün.</div>}
      <nav className="menu">
        {menu.map(([k, e]) => <button key={k} className={secili === k ? 'secili' : ''} onClick={() => git(k)}>{e}</button>)}
      </nav>
      <main><Ekran yeniOlay={yeniOlay} firma={firma} /></main>
    </BaglamC.Provider>
  );
}
