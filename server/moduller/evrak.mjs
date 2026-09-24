// Öğrenci evrakları (karar 12): fotoğraf veya PDF yükleme, eksik evrak listesi.
// Dosyanın kendisi ayrı tabloda durur ve yalnız istenince, yalnız yetkili kişiye gönderilir.
import { randomUUID } from 'node:crypto';
import { fail, metin } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;
export const EN_FAZLA_EVRAK = 2_500_000; // bayt; telefon fotoğrafları ekranda küçültülerek gönderilir

function dosyaCoz(veri) {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(veri || ''));
  if (!m) fail('Dosya okunamadı.');
  const b = Buffer.from(m[2], 'base64');
  if (b.length > EN_FAZLA_EVRAK) fail('Dosya en fazla 2,5 MB olabilir.');
  const hex = b.subarray(0, 8).toString('hex');
  let tip = '';
  if (hex.startsWith('ffd8ff')) tip = 'image/jpeg';
  else if (hex === '89504e470d0a1a0a') tip = 'image/png';
  else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') tip = 'image/webp';
  else if (b.toString('ascii', 0, 5) === '%PDF-') tip = 'application/pdf';
  if (!tip) fail('Yalnız JPG, PNG, WebP fotoğraf veya PDF yüklenebilir.');
  return { tip, b };
}

export function evrakDurumu(c, ogrenciId, turler = c.ayar().evrakTurleri) {
  const var_ = new Set(c.q('SELECT DISTINCT tur FROM evraklar WHERE ogrenci_id=?', ogrenciId).map((x) => x.tur));
  return { eksik: turler.filter((t) => !var_.has(t)), tamam: turler.filter((t) => var_.has(t)) };
}

export default {
  ad: 'evrak',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS evraklar(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), tur TEXT NOT NULL, ad TEXT NOT NULL,
  boyut INTEGER NOT NULL, tip TEXT NOT NULL, kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS evrak_ogr ON evraklar(ogrenci_id);
CREATE TABLE IF NOT EXISTS evrak_dosyalari(evrak_id TEXT PRIMARY KEY REFERENCES evraklar(id), veri BLOB NOT NULL);
`);
  },

  veri(c, k, v) {
    const turler = c.ayar().evrakTurleri;
    v.tanimlar.evrakTurleri = turler;
    if (!c.hak(k, 'evrak') && !c.hak(k, 'kayit')) return;
    const ids = new Set(v.ogrenciler.map((o) => o.id));
    const hepsi = c.q('SELECT id,ogrenci_id,tur,ad,boyut,tip,kaydeden,olusturma FROM evraklar ORDER BY olusturma DESC').filter((e) => ids.has(e.ogrenci_id));
    const turlerOgr = new Map();
    for (const e of hepsi) { if (!turlerOgr.has(e.ogrenci_id)) turlerOgr.set(e.ogrenci_id, new Set()); turlerOgr.get(e.ogrenci_id).add(e.tur); }
    for (const o of v.ogrenciler) {
      const var_ = turlerOgr.get(o.id) || new Set();
      o.evrak = { eksik: turler.filter((t) => !var_.has(t)), tamam: turler.filter((t) => var_.has(t)) };
    }
    if (c.hak(k, 'evrak')) v.evraklar = hepsi;
  },

  islemler: {
    evrak_yukle(c, k, g) {
      c.hakGerek(k, 'evrak');
      const o = c.ogrenciAl(k, g.ogrenciId);
      const tur = metin(g.tur, 60, true, 'Evrak türü');
      const { tip, b } = dosyaCoz(g.veri);
      const id = randomUUID();
      c.run('INSERT INTO evraklar(id,ogrenci_id,tur,ad,boyut,tip,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?)', id, o.id, tur, metin(g.ad || tur, 120) || tur, b.length, tip, k.ad, simdi());
      c.run('INSERT INTO evrak_dosyalari(evrak_id,veri) VALUES(?,?)', id, b);
      return { sonuc: { id }, olay: [o.sube_id, 'kayit', `${adSoyad(o)} için evrak yüklendi: ${tur}`] };
    },
    evrak_sil(c, k, g) {
      c.hakGerek(k, 'evrak');
      const e = c.q1('SELECT * FROM evraklar WHERE id=?', metin(g.id, 60, true));
      if (!e) fail('Evrak bulunamadı.', 404);
      const o = c.ogrenciAl(k, e.ogrenci_id);
      c.run('DELETE FROM evrak_dosyalari WHERE evrak_id=?', e.id);
      c.run('DELETE FROM evraklar WHERE id=?', e.id);
      return { olay: [o.sube_id, 'kayit', `${adSoyad(o)} evrakı silindi: ${e.tur} (${e.ad})`] };
    },
  },

  yol(c, k, { yontem, yol, sorgu }) {
    if (yol === '/api/evrak' && yontem === 'GET') {
      c.hakGerek(k, 'evrak');
      const e = c.q1('SELECT * FROM evraklar WHERE id=?', String(sorgu.get('id') || ''));
      if (!e) fail('Evrak bulunamadı.', 404);
      c.ogrenciAl(k, e.ogrenci_id);
      const d = c.q1('SELECT veri FROM evrak_dosyalari WHERE evrak_id=?', e.id);
      if (!d) fail('Dosya bulunamadı.', 404);
      return { durum: 200, ham: { basliklar: { 'Content-Type': e.tip, 'Content-Disposition': `inline; filename="evrak.${e.tip === 'application/pdf' ? 'pdf' : 'jpg'}"` }, govde: Buffer.from(d.veri) } };
    }
    return null;
  },

  ogrenciVeri(c, o, v) {
    v.evrak = evrakDurumu(c, o.id);
  },
};
