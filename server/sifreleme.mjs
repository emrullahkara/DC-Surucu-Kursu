// Hassas bilgilerin şifreli saklanması (AES-256-GCM): öğrenci evrakları (kimlik, sağlık raporu),
// ek doğrulama kodu anahtarları, sanal POS ve SMS şifreleri.
//
// Anahtar veritabanının İÇİNDE DEĞİLDİR: bilgisayarda VERI_ANAHTARI ortam değişkeni ya da veri klasöründeki
// ayrı anahtar dosyası, bulutta gizli değişken (secret). Veritabanı dosyası tek başına ele geçse bile
// bu bilgiler okunamaz. Anahtar kaybolursa şifreli bilgiler de okunamaz; anahtar yedeklenmelidir.
//
// Geriye uyum: şifrelenmeden önce yazılmış eski kayıtlar olduğu gibi okunur (başlarında işaret yoktur).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ISARET = Buffer.from('DCS1');
const METIN_ON = 'enc1:';

export function anahtarCoz(v) {
  if (!v) return null;
  const s = String(v).trim();
  const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64');
  if (b.length !== 32) throw new Error('VERI_ANAHTARI 32 bayt olmalı (64 haneli onaltılık ya da base64).');
  return b;
}
export const yeniAnahtar = () => randomBytes(32).toString('hex');

export function sifreleyici(anahtar) {
  function sifrele(veri) {
    const b = Buffer.isBuffer(veri) ? veri : Buffer.from(veri);
    if (!anahtar) return b;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', anahtar, iv);
    const ic = Buffer.concat([c.update(b), c.final()]);
    return Buffer.concat([ISARET, iv, c.getAuthTag(), ic]);
  }
  function coz(veri) {
    const b = Buffer.from(veri);
    if (b.length < 32 || !b.subarray(0, 4).equals(ISARET)) return b; // eski, şifresiz kayıt
    if (!anahtar) throw new Error('Şifreli kaydı okumak için veri anahtarı gerekli.');
    const d = createDecipheriv('aes-256-gcm', anahtar, b.subarray(4, 16));
    d.setAuthTag(b.subarray(16, 32));
    return Buffer.concat([d.update(b.subarray(32)), d.final()]);
  }
  // Kısa metinler (anahtar, şifre) için: "enc1:" + base64.
  const metinSifrele = (s) => (!s || !anahtar ? s || '' : METIN_ON + sifrele(Buffer.from(String(s))).toString('base64'));
  const metinCoz = (s) => (typeof s === 'string' && s.startsWith(METIN_ON) ? coz(Buffer.from(s.slice(METIN_ON.length), 'base64')).toString() : s || '');
  return { sifrele, coz, metinSifrele, metinCoz, acik: !!anahtar };
}
