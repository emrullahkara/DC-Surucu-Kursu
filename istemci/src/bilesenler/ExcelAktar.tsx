// Excel'den (ya da CSV'den) toplu öğrenci aktarımı: dosya seç, sütunlar otomatik eşleşir, önizleme, aktar.
// Hatalı satırlar sunucu tarafından atlanır ve nedeniyle listelenir; doğru satırlar kaydedilir.
// Pencere ekran bağlamının dışında çizilir; gerekenler dışarıdan verilir.
import { useState } from 'react';
import { islem } from '../api';
import { excelIndir, tabloOku, tarihOku, paraOkuEsnek, baslikSade } from '../excel';
import { IsDugmesi, pencereKapat, bildir } from './ortak';

// Başlık adı -> alan. Kurumların kullandığı farklı yazılışlar kabul edilir.
const ESLESME: Record<string, string[]> = {
  ad: ['ad', 'adi', 'isim'], soyad: ['soyad', 'soyadi'], tc: ['tc', 'tckimlikno', 'tckn', 'kimlikno', 'tcno'],
  telefon: ['telefon', 'tel', 'cep', 'ceptelefonu', 'gsm'], dogum: ['dogum', 'dogumtarihi'], sinif: ['sinif', 'ehliyetsinifi', 'istenensinif', 'belgesinifi'],
  kayitTarihi: ['kayittarihi', 'kayit'], ucret: ['ucret', 'kursucreti', 'toplamucret', 'tutar'], odenen: ['odenen', 'odenentutar', 'odenmis'],
  taksitSayisi: ['taksitsayisi', 'kalantaksit', 'taksit'], ilkVade: ['ilkvade', 'ilktaksittarihi', 'ilktaksit'], adres: ['adres'], eposta: ['eposta', 'email', 'mail'],
  veliAd: ['veli', 'veliadi', 'veliadsoyad'], veliTelefon: ['velitelefon', 'velitel'], mevcutEhliyet: ['elindekiehliyet', 'mevcutehliyet'], notlar: ['not', 'notlar', 'aciklama'],
};
const ADLAR: Record<string, string> = { ad: 'Ad', soyad: 'Soyad', tc: 'T.C. kimlik no', telefon: 'Telefon', dogum: 'Doğum tarihi', sinif: 'Sınıf', kayitTarihi: 'Kayıt tarihi',
  ucret: 'Kurs ücreti', odenen: 'Ödenen', taksitSayisi: 'Kalan taksit sayısı', ilkVade: 'İlk taksit tarihi', adres: 'Adres', eposta: 'E-posta', veliAd: 'Veli adı', veliTelefon: 'Veli telefonu',
  mevcutEhliyet: 'Elindeki ehliyet', notlar: 'Not' };

export function ExcelAktar({ subeler, varsayilanSube, subeSecilir, siniflar, tahsilat, bitti }:
  { subeler: [string, string][]; varsayilanSube: string; subeSecilir: boolean; siniflar: string[]; tahsilat: boolean; bitti: () => Promise<void> | void }) {
  const [sube, setSube] = useState(varsayilanSube);
  const [satirlar, setSatirlar] = useState<Record<string, unknown>[] | null>(null);
  const [eslesen, setEslesen] = useState<string[]>([]);
  const [hata, setHata] = useState('');
  const [sonuc, setSonuc] = useState<{ eklenen: number; hatalar: { satir: number; ad: string; hata: string }[] } | null>(null);

  const sablon = () => excelIndir('ogrenci-aktarim-sablonu.xlsx', [
    Object.values(ADLAR),
    ['Ayşe', 'Örnek', '10000000146', '0532 000 00 00', '15.03.2000', 'B', '01.09.2026', 15000, 5000, 4, '01.10.2026', 'Örnek Mah.', '', '', '', '', ''],
  ], 'Öğrenciler');

  async function oku(f: File) {
    setHata(''); setSonuc(null);
    try {
      const t = await tabloOku(f);
      if (t.length < 2) throw new Error('Dosyada başlık satırından sonra satır yok.');
      const basliklar = t[0].map(baslikSade);
      const sutun: Record<string, number> = {};
      for (const [alan, adlar] of Object.entries(ESLESME)) { const i = basliklar.findIndex((b) => adlar.includes(b)); if (i >= 0) sutun[alan] = i; }
      if (sutun.ad === undefined || sutun.soyad === undefined || sutun.tc === undefined) throw new Error('Başlık satırında en az "Ad", "Soyad" ve "T.C. kimlik no" sütunları olmalı. Şablonu indirip kullanabilirsiniz.');
      setEslesen(Object.keys(sutun));
      setSatirlar(t.slice(1).map((r, i) => {
        const al = (a: string) => (sutun[a] === undefined ? '' : String(r[sutun[a]] ?? '').trim());
        const para = (a: string) => { const x = paraOkuEsnek(al(a)); return x === null ? -1 : x; };
        return {
          satirNo: i + 2, ad: al('ad'), soyad: al('soyad'), tc: al('tc').replace(/\D/g, ''), telefon: al('telefon'), dogum: tarihOku(al('dogum')),
          sinif: (al('sinif') || 'B').toLocaleUpperCase('tr-TR').replace('OTOMATIK', 'Otomatik').replace(/^B OTOMATİK$/i, 'B Otomatik'),
          kayitTarihi: tarihOku(al('kayitTarihi')) || undefined, ucret: para('ucret'), odenen: tahsilat ? para('odenen') : 0,
          taksitSayisi: Number(al('taksitSayisi')) || 1, ilkVade: tarihOku(al('ilkVade')) || undefined, adres: al('adres'), eposta: al('eposta'),
          veliAd: al('veliAd'), veliTelefon: al('veliTelefon'), mevcutEhliyet: al('mevcutEhliyet'), notlar: al('notlar'),
        };
      }));
    } catch (e) { setHata((e as Error).message); setSatirlar(null); }
  }
  const sorunlu = (x: Record<string, unknown>) => !x.ad || !x.soyad || String(x.tc).length !== 11 || !siniflar.includes(String(x.sinif)) || (x.ucret as number) < 0 || (x.odenen as number) < 0;

  return (
    <div>
      <p className="kucuk">Başka bir programdan geçiyorsanız öğrencilerinizi Excel listesiyle aktarabilirsiniz. İlk satır başlık olmalı. Tanınan sütunlar: {Object.values(ADLAR).join(', ')}.
        Daha önce ödenmiş tutar "Ödenen" sütununa yazılır ve tek bir devir ödemesi olarak girer (bu dönemin tahsilatı sayılmaz).</p>
      <div className="dugmeler" style={{ marginBottom: 10 }}>
        <button type="button" className="dugme kucuk" onClick={sablon}>Şablonu indir</button>
      </div>
      {hata && <div className="hata">{hata}</div>}
      {subeSecilir && <label className="alan"><span>Hangi şubeye</span><select value={sube} onChange={(e) => setSube(e.target.value)}>{subeler.map(([k, e]) => <option key={k} value={k}>{e}</option>)}</select></label>}
      <label className="alan"><span>Dosya (.xlsx ya da .csv)</span><input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) oku(f); }} /></label>
      {satirlar && !sonuc && <>
        <p className="kucuk">{satirlar.length} satır okundu · eşleşen sütunlar: {eslesen.map((a) => ADLAR[a]).join(', ')}. {satirlar.filter(sorunlu).length ? <b>{satirlar.filter(sorunlu).length} satırda eksik ya da hatalı bilgi var (kırmızı); bunlar atlanacak.</b> : ''}</p>
        <div className="onizleme"><table><thead><tr><th>Satır</th><th>Ad soyad</th><th>Kimlik</th><th>Sınıf</th><th>Ücret</th><th>Ödenen</th></tr></thead>
          <tbody>{satirlar.slice(0, 100).map((x) => (
            <tr key={String(x.satirNo)} className={sorunlu(x) ? 'hatali' : ''}><td>{String(x.satirNo)}</td><td>{String(x.ad)} {String(x.soyad)}</td><td>{String(x.tc)}</td><td>{String(x.sinif)}</td>
              <td className="sayi-h">{(x.ucret as number) >= 0 ? ((x.ucret as number) / 100).toLocaleString('tr-TR') : '?'}</td><td className="sayi-h">{(x.odenen as number) >= 0 ? ((x.odenen as number) / 100).toLocaleString('tr-TR') : '?'}</td></tr>
          ))}</tbody></table></div>
      </>}
      {sonuc && <div>
        <p className="bilgi"><b>{sonuc.eklenen}</b> öğrenci aktarıldı.{sonuc.hatalar.length ? ` ${sonuc.hatalar.length} satır aktarılamadı:` : ''}</p>
        {sonuc.hatalar.length > 0 && <ul className="liste">{sonuc.hatalar.map((h) => <li key={h.satir}><b>Satır {h.satir}</b> {h.ad} <span className="soluk kucuk">· {h.hata}</span></li>)}</ul>}
      </div>}
      <div className="alt">
        <button type="button" className="dugme" onClick={pencereKapat}>{sonuc ? 'Kapat' : 'Vazgeç'}</button>
        {satirlar && !sonuc && <IsDugmesi className="dugme ana" is={async () => {
          const gecerli = satirlar.map((x) => ({ ...x, ucret: Math.max(0, x.ucret as number), odenen: Math.max(0, x.odenen as number) }));
          let eklenen = 0; const hatalar: { satir: number; ad: string; hata: string }[] = [];
          // 500'erli parçalar hâlinde gönderilir.
          for (let i = 0; i < gecerli.length; i += 500) {
            const r = await islem<{ eklenen: number; hatalar: { satir: number; ad: string; hata: string }[] }>('ogrenci_toplu_ekle', { subeId: sube, satirlar: gecerli.slice(i, i + 500) });
            eklenen += r.eklenen; hatalar.push(...r.hatalar);
          }
          setSonuc({ eklenen, hatalar });
          await bitti();
          bildir(`${eklenen} öğrenci aktarıldı.`, 'tamam');
        }}>{satirlar.length} satırı aktar</IsDugmesi>}
      </div>
    </div>
  );
}
