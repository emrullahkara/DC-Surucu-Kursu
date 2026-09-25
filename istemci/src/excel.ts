// Gerçek Excel dosyası (.xlsx) yazma ve okuma. Dış kütüphane kullanılmaz:
//  - Yazma: sıkıştırmasız ZIP içinde en küçük geçerli çalışma kitabı (yazılar "satır içi yazı" olarak; formül olarak
//    çalışamaz, bu yüzden "=", "+" ile başlayan hücreler de güvenlidir).
//  - Okuma: .xlsx (tarayıcının kendi açıcısıyla) ve .csv (noktalı virgül ya da virgül ayraçlı).

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------
const CRC_TABLO = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLO[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipYaz(dosyalar: { ad: string; veri: Uint8Array }[]): Uint8Array {
  const kod = new TextEncoder();
  const parcalar: Uint8Array[] = [];
  const merkez: Uint8Array[] = [];
  let konum = 0;
  for (const d of dosyalar) {
    const ad = kod.encode(d.ad);
    const crc = crc32(d.veri);
    const yerel = new DataView(new ArrayBuffer(30));
    yerel.setUint32(0, 0x04034b50, true); yerel.setUint16(4, 20, true); yerel.setUint16(6, 0x0800, true); yerel.setUint16(8, 0, true);
    yerel.setUint32(14, crc, true); yerel.setUint32(18, d.veri.length, true); yerel.setUint32(22, d.veri.length, true); yerel.setUint16(26, ad.length, true);
    parcalar.push(new Uint8Array(yerel.buffer), ad, d.veri);
    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true); m.setUint16(4, 20, true); m.setUint16(6, 20, true); m.setUint16(8, 0x0800, true); m.setUint16(10, 0, true);
    m.setUint32(16, crc, true); m.setUint32(20, d.veri.length, true); m.setUint32(24, d.veri.length, true); m.setUint16(28, ad.length, true); m.setUint32(42, konum, true);
    merkez.push(new Uint8Array(m.buffer), ad);
    konum += 30 + ad.length + d.veri.length;
  }
  const merkezBoy = merkez.reduce((a, x) => a + x.length, 0);
  const son = new DataView(new ArrayBuffer(22));
  son.setUint32(0, 0x06054b50, true); son.setUint16(8, dosyalar.length, true); son.setUint16(10, dosyalar.length, true);
  son.setUint32(12, merkezBoy, true); son.setUint32(16, konum, true);
  const hepsi = [...parcalar, ...merkez, new Uint8Array(son.buffer)];
  const cikti = new Uint8Array(hepsi.reduce((a, x) => a + x.length, 0));
  let i = 0;
  for (const p of hepsi) { cikti.set(p, i); i += p.length; }
  return cikti;
}
async function zipOku(b: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let son = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { son = i; break; }
  if (son < 0) throw new Error('Dosya okunamadı (Excel dosyası değil).');
  const sayi = dv.getUint16(son + 10, true);
  let p = dv.getUint32(son + 16, true);
  const cozucu = new TextDecoder();
  const sonuc = new Map<string, Uint8Array>();
  for (let n = 0; n < sayi; n++) {
    const yontem = dv.getUint16(p + 10, true), sikisik = dv.getUint32(p + 20, true);
    const adBoy = dv.getUint16(p + 28, true), ekBoy = dv.getUint16(p + 30, true), notBoy = dv.getUint16(p + 32, true);
    const yerel = dv.getUint32(p + 42, true);
    const ad = cozucu.decode(b.subarray(p + 46, p + 46 + adBoy));
    const veriBas = yerel + 30 + dv.getUint16(yerel + 26, true) + dv.getUint16(yerel + 28, true);
    const ham = b.subarray(veriBas, veriBas + sikisik);
    if (yontem === 0) sonuc.set(ad, ham);
    else if (yontem === 8) {
      const akis = new Blob([ham as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      sonuc.set(ad, new Uint8Array(await new Response(akis).arrayBuffer()));
    }
    p += 46 + adBoy + ekBoy + notBoy;
  }
  return sonuc;
}

// ---------------------------------------------------------------------------
// XLSX YAZ
// ---------------------------------------------------------------------------
const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const sutunAdi = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export type Hucre = string | number | null | undefined;

export function xlsxOlustur(satirlar: Hucre[][], sayfaAdi = 'Liste'): Uint8Array {
  const kod = new TextEncoder();
  const genislik = satirlar.reduce((a, s) => Math.max(a, s.length), 0);
  const sutunlar = Array.from({ length: genislik }, (_, i) => {
    const en = Math.min(60, Math.max(8, ...satirlar.slice(0, 200).map((s) => String(s[i] ?? '').length + 2)));
    return `<col min="${i + 1}" max="${i + 1}" width="${en}" customWidth="1"/>`;
  }).join('');
  const govde = satirlar.map((s, r) => `<row r="${r + 1}">${s.map((h, c) => {
    const ref = `${sutunAdi(c)}${r + 1}`, stil = r === 0 ? ' s="1"' : '';
    if (h === null || h === undefined || h === '') return '';
    if (typeof h === 'number' && Number.isFinite(h)) return `<c r="${ref}"${stil}><v>${h}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${stil}><is><t xml:space="preserve">${xml(String(h))}</t></is></c>`;
  }).join('')}</row>`).join('');
  const dosyalar: [string, string][] = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sayfaAdi.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${sutunlar ? `<cols>${sutunlar}</cols>` : ''}<sheetData>${govde}</sheetData></worksheet>`],
  ];
  return zipYaz(dosyalar.map(([ad, icerik]) => ({ ad, veri: kod.encode(icerik) })));
}

export function dosyaIndir(ad: string, veri: BlobPart, tur: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([veri], { type: tur }));
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Ekranlardaki "Excel" düğmeleri: .xlsx indirir.
export function excelIndir(ad: string, satirlar: Hucre[][], sayfaAdi?: string) {
  dosyaIndir(ad.replace(/\.(csv|xlsx)$/i, '') + '.xlsx', xlsxOlustur(satirlar, sayfaAdi) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------------------------------------------------------------------------
// OKUMA (.xlsx ya da .csv) -> satırlar (yazı olarak)
// ---------------------------------------------------------------------------
function csvCoz(metin: string): string[][] {
  const t = metin.replace(/^﻿/, '');
  const ilk = t.split(/\r?\n/, 1)[0] || '';
  const ayrac = (ilk.match(/;/g) || []).length >= (ilk.match(/,/g) || []).length ? ';' : ',';
  const satirlar: string[][] = [];
  let satir: string[] = [], hucre = '', tirnak = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (tirnak) {
      if (ch === '"' && t[i + 1] === '"') { hucre += '"'; i++; }
      else if (ch === '"') tirnak = false;
      else hucre += ch;
    } else if (ch === '"') tirnak = true;
    else if (ch === ayrac) { satir.push(hucre); hucre = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      satir.push(hucre); satirlar.push(satir); satir = []; hucre = '';
    } else hucre += ch;
  }
  if (hucre || satir.length) { satir.push(hucre); satirlar.push(satir); }
  return satirlar.filter((s) => s.some((x) => x.trim()));
}
const sutunNo = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

async function xlsxCoz(b: Uint8Array): Promise<string[][]> {
  const z = await zipOku(b);
  const oku = (ad: string) => { const x = z.get(ad); return x ? new DOMParser().parseFromString(new TextDecoder().decode(x), 'application/xml') : null; };
  const paylasilan = (oku('xl/sharedStrings.xml')?.getElementsByTagName('si') ? [...oku('xl/sharedStrings.xml')!.getElementsByTagName('si')] : [])
    .map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent || '').join(''));
  // İlk sayfa: çalışma kitabındaki ilk sayfanın dosyası.
  let sayfaYolu = 'xl/worksheets/sheet1.xml';
  const wb = oku('xl/workbook.xml'), rels = oku('xl/_rels/workbook.xml.rels');
  const ilk = wb?.getElementsByTagName('sheet')[0];
  const rid = ilk?.getAttribute('r:id') || ilk?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rid && rels) for (const r of [...rels.getElementsByTagName('Relationship')]) if (r.getAttribute('Id') === rid) {
    const hedef = r.getAttribute('Target') || '';
    sayfaYolu = hedef.startsWith('/') ? hedef.slice(1) : 'xl/' + hedef.replace(/^\.\//, '');
  }
  const sayfa = oku(sayfaYolu);
  if (!sayfa) throw new Error('Excel dosyasında sayfa bulunamadı.');
  const satirlar: string[][] = [];
  for (const row of [...sayfa.getElementsByTagName('row')]) {
    const s: string[] = [];
    for (const c of [...row.getElementsByTagName('c')]) {
      const i = sutunNo(c.getAttribute('r') || 'A');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let deger = v;
      if (t === 's') deger = paylasilan[Number(v)] ?? '';
      else if (t === 'inlineStr') deger = [...c.getElementsByTagName('t')].map((x) => x.textContent || '').join('');
      else if (t === 'b') deger = v === '1' ? 'DOĞRU' : 'YANLIŞ';
      s[i] = deger;
    }
    satirlar.push(Array.from(s, (x) => x ?? ''));
  }
  return satirlar.filter((s) => s.some((x) => String(x).trim()));
}

export async function tabloOku(dosya: File): Promise<string[][]> {
  const b = new Uint8Array(await dosya.arrayBuffer());
  if (b[0] === 0x50 && b[1] === 0x4b) return xlsxCoz(b);
  if (/\.xls$/i.test(dosya.name)) throw new Error('Eski Excel biçimi (.xls) okunamıyor. Excel\'de "Farklı kaydet > Excel Çalışma Kitabı (.xlsx)" ile kaydedin.');
  return csvCoz(new TextDecoder('utf-8').decode(b));
}

// Excel tarihleri: seri sayı (45000), gg.aa.yyyy, gg/aa/yyyy ya da yyyy-aa-gg -> yyyy-aa-gg. Okunamazsa ''.
export function tarihOku(v: string): string {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
// "1.500,00", "1500", "1500.5" -> kuruş. Okunamazsa null.
export function paraOkuEsnek(v: string): number | null {
  let t = String(v ?? '').trim().replace(/[\s₺TLtl]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
// Başlık adını sadeleştir: "T.C. Kimlik No" -> "tckimlikno"
export const baslikSade = (s: string) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[ıi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '');
