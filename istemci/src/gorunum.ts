// Görünüm tercihleri: tema (otomatik / açık / koyu) ve yazı boyutu. Güneş altında sahada okunaklılık için.
// Tercih bu cihazda saklanır (hesaba değil); depolama kapalıysa varsayılan kullanılır.
export type Tema = '' | 'acik' | 'koyu';
export type Yazi = '' | 'buyuk' | 'cok-buyuk';
const oku = (a: string) => { try { return localStorage.getItem(a) || ''; } catch { return ''; } };
const yaz = (a: string, v: string) => { try { if (v) localStorage.setItem(a, v); else localStorage.removeItem(a); } catch { /* depolama kapalı */ } };

export const gorunumOku = () => ({ tema: oku('dc_tema') as Tema, yazi: oku('dc_yazi') as Yazi });
export function gorunumUygula() {
  const { tema, yazi } = gorunumOku();
  const k = document.documentElement;
  if (tema) k.dataset.theme = tema === 'koyu' ? 'dark' : 'light'; else delete k.dataset.theme;
  if (yazi) k.dataset.yazi = yazi; else delete k.dataset.yazi;
  const koyu = tema === 'koyu' || (!tema && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', koyu ? '#16304f' : '#1f4e8c');
}
export function gorunumYaz(g: { tema?: Tema; yazi?: Yazi }) {
  if (g.tema !== undefined) yaz('dc_tema', g.tema);
  if (g.yazi !== undefined) yaz('dc_yazi', g.yazi);
  gorunumUygula();
}
