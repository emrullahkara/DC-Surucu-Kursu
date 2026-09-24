// Personel ekranının ortak bilgisi: sunucudan gelen veri, yetkiler, adlar, seçili şube ve gezinme.
import { createContext, useContext } from 'react';
import type { Hak, Veri, Ogrenci } from './tipler';

export type Sekme = 'ozet' | 'ogrenciler' | 'ogrenci' | 'dersler' | 'teorik' | 'sinavlar' | 'kasa' | 'raporlar' | 'araclar' | 'yonetim' | 'ayarlar' | 'hesap' | 'duyurular' | 'adaylar';

export interface Baglam {
  v: Veri;
  yenile: () => Promise<void>;
  sube: string; // '' = bütün şubeler (yalnız yönetici)
  subeSec: (id: string) => void;
  git: (s: Sekme, ogrId?: string) => void;
  sekme: Sekme;
  ogrId: string | null;
  canli: boolean;
  yerel: () => void; // sunucuya gitmeden ekranı yeniden çiz (sıraya alınan kayıtlar için)
  cevrimdisi: string | null; // internetsiz açıldıysa son güncelleme zamanı
}
export const BaglamC = createContext<Baglam | null>(null);
export const useB = () => useContext(BaglamC)!;

// Baglamdan türetilen yardımcılar. Her ekran bunları kullanır.
export function yardimcilar(b: Baglam) {
  const { v } = b;
  const hak = (h: Hak) => v.ben.haklar.includes(h);
  const subeAd = (id?: string | null) => v.subeler.find((s) => s.id === id)?.ad || '';
  const kisiAd = (id?: string | null) => v.personel.find((p) => p.id === id)?.ad || '';
  const ogr = (id?: string | null): Ogrenci | undefined => v.ogrenciler.find((o) => o.id === id);
  const ogrAd = (id?: string | null) => { const o = ogr(id); return o ? `${o.ad} ${o.soyad}` : '—'; };
  const aracAd = (id?: string | null) => v.araclar.find((a) => a.id === id)?.plaka || '';
  const cokSube = v.ben.rol === 'yonetici' && v.subeler.length > 1;
  const subeSutunu = cokSube && !b.sube;
  function subeSuz<T extends { sube_id?: string | null }>(l: T[] | undefined): T[] { return !l ? [] : b.sube ? l.filter((x) => x.sube_id === b.sube) : l; }
  const varsayilanSube = () => b.sube || v.ben.sube_id || v.subeler.find((s) => s.merkez)?.id || v.subeler[0]?.id || '';
  const subeSecenek = (): [string, string][] => v.subeler.filter((s) => s.aktif).map((s) => [s.id, s.ad]);
  // Şubenin eğitmenleri + o tarihte şubeye görevlendirilmiş olanlar.
  const egitmenSecenek = (subeId: string, bos = 'Seçilmedi', tarih = v.bugun): [string, string][] => [['', bos], ...v.personel
    .filter((p) => ['egitmen', 'sube_muduru', 'yonetici'].includes(p.rol) && (p.aktif ?? 1)
      && (p.rol === 'yonetici' || p.sube_id === subeId || v.gorevlendirmeler.some((g) => g.kullanici_id === p.id && g.sube_id === subeId && g.bas <= tarih && g.bit >= tarih)))
    .map((p): [string, string] => [p.id, p.sube_id !== subeId && p.rol !== 'yonetici' ? `${p.ad} (görevli)` : p.ad])];
  const aracSecenek = (subeId: string, sinif?: string): [string, string][] => [['', 'Seçilmedi'], ...v.araclar
    .filter((a) => a.aktif && a.sube_id === subeId).sort((x, y) => Number(y.sinif === sinif) - Number(x.sinif === sinif))
    .map((a): [string, string] => [a.id, `${a.plaka} · ${a.model} (${a.sinif})`])];
  const sinifSecenek = (): [string, string][] => Object.entries(v.tanimlar.siniflar).map(([k, s]) => [k, s.ad]);
  const ogrenciSecenek = (filtre: (o: Ogrenci) => boolean = () => true): [string, string][] =>
    subeSuz(v.ogrenciler).filter((o) => o.durum === 'aktif' && filtre(o)).sort((a, x) => a.ad.localeCompare(x.ad, 'tr'))
      .map((o) => [o.id, `${o.ad} ${o.soyad} (${o.sinif})`]);
  return { hak, subeAd, kisiAd, ogr, ogrAd, aracAd, cokSube, subeSutunu, subeSuz, varsayilanSube, subeSecenek, egitmenSecenek, aracSecenek, sinifSecenek, ogrenciSecenek };
}
export const useY = () => { const b = useB(); return { b, ...yardimcilar(b) }; };

// Her ekranın aldığı ortak bilgiler.
export interface EkranP { yeniOlay: Set<number>; firma: { kod: string; ad: string } }
