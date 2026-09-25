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
// Platform yönetimi de aynı doğrulamayı kullanır. Dönüş: kabul edilen adım ya da null.
export const totpDogrula = (gizli, kod, simdiMs, sonAdim = 0) => totpAdim(gizli, kod, simdiMs, sonAdim);
const kurtarmaKodu = () => randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
const kodOzeti = (k) => createHash('sha256').update(String(k).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

function kodDogrula(c, k, kod) {
  const adim = totpAdim(c.sifre.metinCoz(k.totp_gizli), kod, c.saatKaynagi().getTime(), k.totp_son_adim || 0);
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

// ŞİFREMİ UNUTTUM: personel giriş ekranından talep açar. Kod, kimliği bilen biri tarafından verilir:
//  - SMS açıksa ve kayıtlı cep telefonu varsa kod doğrudan SMS ile gider;
//  - değilse yönetici (ya da kendi şubesindeki personel için şube müdürü) kodu üretip telefonla/WhatsApp ile iletir;
//  - kurumun tek yöneticisi şifresini unutursa kodu DC platform yöneticisi üretir.
// Kod 60 dakika geçerlidir, tek kullanımlıktır, en fazla 5 yanlış denemeye izin verilir.
const KOD_SURESI = 60 * 60 * 1000;
const kodUret = () => { const h = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; const b = randomBytes(8); return [...b].map((x) => h[x % h.length]).join(''); };
export function sifreKoduVer(c, kullanici, veren) {
  const kod = kodUret();
  c.run("UPDATE sifre_talepleri SET durum='iptal' WHERE kullanici_id=? AND durum IN ('bekliyor','kod_verildi')", kullanici.id);
  c.run("INSERT INTO sifre_talepleri(id,kullanici_id,kod_ozet,bitis,durum,deneme,olusturma,veren) VALUES(?,?,?,?,'kod_verildi',0,?,?)",
    randomBytes(16).toString('hex'), kullanici.id, kodOzeti(kod), c.saatKaynagi().getTime() + KOD_SURESI, new Date().toISOString(), veren);
  return kod;
}

export default {
  ad: 'guvenlik',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS sifre_talepleri(id TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL REFERENCES kullanicilar(id), kod_ozet TEXT,
  bitis INTEGER NOT NULL DEFAULT 0, durum TEXT NOT NULL, deneme INTEGER NOT NULL DEFAULT 0, olusturma TEXT NOT NULL, veren TEXT NOT NULL DEFAULT '');`);
    sutunEkle(db, 'kullanicilar', 'totp_gizli', 'TEXT');
    sutunEkle(db, 'kullanicilar', 'totp_bekleyen', 'TEXT');
    sutunEkle(db, 'kullanicilar', 'totp_kurtarma', 'TEXT');
    sutunEkle(db, 'kullanicilar', 'totp_son_adim', 'INTEGER');
  },

  veri(c, k, v) {
    if (k.rol !== 'yonetici' && k.rol !== 'sube_muduru') return;
    const sinir = new Date(c.saatKaynagi().getTime() - 3 * 86400000).toISOString();
    v.sifreTalepleri = c.q(`SELECT t.id, t.kullanici_id, t.durum, t.olusturma, u.ad, u.rol, u.sube_id FROM sifre_talepleri t JOIN kullanicilar u ON u.id=t.kullanici_id
      WHERE t.durum='bekliyor' AND t.olusturma>=? ORDER BY t.olusturma DESC`, sinir)
      .filter((t) => k.rol === 'yonetici' || (t.sube_id === k.sube_id && ['buro', 'muhasebe', 'egitmen'].includes(t.rol)));
  },

  acikYol(c, { yontem, yol, govde, ip }) {
    if (yol === '/api/sifre-unuttum' && yontem === 'POST') {
      const cevap = { durum: 200, veri: { tamam: true, mesaj: 'Talebiniz yöneticinize iletildi. Size bir sıfırlama kodu verildiğinde "Kodum var" ile yeni şifrenizi belirleyin.' } };
      const kad = metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
      // Kötüye kullanım sınırı: yer başına saatte 10 talep.
      const anahtar = `unuttum@${ip || '-'}`;
      const d = c.q1('SELECT * FROM giris_denemeleri WHERE anahtar=?', anahtar);
      const simdiMs = c.saatKaynagi().getTime();
      const sayi = d && d.kilit_bitis > simdiMs ? d.sayi : 0;
      if (sayi >= 10) fail('Çok fazla talep yapıldı. Biraz sonra tekrar deneyin.', 429);
      c.run('INSERT INTO giris_denemeleri(anahtar,sayi,kilit_bitis) VALUES(?,?,?) ON CONFLICT(anahtar) DO UPDATE SET sayi=excluded.sayi, kilit_bitis=excluded.kilit_bitis', anahtar, sayi + 1, d && d.kilit_bitis > simdiMs ? d.kilit_bitis : simdiMs + 3600000);
      const k = c.q1('SELECT * FROM kullanicilar WHERE kullanici_adi=? AND aktif=1', kad);
      // Kullanıcı olsun olmasın aynı cevap verilir (kullanıcı adları dışarıdan tahmin edilemesin).
      if (!k) return cevap;
      if (c.q1("SELECT 1 FROM sifre_talepleri WHERE kullanici_id=? AND durum='bekliyor' AND olusturma>=?", k.id, new Date(simdiMs - 3600000).toISOString())) return cevap;
      c.run("INSERT INTO sifre_talepleri(id,kullanici_id,durum,olusturma) VALUES(?,?,'bekliyor',?)", randomBytes(16).toString('hex'), k.id, new Date().toISOString());
      c.olayYayinla({ ad: k.ad }, k.sube_id, 'guvenlik', `${k.ad} şifresini unuttuğunu bildirdi; sıfırlama kodu bekliyor (Personel ekranı)`);
      return cevap;
    }
    if (yol === '/api/sifre-sifirla' && yontem === 'POST') {
      const kad = metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
      const k = c.q1('SELECT * FROM kullanicilar WHERE kullanici_adi=? AND aktif=1', kad);
      const t = k && c.q1("SELECT * FROM sifre_talepleri WHERE kullanici_id=? AND durum='kod_verildi' ORDER BY olusturma DESC LIMIT 1", k.id);
      const hata = () => fail('Kod geçersiz ya da süresi dolmuş. Yöneticinizden yeni kod isteyin.', 400);
      if (!t || t.bitis < c.saatKaynagi().getTime() || t.deneme >= 5) hata();
      const temiz = String(govde.kod || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!timingSafeEqual(Buffer.from(kodOzeti(temiz)), Buffer.from(t.kod_ozet))) { c.run('UPDATE sifre_talepleri SET deneme=deneme+1 WHERE id=?', t.id); hata(); }
      const yeni = c.sifreKontrol(govde.yeniSifre);
      c.run('UPDATE kullanicilar SET sifre=? WHERE id=?', c.sifreOzet(yeni), k.id);
      c.run("UPDATE sifre_talepleri SET durum='kullanildi' WHERE id=?", t.id);
      c.run("DELETE FROM oturumlar WHERE tur='personel' AND kimlik=?", k.id);
      c.run("DELETE FROM giris_denemeleri WHERE anahtar=? OR (anahtar LIKE ? ESCAPE '\\')", `p:${kad}`, `p:${kad.replace(/[\\%_]/g, (x) => '\\' + x)}@%`);
      c.olayYayinla({ ad: k.ad }, k.sube_id, 'guvenlik', `${k.ad} sıfırlama koduyla yeni şifre belirledi`);
      return { durum: 200, veri: { tamam: true } };
    }
    return null;
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
      c.run('UPDATE kullanicilar SET totp_bekleyen=? WHERE id=?', c.sifre.metinSifrele(gizli), k.id);
      const kurum = c.q1('SELECT ad FROM kurum')?.ad || 'DC Sürücü Kursu';
      const etiket = encodeURIComponent(`${kurum}:${k.kullanici_adi}`);
      return { sonuc: { gizli, uri: `otpauth://totp/${etiket}?secret=${gizli}&issuer=${encodeURIComponent(kurum)}&algorithm=SHA1&digits=6&period=30` } };
    },
    totp_ac(c, k, g) {
      const u = c.q1('SELECT * FROM kullanicilar WHERE id=?', k.id);
      if (!u.totp_bekleyen) fail('Önce kurulumu başlatın.');
      const adim = totpAdim(c.sifre.metinCoz(u.totp_bekleyen), g.kod, c.saatKaynagi().getTime());
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
    // Şifresini unutan personel için tek kullanımlık kod (60 dakika). Yönetici herkese; şube müdürü kendi
    // şubesindeki büro, muhasebe ve eğitmene verir. Kendine kod üretilemez.
    sifre_kodu_uret(c, k, g) {
      if (k.rol !== 'yonetici' && k.rol !== 'sube_muduru') fail('Kodu yönetici ya da şube müdürü verir.', 403);
      const u = c.q1('SELECT * FROM kullanicilar WHERE id=? AND aktif=1', metin(g.kullaniciId, 60, true, 'Personel'));
      if (!u) fail('Personel bulunamadı.', 404);
      if (u.id === k.id) fail('Kendinize kod üretemezsiniz.');
      if (k.rol !== 'yonetici' && (u.sube_id !== k.sube_id || !['buro', 'muhasebe', 'egitmen'].includes(u.rol))) fail('Bu personel için yetkiniz yok.', 403);
      const kod = sifreKoduVer(c, u, k.ad);
      return { sonuc: { kod, telefon: u.telefon, ad: u.ad, kullaniciAdi: u.kullanici_adi }, olay: [u.sube_id, 'guvenlik', `${u.ad} için şifre sıfırlama kodu üretildi (${k.ad})`] };
    },
    sifre_talebi_kapat(c, k, g) {
      if (k.rol !== 'yonetici' && k.rol !== 'sube_muduru') fail('Yetkiniz yok.', 403);
      c.run("UPDATE sifre_talepleri SET durum='iptal' WHERE id=? AND durum='bekliyor'", metin(g.id, 60, true));
      return {};
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
