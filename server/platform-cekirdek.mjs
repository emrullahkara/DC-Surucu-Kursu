// Platform çekirdeği: firma listesi, lisans ve DC platform yönetimi. Sunucudan bağımsızdır;
// hem bilgisayardaki sunucu (platform.mjs) hem bulut sürümü (cloudflare/worker.mjs) bunu kullanır.
import { randomBytes, createHash } from 'node:crypto';
import { sifreKontrol, sifreOzet, sifreDogru } from './firma.mjs';
import { fail, metin, gun, tamSayi, bugun } from './domain.mjs';

const ozet = (v) => createHash('sha256').update(v).digest('hex');
const simdi = () => new Date().toISOString();
export const KOD_KALIBI = /^[a-z0-9][a-z0-9-]{2,29}$/;

export const PLATFORM_SEMA = `
CREATE TABLE IF NOT EXISTS firmalar(kod TEXT PRIMARY KEY, ad TEXT NOT NULL, yetkili TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
  eposta TEXT NOT NULL DEFAULT '', lisans_bitis TEXT NOT NULL, aktif INTEGER NOT NULL DEFAULT 1, max_sube INTEGER NOT NULL DEFAULT 1,
  notlar TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platform_kullanicilar(kullanici_adi TEXT PRIMARY KEY, sifre TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platform_oturumlar(anahtar TEXT PRIMARY KEY, kullanici TEXT NOT NULL, bitis INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_denemeler(anahtar TEXT PRIMARY KEY, sayi INTEGER NOT NULL, kilit_bitis INTEGER NOT NULL DEFAULT 0);
`;

// firmaKur(kod, bilgi): yeni firmanın kendi veritabanında kurum, merkez şube ve ilk yöneticiyi oluşturur (async olabilir).
// firmaSil(kod): kurulum yarıda kalırsa firmayı kapatır.
export function platformCekirdegi({ pdb, saatKaynagi = () => new Date(), firmaKur, firmaSil = () => {} }) {
  pdb.exec(PLATFORM_SEMA);
  const { q, q1, run } = pdb;

  function firmaBilgi(kod) {
    if (!kod || !KOD_KALIBI.test(kod)) return null;
    return q1('SELECT * FROM firmalar WHERE kod=?', kod) || null;
  }
  function lisansDurumu(f) {
    if (!f.aktif) return 'kapali';
    if (f.lisans_bitis < bugun(saatKaynagi())) return 'bitti';
    return 'acik';
  }
  function yoneticiEkle(kad, sifre) {
    run('INSERT INTO platform_kullanicilar VALUES(?,?,?)', kad, sifreOzet(sifre), simdi());
  }
  const yoneticiVar = () => !!q1('SELECT 1 FROM platform_kullanicilar LIMIT 1');

  async function firmaOlustur(g) {
    const kod = metin(g.kod, 30, true, 'Firma kodu').toLocaleLowerCase('tr-TR');
    if (!KOD_KALIBI.test(kod)) fail('Firma kodu en az 3 karakter olmalı; küçük harf, rakam ve tire kullanılabilir (Türkçe harf yok).');
    if (q1('SELECT 1 FROM firmalar WHERE kod=?', kod)) fail('Bu firma kodu kullanılıyor.');
    const ad = metin(g.ad, 120, true, 'Kurum adı');
    const lisans = gun(g.lisansBitis, 'Lisans bitiş tarihi');
    const maxSube = tamSayi(g.maxSube || 1, 1, 100, 'Şube sayısı');
    const y = g.yonetici || {};
    sifreKontrol(y.sifre);
    run('INSERT INTO firmalar(kod,ad,yetkili,telefon,eposta,lisans_bitis,aktif,max_sube,notlar,olusturma) VALUES(?,?,?,?,?,?,1,?,?,?)',
      kod, ad, metin(g.yetkili, 80), metin(g.telefon, 30), metin(g.eposta, 120), lisans, maxSube, metin(g.notlar, 500), simdi());
    try {
      await firmaKur(kod, { kurumAdi: ad, subeAdi: g.subeAdi || 'Merkez', ad: y.ad, kullaniciAdi: y.kullaniciAdi, sifre: y.sifre });
    } catch (e) {
      run('DELETE FROM firmalar WHERE kod=?', kod);
      await firmaSil(kod);
      throw e;
    }
    return kod;
  }

  function platformOturum(anahtar) {
    if (!anahtar) return null;
    const o = q1('SELECT * FROM platform_oturumlar WHERE anahtar=?', ozet(anahtar));
    return o && o.bitis > Date.now() ? o : null;
  }
  // Dönüş: {durum, veri, cerez?: {ad, deger, yas}}
  async function platformIstek({ yontem, yol, govde = {}, cerezler = {}, yerel = false }) {
    if (yol === '/api/platform/durum') return { durum: 200, veri: { kurulu: yoneticiVar(), yerel } };
    if (yol === '/api/platform/kurulum' && yontem === 'POST') {
      if (yoneticiVar()) fail('Kurulum yapılmış.', 403);
      if (!yerel) fail('İlk kurulum yalnız sunucunun kendi bilgisayarından yapılabilir.', 403);
      yoneticiEkle(metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı'), sifreKontrol(govde.sifre));
      return { durum: 200, veri: { tamam: true } };
    }
    if (yol === '/api/platform/giris' && yontem === 'POST') {
      const kad = metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı');
      const d = q1('SELECT * FROM platform_denemeler WHERE anahtar=?', kad);
      if (d && d.kilit_bitis > Date.now()) fail('Çok fazla hatalı deneme. Biraz sonra tekrar deneyin.', 429);
      const u = q1('SELECT * FROM platform_kullanicilar WHERE kullanici_adi=?', kad);
      if (!u || !sifreDogru(govde.sifre, u.sifre)) {
        const sayi = (d && d.kilit_bitis === 0 ? d.sayi : 0) + 1;
        run('INSERT INTO platform_denemeler VALUES(?,?,?) ON CONFLICT(anahtar) DO UPDATE SET sayi=excluded.sayi, kilit_bitis=excluded.kilit_bitis', kad, sayi >= 5 ? 0 : sayi, sayi >= 5 ? Date.now() + 15 * 60000 : 0);
        fail('Kullanıcı adı veya şifre hatalı.', 401);
      }
      run('DELETE FROM platform_denemeler WHERE anahtar=?', kad);
      const anahtar = randomBytes(32).toString('base64url');
      run('INSERT INTO platform_oturumlar VALUES(?,?,?)', ozet(anahtar), kad, Date.now() + 8 * 3600000);
      return { durum: 200, veri: { tamam: true }, cerez: { ad: 'dc_platform', deger: anahtar, yas: 8 * 3600 } };
    }
    const ot = platformOturum(cerezler.dc_platform);
    if (yol === '/api/platform/cikis' && yontem === 'POST') {
      if (ot) run('DELETE FROM platform_oturumlar WHERE anahtar=?', ot.anahtar);
      return { durum: 200, veri: { tamam: true }, cerez: { ad: 'dc_platform', deger: '', yas: 0 } };
    }
    if (!ot) fail('Oturum kapalı.', 401);
    if (yol === '/api/platform/firmalar' && yontem === 'GET')
      return { durum: 200, veri: { ben: ot.kullanici, bugun: bugun(saatKaynagi()), firmalar: q('SELECT * FROM firmalar ORDER BY ad').map((f) => ({ ...f, lisans: lisansDurumu(f) })) } };
    if (yol === '/api/platform/firma-ac' && yontem === 'POST') return { durum: 200, veri: { tamam: true, kod: await firmaOlustur(govde) } };
    if (yol === '/api/platform/firma-duzenle' && yontem === 'POST') {
      const f = firmaBilgi(String(govde.kod || ''));
      if (!f) fail('Firma bulunamadı.', 404);
      run('UPDATE firmalar SET ad=?,yetkili=?,telefon=?,eposta=?,lisans_bitis=?,aktif=?,max_sube=?,notlar=? WHERE kod=?',
        metin(govde.ad ?? f.ad, 120, true, 'Kurum adı'), metin(govde.yetkili ?? f.yetkili, 80), metin(govde.telefon ?? f.telefon, 30), metin(govde.eposta ?? f.eposta, 120),
        gun(govde.lisansBitis ?? f.lisans_bitis, 'Lisans bitiş'), govde.aktif === undefined ? f.aktif : govde.aktif ? 1 : 0,
        tamSayi(govde.maxSube ?? f.max_sube, 1, 100, 'Şube sayısı'), metin(govde.notlar ?? f.notlar, 500), f.kod);
      return { durum: 200, veri: { tamam: true } };
    }
    fail('Bulunamadı.', 404);
  }

  return { platformIstek, firmaBilgi, lisansDurumu, firmaOlustur, yoneticiEkle, yoneticiVar, q, q1, run };
}
