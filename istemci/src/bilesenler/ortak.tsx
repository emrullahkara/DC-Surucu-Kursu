// Ortak ekran parçaları: bildirim, form penceresi, rozet, sayı kutusu.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { paraOku, paraYaz } from '../yardim';

// ---------------------------------------------------------------------------
// Küçük ortak durum deposu (bildirim ve pencere için)
// ---------------------------------------------------------------------------
function depo<T>(ilk: T) {
  let deger = ilk;
  const dinleyen = new Set<() => void>();
  return {
    al: () => deger,
    koy: (v: T) => { deger = v; dinleyen.forEach((f) => f()); },
    abone: (f: () => void) => { dinleyen.add(f); return () => { dinleyen.delete(f); }; },
  };
}

// ---------------------------------------------------------------------------
// Bildirim
// ---------------------------------------------------------------------------
type Bildirim = { id: number; metin: string; tur: '' | 'hata' | 'tamam' };
const bildirimler = depo<Bildirim[]>([]);
let bildirimNo = 0;
export function bildir(metin: string, tur: Bildirim['tur'] = '') {
  const id = ++bildirimNo;
  bildirimler.koy([...bildirimler.al(), { id, metin, tur }].slice(-4));
  setTimeout(() => bildirimler.koy(bildirimler.al().filter((b) => b.id !== id)), tur === 'hata' ? 7000 : 4500);
}
export function Bildirimler() {
  const l = useSyncExternalStore(bildirimler.abone, bildirimler.al);
  return (
    <div id="bildirimler" aria-live="polite">
      {l.map((b) => <div key={b.id} className={'bildirim' + (b.tur ? ` ${b.tur}-b` : '')}>{b.metin}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form penceresi
// ---------------------------------------------------------------------------
export type Secenek = [string, string];
export interface Alan {
  ad?: string; etiket?: string;
  tip?: 'text' | 'password' | 'date' | 'time' | 'number' | 'tel' | 'email' | 'para' | 'select' | 'textarea' | 'coklu' | 'onay' | 'bilgi' | 'dosya';
  secenekler?: Secenek[]; deger?: any; zorunlu?: boolean; not?: string; min?: number; max?: number; otomatik?: string;
  html?: ReactNode; kabul?: string; genis?: boolean; gizle?: (v: Record<string, any>) => boolean;
}
interface PencereDurum { baslik: string; alanlar: Alan[]; gonder?: (v: Record<string, any>) => Promise<unknown> | unknown; dugme: string; ikili: boolean; tehlike: boolean; icerik?: ReactNode; genis?: boolean; altYok?: boolean }
const pencereDepo = depo<PencereDurum | null>(null);

export function pencere(baslik: string, alanlar: Alan[], gonder?: PencereDurum['gonder'], ayar: { dugme?: string; ikili?: boolean; tehlike?: boolean; genis?: boolean } = {}) {
  pencereDepo.koy({ baslik, alanlar, gonder, dugme: ayar.dugme || 'Kaydet', ikili: !!ayar.ikili, tehlike: !!ayar.tehlike, genis: ayar.genis });
}
// İçerik kendi düğmelerini çizer (Kapat, Kaydet…); kendi düğmesi olmayan içerik için kapatDugmesi=true.
export function icerikPenceresi(baslik: string, icerik: ReactNode, genis = true, kapatDugmesi = false) {
  pencereDepo.koy({ baslik, alanlar: [], dugme: '', ikili: false, tehlike: false, icerik, genis, altYok: !kapatDugmesi });
}
export const pencereKapat = () => pencereDepo.koy(null);
export function onayla(metin: string, eylem: () => Promise<unknown> | unknown, dugme = 'Evet') {
  pencere('Emin misiniz?', [{ tip: 'bilgi', html: metin }], eylem, { dugme, tehlike: true });
}

function dosyaOku(f: File): Promise<{ ad: string; tip: string; veri: string; boyut: number }> {
  return new Promise((ok, hata) => {
    const r = new FileReader();
    r.onload = () => ok({ ad: f.name, tip: f.type, veri: String(r.result), boyut: f.size });
    r.onerror = () => hata(new Error('Dosya okunamadı.'));
    r.readAsDataURL(f);
  });
}

export function Pencere() {
  const p = useSyncExternalStore(pencereDepo.abone, pencereDepo.al);
  const ref = useRef<HTMLDialogElement>(null);
  const [degerler, setDegerler] = useState<Record<string, any>>({});
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p) {
      const ilk: Record<string, any> = {};
      for (const a of p.alanlar) if (a.ad) ilk[a.ad] = a.tip === 'para' ? paraYaz(a.deger) : a.tip === 'coklu' ? [...(a.deger || [])] : a.tip === 'onay' ? !!a.deger : a.deger ?? (a.tip === 'select' ? a.secenekler?.[0]?.[0] ?? '' : '');
      setDegerler(ilk);
      setHata('');
      if (!d.open) d.showModal();
      setTimeout(() => d.querySelector<HTMLElement>('input:not([type=checkbox]),select,textarea')?.focus(), 30);
    } else if (d.open) d.close();
  }, [p]);

  if (!p) return <dialog id="pencere" ref={ref} />;
  const koy = (ad: string, v: any) => setDegerler((x) => ({ ...x, [ad]: v }));

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (!p?.gonder) return pencereKapat();
    setBekliyor(true);
    setHata('');
    try {
      const v: Record<string, any> = { ...degerler };
      for (const a of p.alanlar) {
        if (!a.ad || a.gizle?.(degerler)) { if (a.ad) delete v[a.ad]; continue; }
        if (typeof v[a.ad] === 'string') v[a.ad] = v[a.ad].trim();
        if (a.zorunlu && (v[a.ad] === '' || v[a.ad] === undefined || v[a.ad] === null)) throw new Error(`${a.etiket} boş bırakılamaz.`);
        if (a.tip === 'para') v[a.ad] = paraOku(v[a.ad]);
        if (a.tip === 'number' && v[a.ad] !== '') v[a.ad] = Number(v[a.ad]);
      }
      const r = await p.gonder(v);
      if (r !== false && pencereDepo.al() === p) pencereKapat();
    } catch (err) {
      setHata((err as Error).message);
      ref.current?.querySelector('form')?.scrollIntoView({ block: 'start' });
      ref.current?.scrollTo?.({ top: 0 });
    } finally { setBekliyor(false); }
  }

  const alanCiz = (a: Alan, i: number) => {
    if (a.gizle?.(degerler)) return null;
    if (a.tip === 'bilgi') return <div key={i} className="bilgi">{a.html}</div>;
    const ad = a.ad!;
    const d = degerler[ad];
    const etiket = <span>{a.etiket}{a.zorunlu ? ' *' : ''}</span>;
    const not = a.not ? <small className="soluk">{a.not}</small> : null;
    const sinif = 'alan' + (a.genis ? ' genis' : '');
    if (a.tip === 'onay')
      return <div key={i} className="secenekler"><label><input type="checkbox" checked={!!d} onChange={(e) => koy(ad, e.target.checked)} /> <span>{a.etiket}</span></label>{not}</div>;
    if (a.tip === 'coklu')
      return (
        <fieldset key={i} className={'secenekler ' + sinif}>
          <legend className="soluk kucuk">{a.etiket}</legend>
          {(a.secenekler || []).map(([v, e]) => (
            <label key={v}><input type="checkbox" checked={(d || []).includes(v)} onChange={(ev) => koy(ad, ev.target.checked ? [...(d || []), v] : (d || []).filter((x: string) => x !== v))} /> <span>{e}</span></label>
          ))}
          {not}
        </fieldset>
      );
    let ic: ReactNode;
    if (a.tip === 'select')
      ic = <select value={d ?? ''} onChange={(e) => koy(ad, e.target.value)} required={a.zorunlu}>{(a.secenekler || []).map(([v, e]) => <option key={v} value={v}>{e}</option>)}</select>;
    else if (a.tip === 'textarea') ic = <textarea rows={3} value={d ?? ''} onChange={(e) => koy(ad, e.target.value)} />;
    else if (a.tip === 'dosya')
      ic = <input type="file" accept={a.kabul} capture={a.kabul?.startsWith('image') ? 'environment' : undefined} onChange={async (e) => { const f = e.target.files?.[0]; koy(ad, f ? await dosyaOku(f) : null); }} />;
    else
      ic = <input type={a.tip === 'para' ? 'text' : a.tip || 'text'} inputMode={a.tip === 'para' ? 'decimal' : a.tip === 'number' ? 'numeric' : undefined}
        placeholder={a.tip === 'para' ? '0,00' : undefined} value={d ?? ''} min={a.min} max={a.max} autoComplete={a.otomatik}
        onChange={(e) => koy(ad, e.target.value)} />;
    return <label key={i} className={sinif}>{etiket}{ic}{not}</label>;
  };

  return (
    <dialog id="pencere" ref={ref} className={p.genis ? 'genis' : ''} onCancel={(e) => { e.preventDefault(); pencereKapat(); }}>
      <form onSubmit={gonder} noValidate>
        <h2>{p.baslik}</h2>
        {hata && <div className="hata">{hata}</div>}
        {p.icerik}
        <div className={p.ikili ? 'iki' : ''}>{p.alanlar.map(alanCiz)}</div>
        {!p.altYok && <div className="alt">
          <button type="button" className="dugme" onClick={pencereKapat}>{p.gonder ? 'Vazgeç' : 'Kapat'}</button>
          {p.gonder && <button className={'dugme ' + (p.tehlike ? 'kirmizi-dolu' : 'ana')} type="submit" disabled={bekliyor}>{bekliyor ? 'Kaydediliyor…' : p.dugme}</button>}
        </div>}
      </form>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Küçük parçalar
// ---------------------------------------------------------------------------
export function Rozet({ tablo, d }: { tablo: Record<string, [string, string]>; d: string }) {
  return <span className={`rozet ${tablo[d]?.[1] ?? ''}`}>{tablo[d]?.[0] ?? d}</span>;
}
export function Sayi({ etiket, deger, alt, uyari, onClick }: { etiket: string; deger: ReactNode; alt?: ReactNode; uyari?: boolean; onClick?: () => void }) {
  return (
    <div className={'sayi' + (uyari ? ' uyari' : '') + (onClick ? ' tikla' : '')} onClick={onClick}>
      <div className="etiket">{etiket}</div><div className="deger">{deger}</div>{alt && <div className="kucuk soluk">{alt}</div>}
    </div>
  );
}
export const Bos = ({ children = 'Kayıt yok.' }: { children?: ReactNode }) => <p className="bos">{children}</p>;
export function Kart({ baslik, sag, children, className = '' }: { baslik?: ReactNode; sag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'kart ' + className}>
      {(baslik || sag) && <div className="baslik-satir">{typeof baslik === 'string' ? <h2>{baslik}</h2> : baslik}{sag && <div className="sag">{sag}</div>}</div>}
      {children}
    </section>
  );
}
export function Ilerleme({ ad, deger, en }: { ad: string; deger: number; en: number }) {
  return (
    <div className="ilerleme">
      <div className="satir"><span>{ad}</span><span>{deger} / {en}</span></div>
      <progress max={Math.max(en, 1)} value={Math.min(deger, Math.max(en, 1))} />
    </div>
  );
}
// Uzun işlem düğmesi: basıldığında bekler, hata olursa bildirir.
export function IsDugmesi({ is, children, className = 'dugme', title }: { is: () => Promise<unknown> | unknown; children: ReactNode; className?: string; title?: string }) {
  const [b, setB] = useState(false);
  return (
    <button type="button" className={className} disabled={b} title={title}
      onClick={async (e) => { e.stopPropagation(); setB(true); try { await is(); } catch (err) { bildir((err as Error).message, 'hata'); } finally { setB(false); } }}>
      {children}
    </button>
  );
}
