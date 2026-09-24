// Basit grafikler (SVG, kütüphanesiz): aylık çubuk ve çizgi. Renkler temadan gelir.
import { tl } from '../yardim';

export interface Seri { ad: string; degerler: number[]; tur: 'cubuk' | 'cubuk2' | 'cizgi'; para?: boolean }
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const ayAdi = (ay: string) => `${AY[Number(ay.slice(5, 7)) - 1]} ${ay.slice(2, 4)}`;
const kisa = (n: number, para?: boolean) => {
  const v = para ? n / 100 : n;
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mn';
  if (Math.abs(v) >= 1000) return (v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' bin';
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
};

export function AylikGrafik({ aylar, seriler, baslik }: { aylar: string[]; seriler: Seri[]; baslik: string }) {
  const G = 640, Y = 220, sol = 52, alt = 26, ust = 10;
  const cubuklar = seriler.filter((s) => s.tur !== 'cizgi');
  const cizgiler = seriler.filter((s) => s.tur === 'cizgi');
  const enCok = Math.max(1, ...cubuklar.flatMap((s) => s.degerler));
  const enCokC = Math.max(1, ...cizgiler.flatMap((s) => s.degerler));
  const w = (G - sol - 8) / Math.max(1, aylar.length);
  const yc = (v: number, m: number) => ust + (Y - ust - alt) * (1 - Math.max(0, v) / m);
  const para = cubuklar[0]?.para;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="grafik" viewBox={`0 0 ${G} ${Y}`} role="img" aria-label={baslik}>
        {[0, 0.5, 1].map((o) => (
          <g key={o}>
            <line className="eksen" x1={sol} x2={G - 4} y1={yc(enCok * o, enCok)} y2={yc(enCok * o, enCok)} />
            <text x={sol - 6} y={yc(enCok * o, enCok) + 4} textAnchor="end">{kisa(enCok * o, para)}</text>
          </g>
        ))}
        {aylar.map((a, i) => {
          const bw = (w - 8) / Math.max(1, cubuklar.length);
          return (
            <g key={a}>
              {cubuklar.map((s, j) => {
                const v = s.degerler[i] || 0, yy = yc(v, enCok);
                return <rect key={s.ad} className={'cubuk' + (s.tur === 'cubuk2' ? ' iki' : '')} x={sol + i * w + 4 + j * bw} y={yy} width={Math.max(1, bw - 2)} height={Math.max(0, Y - alt - yy)}>
                  <title>{`${ayAdi(a)} · ${s.ad}: ${s.para ? tl(v) : v}`}</title></rect>;
              })}
              <text x={sol + i * w + w / 2} y={Y - 8} textAnchor="middle">{ayAdi(a)}</text>
            </g>
          );
        })}
        {cizgiler.map((s) => (
          <g key={s.ad}>
            <polyline className="cizgi" points={s.degerler.map((v, i) => `${sol + i * w + w / 2},${yc(v, enCokC)}`).join(' ')} />
            {s.degerler.map((v, i) => <circle key={i} className="nokta" cx={sol + i * w + w / 2} cy={yc(v, enCokC)} r={3.5}><title>{`${ayAdi(aylar[i])} · ${s.ad}: ${v}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <figcaption className="grafik-aciklama">
        <b>{baslik}</b>
        {seriler.map((s) => <span key={s.ad}><i style={{ background: s.tur === 'cizgi' ? 'var(--yesil)' : s.tur === 'cubuk2' ? 'var(--kirmizi)' : 'var(--ana)' }} />{s.ad}</span>)}
      </figcaption>
    </figure>
  );
}
