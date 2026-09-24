// Görünüm seçimi (tema ve yazı boyutu). Bu cihazda saklanır.
import { useState } from 'react';
import { gorunumOku, gorunumYaz, type Tema, type Yazi } from '../gorunum';

export function GorunumSecici() {
  const [g, setG] = useState(gorunumOku());
  const koy = (x: { tema?: Tema; yazi?: Yazi }) => { gorunumYaz(x); setG(gorunumOku()); };
  const D = ({ secili, onClick, children }: { secili: boolean; onClick: () => void; children: string }) => (
    <button type="button" className={'dugme kucuk' + (secili ? ' secili-d' : '')} aria-pressed={secili} onClick={onClick}>{children}</button>
  );
  return (
    <div>
      <div className="kucuk soluk">Renk</div>
      <div className="gorunum-secim">
        <D secili={g.tema === ''} onClick={() => koy({ tema: '' })}>Telefona göre</D>
        <D secili={g.tema === 'acik'} onClick={() => koy({ tema: 'acik' })}>Açık</D>
        <D secili={g.tema === 'koyu'} onClick={() => koy({ tema: 'koyu' })}>Koyu</D>
      </div>
      <div className="kucuk soluk" style={{ marginTop: 8 }}>Yazı boyutu</div>
      <div className="gorunum-secim">
        <D secili={g.yazi === ''} onClick={() => koy({ yazi: '' })}>Normal</D>
        <D secili={g.yazi === 'buyuk'} onClick={() => koy({ yazi: 'buyuk' })}>Büyük</D>
        <D secili={g.yazi === 'cok-buyuk'} onClick={() => koy({ yazi: 'cok-buyuk' })}>Çok büyük</D>
      </div>
    </div>
  );
}
