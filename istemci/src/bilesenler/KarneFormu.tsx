// Direksiyon ders karnesi formu: her konu 1 (zayıf) ile 5 (çok iyi) arasında; puanlanmayan konu boş kalır.
// Pencere ekran bağlamının dışında çizilir; gerekenler dışarıdan verilir.
import { useState } from 'react';
import { pencereKapat, IsDugmesi } from './ortak';
import type { Karne } from '../tipler';

export function KarneFormu({ konular, onceki, kaydet }: { konular: string[]; onceki?: Karne; kaydet: (puanlar: Record<string, number>, notu: string) => Promise<void> }) {
  const [puanlar, setPuanlar] = useState<Record<string, number>>(onceki?.puanlar || {});
  const [notu, setNotu] = useState(onceki?.notu || '');
  const [hata, setHata] = useState('');
  return (
    <div>
      <p className="soluk kucuk">Bu derste çalışılan konuları puanlayın: 1 zayıf, 3 orta, 5 çok iyi. Çalışılmayan konuyu boş bırakın. İsterseniz sonra da doldurabilirsiniz.</p>
      {hata && <div className="hata">{hata}</div>}
      <div className="karne-izgara">
        {konular.map((k) => (
          <div key={k} style={{ display: 'contents' }}>
            <span className="kucuk">{k}</span>
            <span className="puan-secim" role="group" aria-label={k}>
              {[1, 2, 3, 4, 5].map((p) => (
                <button key={p} type="button" className={puanlar[k] === p ? 'secili' : ''} aria-pressed={puanlar[k] === p}
                  onClick={() => setPuanlar((x) => { const y = { ...x }; if (y[k] === p) delete y[k]; else y[k] = p; return y; })}>{p}</button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <label className="alan" style={{ marginTop: 10 }}><span>Not (öğrenciye de görünür)</span><textarea rows={2} value={notu} onChange={(e) => setNotu(e.target.value)} /></label>
      <div className="alt">
        <button type="button" className="dugme" onClick={pencereKapat}>Sonra</button>
        <IsDugmesi className="dugme ana" is={async () => {
          try { await kaydet(puanlar, notu); pencereKapat(); } catch (e) { setHata((e as Error).message); }
        }}>Karneyi kaydet</IsDugmesi>
      </div>
    </div>
  );
}
