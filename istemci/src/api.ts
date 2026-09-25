// Sunucu ile konuşma. Her istek kurum kodunu (X-Firma) ve sahte istek koruma başlığını (X-DC) taşır.
import { yeniNo } from './yardim';

const FIRMA_ANAHTAR = 'dc_firma';
const oku = (a: string) => { try { return localStorage.getItem(a); } catch { return null; } };
const yaz = (a: string, v: string | null) => { try { if (v === null) localStorage.removeItem(a); else localStorage.setItem(a, v); } catch { /* depolama kapalı */ } };

// Kurum kodu: adres satırı (?firma=kod veya /k/kod) > tarayıcının hatırladığı.
export function firmaKodu(): string {
  const u = new URL(location.href);
  const yol = /^\/k\/([a-z0-9-]{3,30})(\/on-kayit)?\/?$/.exec(u.pathname)?.[1];
  const kod = (u.searchParams.get('firma') || yol || oku(FIRMA_ANAHTAR) || '').toLocaleLowerCase('tr-TR');
  return kod;
}
export const firmaHatirla = (kod: string | null) => yaz(FIRMA_ANAHTAR, kod);

export class ApiHatasi extends Error {
  durum: number;
  constructor(m: string, d: number) { super(m); this.durum = d; }
}

export async function api<T = any>(yol: string, govde?: unknown, firma = firmaKodu()): Promise<T> {
  let r: Response;
  try {
    r = await fetch(yol, govde === undefined
      ? { credentials: 'same-origin', headers: { 'X-Firma': firma } }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-DC': '1', 'X-Firma': firma }, body: JSON.stringify(govde) });
  } catch {
    throw new ApiHatasi('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', 0);
  }
  let j: any = {};
  try { j = await r.json(); } catch { /* boş cevap */ }
  if (!r.ok) throw new ApiHatasi(j.hata || 'İşlem yapılamadı.', r.status);
  return j as T;
}

// ---------------------------------------------------------------------------
// Sahadan internet yokken girilen ders sonuçları telefonda sıraya alınır, bağlantı gelince gönderilir.
// Her kaydın tekil numarası vardır; sunucu aynı kaydı iki kez yazmaz.
// ---------------------------------------------------------------------------
// Kayıtlar KİŞİYE bağlı tutulur: ortak kullanılan telefonda A'nın bekleyen kaydı, B giriş yapınca B adına gitmez;
// A tekrar girince gönderilir.
export interface KuyrukKaydi { govde: Record<string, unknown> & { istekNo: string }; aciklama: string; zaman: string }
let kuyrukSahibi = '';
export const kuyrukSahibiAyarla = (kullaniciId: string) => { kuyrukSahibi = kullaniciId; };
const kuyrukAnahtar = () => `dc_kuyruk_${firmaKodu()}_${kuyrukSahibi || '-'}`;
export const kuyrukOku = (): KuyrukKaydi[] => { try { return JSON.parse(oku(kuyrukAnahtar()) || '[]'); } catch { return []; } };
const kuyrukYaz = (l: KuyrukKaydi[]) => yaz(kuyrukAnahtar(), JSON.stringify(l));

let gonderiliyor = false;
export async function kuyrukGonder(hataBildir: (m: string) => void): Promise<number> {
  if (gonderiliyor || !kuyrukSahibi) return 0;
  gonderiliyor = true;
  let n = 0;
  try {
    for (const is of kuyrukOku()) {
      try { await api('/api/islem', is.govde); n++; }
      catch (e) {
        const d = (e as ApiHatasi).durum;
        if (!d || d === 401 || d >= 500) break; // hâlâ bağlantı yok ya da oturum kapalı: sonra tekrar denenir
        hataBildir(`Bekleyen kayıt gönderilemedi: ${is.aciklama} · ${(e as Error).message}`);
      }
      kuyrukYaz(kuyrukOku().filter((x) => x.govde.istekNo !== is.govde.istekNo));
    }
  } finally { gonderiliyor = false; }
  return n;
}

export async function islem<T = any>(tur: string, g: Record<string, unknown> = {}, { kuyruk = false, aciklama = '' } = {}): Promise<T & { sirada?: boolean }> {
  const govde = { ...g, islem: tur, istekNo: yeniNo() };
  try {
    return (await api<T>('/api/islem', govde)) as T & { sirada?: boolean };
  } catch (e) {
    if (kuyruk && (e as ApiHatasi).durum === 0 && kuyrukSahibi) {
      kuyrukYaz([...kuyrukOku(), { govde, aciklama, zaman: new Date().toISOString() }]);
      return { sirada: true } as T & { sirada: boolean };
    }
    throw e;
  }
}

// Konum ayarı açıksa ders kapanırken eğitmenin konumu alınır (karar 19). Alınamazsa kayıt yine yapılır.
export function konumAl(): Promise<{ enlem: number; boylam: number; hassasiyet: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((ok) => {
    const bitti = setTimeout(() => ok(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(bitti); ok({ enlem: p.coords.latitude, boylam: p.coords.longitude, hassasiyet: p.coords.accuracy }); },
      () => { clearTimeout(bitti); ok(null); },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    );
  });
}

// ---------------------------------------------------------------------------
// İnternetsiz görüntüleme: eğitmenin son aldığı liste telefonda saklanır; bağlantı yokken uygulama açılırsa
// bu liste "son güncelleme" saatiyle gösterilir. Yalnız eğitmen için (para ve kimlik bilgisi içermez).
// Çıkışta silinir.
// ---------------------------------------------------------------------------
const sonVeriAnahtar = () => `dc_sonveri_${firmaKodu()}`;
export function sonVeriYaz(v: { ben: { rol: string } }) {
  if (v.ben.rol !== 'egitmen') return;
  yaz(sonVeriAnahtar(), JSON.stringify({ zaman: new Date().toISOString(), v }));
}
export function sonVeriOku<T>(): { zaman: string; v: T } | null {
  try { return JSON.parse(oku(sonVeriAnahtar()) || 'null'); } catch { return null; }
}
export const sonVeriSil = () => yaz(sonVeriAnahtar(), null);
