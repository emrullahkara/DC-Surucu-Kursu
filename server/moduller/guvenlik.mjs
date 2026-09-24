// Güvenlik: isteğe bağlı ek doğrulama kodu (karar 18) ve kayıt defteri.
//
// EK DOĞRULAMA (TOTP, Google/Microsoft Authenticator uyumlu): İSTEĞE BAĞLI. Açmayan kullanıcı bugünkü gibi girer.
// Açarken 8 adet tek kullanımlık kurtarma kodu üretilir ve yalnız bir kez gösterilir; telefon kaybolursa
// kullanıcı hesabından kilitlenmez.
import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { fail, metin } from '../domain.mjs';
import { sutunEkle } from '../db-ortak.mjs';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32Kodla(buf) {
  let bit = 0, deger = 0, cikti = '';
  for (const b of buf) { deger = (deger << 8) | b; bit += 8; while (bit >= 5) { cikti += B32[(deger >>> (bit - 5)) & 31]; bit -= 5; } }
  if (bit > 0) cikti += B32[(deger << (5 - bit)) & 31];
  return cikti;
}
function b32Coz(s) {
  let bit = 0, deger = 0;
  const cikti = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    deger = (deger << 5) | i; bit += 5;
    if (bit >= 8) { cikti.push((deger >>> (bit - 8)) & 255); bit -= 8; }
  }
  return Buffer.from(cikti);
}
// RFC 6238: 30 saniyelik pencere, 6 hane, HMAC-SHA1
export function totpUret(gizli, adim) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(adim));
  const ozet = createHmac('sha1', b32Coz(gizli)).update(buf).digest();
  const k = ozet[ozet.length - 1] & 15;
  const kod = (((ozet[k] & 127) << 24) | (ozet[k + 1] << 16) | (ozet[k + 2] << 8) | ozet[k + 3]) % 1000000;
  return String(kod).padStart(6, '0');
}
// Saat kaymasına karşı bir önceki ve bir sonraki pencere de kabul edilir. Aynı kod ikinci kez kullanılamaz.
function totpAdim(gizli, kod, simdiMs, sonAdim = 0) {
  const temiz = String(kod || '').replace(/\D/g, '');
  if (temiz.length !== 6) return null;
  const simdi = Math.floor(simdiMs / 30000);
  for (let d = -1; d <= 1; d++) {
    const adim = simdi + d;
    if (adim <= sonAdim) continue;
    if (timingSafeEqual(Buffer.from(totpUret(gizli, adim)), Buffer.from(temiz))) return adim;
  }
  return null;
}
const kurtarmaKodu = () => randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
const kodOzeti = (k) => createHash('sha256').update(String(k).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

function kodDogrula(c, k, kod) {
  const adim = totpAdim(k.totp_gizli, kod, c.saatKaynagi().getTime(), k.totp_son_adim || 0);
  if (adim) { c.run('UPDATE kullanicilar SET totp_son_adim=? WHERE id=?', adim, k.id); return true; }
  // Kurtarma kodu: tek kullanımlık.
  let kodlar = [];
  try { kodlar = JSON.parse(k.totp_kurtarma || '[]'); } catch { kodlar = []; }
  const oz = kodOzeti(kod);
  if (String(kod || '').replace(/[^A-Za-z0-9]/g, '').length === 10 && kodlar.includes(oz)) {
    c.run('UPDATE kullanicilar SET totp_kurtarma=? WHERE id=?', JSON.stringify(kodlar.filter((x) => x !== oz)), k.id);
    return true;
  }
  return false;
}

export default {
  ad: 'guvenlik',
  sema(db) {
    sutunEkle(db, 'kullanicilar', 'totp_gizli', 'TEXT');
    sutunEkle(db, 'kullanicilar', 'totp_bekleyen', 'TEXT');
    sutunEkle(db, 'kullanicilar', 'totp_kurtarma', 'TEXT');
    sutunEkle(db, 'kullanicilar', 'totp_son_adim', 'INTEGER');
  },

  girisEkKontrol(c, k, g) {
    if (!k.totp_gizli) return null;
    if (!g.kod) return 'kod_gerekli';
    return kodDogrula(c, k, g.kod) ? null : 'kod_yanlis';
  },

  islemler: {
    totp_baslat(c, k) {
      if (k.totp_gizli) fail('Ek doğrulama zaten açık.');
      const gizli = b32Kodla(randomBytes(20));
      c.run('UPDATE kullanicilar SET totp_bekleyen=? WHERE id=?', gizli, k.id);
      const kurum = c.q1('SELECT ad FROM kurum')?.ad || 'DC Sürücü Kursu';
      const etiket = encodeURIComponent(`${kurum}:${k.kullanici_adi}`);
      return { sonuc: { gizli, uri: `otpauth://totp/${etiket}?secret=${gizli}&issuer=${encodeURIComponent(kurum)}&algorithm=SHA1&digits=6&period=30` } };
    },
    totp_ac(c, k, g) {
      const u = c.q1('SELECT * FROM kullanicilar WHERE id=?', k.id);
      if (!u.totp_bekleyen) fail('Önce kurulumu başlatın.');
      const adim = totpAdim(u.totp_bekleyen, g.kod, c.saatKaynagi().getTime());
      if (!adim) fail('Kod doğru değil. Telefonunuzun saatinin doğru olduğundan emin olun ve yeni kodu yazın.');
      const kodlar = Array.from({ length: 8 }, kurtarmaKodu);
      c.run('UPDATE kullanicilar SET totp_gizli=?, totp_bekleyen=NULL, totp_kurtarma=?, totp_son_adim=? WHERE id=?', u.totp_bekleyen, JSON.stringify(kodlar.map(kodOzeti)), adim, k.id);
      return { sonuc: { kurtarmaKodlari: kodlar }, olay: [k.sube_id, 'guvenlik', `${k.ad} ek doğrulama kodunu açtı`] };
    },
    totp_kapat(c, k, g) {
      const u = c.q1('SELECT * FROM kullanicilar WHERE id=?', k.id);
      if (!u.totp_gizli) fail('Ek doğrulama zaten kapalı.');
      if (!c.sifreDogru(g.sifre, u.sifre)) fail('Şifre yanlış.');
      if (!kodDogrula(c, u, metin(g.kod, 20, true, 'Kod'))) fail('Kod doğru değil.');
      c.run('UPDATE kullanicilar SET totp_gizli=NULL, totp_bekleyen=NULL, totp_kurtarma=NULL, totp_son_adim=NULL WHERE id=?', k.id);
      return { olay: [k.sube_id, 'guvenlik', `${k.ad} ek doğrulama kodunu kapattı`] };
    },
    // Telefonunu kaybeden ve kurtarma kodu da olmayan personel için: yönetici kapatır.
    totp_sifirla(c, k, g) {
      if (k.rol !== 'yonetici') fail('Yalnız yönetici sıfırlayabilir.', 403);
      const u = c.q1('SELECT * FROM kullanicilar WHERE id=?', metin(g.id, 60, true));
      if (!u) fail('Personel bulunamadı.', 404);
      c.run('UPDATE kullanicilar SET totp_gizli=NULL, totp_bekleyen=NULL, totp_kurtarma=NULL, totp_son_adim=NULL WHERE id=?', u.id);
      return { olay: [u.sube_id, 'guvenlik', `${u.ad} için ek doğrulama kodu yönetici tarafından kapatıldı`] };
    },
  },

  // Kayıt defteri: kim, ne zaman, ne yaptı. Yönetici bütün kurumu, şube müdürü kendi şubesini görür.
  yol(c, k, { yontem, yol, sorgu }) {
    if (yol === '/api/kayit-defteri' && yontem === 'GET') {
      if (!['yonetici', 'sube_muduru'].includes(k.rol)) fail('Kayıt defterini yönetici ve şube müdürü görür.', 403);
      const sartlar = [], p = [];
      const kps = c.kapsam(k);
      if (kps !== null) { sartlar.push('sube_id=?'); p.push(kps); }
      else if (sorgu.get('sube')) { sartlar.push('sube_id=?'); p.push(String(sorgu.get('sube'))); }
      const ara = String(sorgu.get('ara') || '').trim();
      if (ara) { sartlar.push('metin LIKE ?'); p.push(`%${ara.replace(/[%_]/g, '')}%`); }
      const kisi = String(sorgu.get('kisi') || '').trim();
      if (kisi) { sartlar.push('kullanici=?'); p.push(kisi); }
      const olaylar = c.q(`SELECT * FROM olaylar ${sartlar.length ? 'WHERE ' + sartlar.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`, ...p);
      return { durum: 200, veri: { olaylar } };
    }
    return null;
  },
};
