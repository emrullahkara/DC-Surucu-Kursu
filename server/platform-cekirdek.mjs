// Platform çekirdeği: firma listesi, lisans ve DC platform yönetimi. Sunucudan bağımsızdır;
// hem bilgisayardaki sunucu (platform.mjs) hem bulut sürümü (cloudflare/worker.mjs) bunu kullanır.
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { sifreKontrol, sifreOzet, sifreDogru } from './firma.mjs';
import { fail, metin, gun, tamSayi, kurus, bugun } from './domain.mjs';
import { sutunEkle } from './db-ortak.mjs';
import { b32Kodla, totpDogrula } from './moduller/guvenlik.mjs';

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
CREATE TABLE IF NOT EXISTS lisans_odemeleri(id TEXT PRIMARY KEY, kod TEXT NOT NULL REFERENCES firmalar(kod), tarih TEXT NOT NULL, tutar INTEGER NOT NULL,
  donem_bas TEXT NOT NULL DEFAULT '', donem_bit TEXT NOT NULL DEFAULT '', fatura_no TEXT NOT NULL DEFAULT '', aciklama TEXT NOT NULL DEFAULT '',
  kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL, iptal INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS platform_olaylar(id INTEGER PRIMARY KEY AUTOINCREMENT, zaman TEXT NOT NULL, kullanici TEXT NOT NULL, metin TEXT NOT NULL);
`;

// firmaKur(kod, bilgi): yeni firmanın kendi veritabanında kurum, merkez şube ve ilk yöneticiyi oluşturur (async olabilir).
// firmaSil(kod): kurulum yarıda kalırsa firmayı kapatır.
// Yedek ve kullanım işlevleri sunucuya göre değişir (bilgisayarda dosya kopyası, bulutta zamanda geri dönüş):
//  firmaOzet(kod) -> {ogrenci, aktifOgrenci, personel, ...}   yedekler(kod) -> [{ad, zaman, boyut}]
//  yedekAl(kod) -> {ad}   yedekDon(kod, {ad | zaman}) -> {tamam}
export function platformCekirdegi({ pdb, saatKaynagi = () => new Date(), firmaKur, firmaSil = () => {}, firmaOzet = null, yedekler = null, yedekAl = null, yedekDon = null, yoneticiKodu = null }) {
  pdb.exec(PLATFORM_SEMA);
  // Sonradan eklenen sütunlar: kullanıcı sınırı (0 = sınırsız), yıllık ücret, platform girişinde ek doğrulama.
  sutunEkle(pdb, 'firmalar', 'max_kullanici', 'INTEGER NOT NULL DEFAULT 0');
  sutunEkle(pdb, 'firmalar', 'yillik_ucret', 'INTEGER NOT NULL DEFAULT 0');
  sutunEkle(pdb, 'platform_kullanicilar', 'totp_gizli', 'TEXT');
  sutunEkle(pdb, 'platform_kullanicilar', 'totp_bekleyen', 'TEXT');
  sutunEkle(pdb, 'platform_kullanicilar', 'totp_son_adim', 'INTEGER');
  const { q, q1, run } = pdb;
  const kayit = (kim, yazi) => run('INSERT INTO platform_olaylar(zaman,kullanici,metin) VALUES(?,?,?)', simdi(), kim, yazi);

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
    run('INSERT INTO platform_kullanicilar(kullanici_adi,sifre,olusturma) VALUES(?,?,?)', kad, sifreOzet(sifre), simdi());
  }
  const yoneticiVar = () => !!q1('SELECT 1 FROM platform_kullanicilar LIMIT 1');

  async function firmaOlustur(g) {
    const kod = metin(g.kod, 30, true, 'Firma kodu').toLocaleLowerCase('tr-TR');
    if (!KOD_KALIBI.test(kod)) fail('Firma kodu en az 3 karakter olmalı; küçük harf, rakam ve tire kullanılabilir (Türkçe harf yok).');
    if (q1('SELECT 1 FROM firmalar WHERE kod=?', kod)) fail('Bu firma kodu kullanılıyor.');
    const ad = metin(g.ad, 120, true, 'Kurum adı');
    const lisans = gun(g.lisansBitis, 'Lisans bitiş tarihi');
    const maxSube = tamSayi(g.maxSube || 1, 1, 100, 'Şube sayısı');
    const maxKullanici = tamSayi(g.maxKullanici || 0, 0, 10000, 'Kullanıcı sınırı');
    const y = g.yonetici || {};
    sifreKontrol(y.sifre);
    run('INSERT INTO firmalar(kod,ad,yetkili,telefon,eposta,lisans_bitis,aktif,max_sube,notlar,olusturma,max_kullanici,yillik_ucret) VALUES(?,?,?,?,?,?,1,?,?,?,?,?)',
      kod, ad, metin(g.yetkili, 80), metin(g.telefon, 30), metin(g.eposta, 120), lisans, maxSube, metin(g.notlar, 500), simdi(), maxKullanici, kurus(g.yillikUcret ?? 0, 'Yıllık ücret'));
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
  // Hatalı giriş: kullanıcı adı başına 5, yer (IP) başına 20 hatada 15 dakika kilit.
  function denemeKontrol(anahtarlar) {
    for (const [a] of anahtarlar) {
      const d = q1('SELECT * FROM platform_denemeler WHERE anahtar=?', a);
      if (d && d.kilit_bitis > Date.now()) fail('Çok fazla hatalı deneme. Biraz sonra tekrar deneyin.', 429);
    }
  }
  function hataliDeneme(anahtarlar) {
    for (const [a, sinir] of anahtarlar) {
      const d = q1('SELECT * FROM platform_denemeler WHERE anahtar=?', a);
      const sayi = (d && d.kilit_bitis === 0 ? d.sayi : 0) + 1;
      run('INSERT INTO platform_denemeler VALUES(?,?,?) ON CONFLICT(anahtar) DO UPDATE SET sayi=excluded.sayi, kilit_bitis=excluded.kilit_bitis', a, sayi >= sinir ? 0 : sayi, sayi >= sinir ? Date.now() + 15 * 60000 : 0);
    }
  }
  const firmaListesi = () => q('SELECT * FROM firmalar ORDER BY ad').map((f) => ({ ...f, lisans: lisansDurumu(f),
    odenen: q1('SELECT COALESCE(SUM(tutar),0) t FROM lisans_odemeleri WHERE kod=? AND iptal=0', f.kod).t,
    sonOdeme: q1('SELECT MAX(tarih) t FROM lisans_odemeleri WHERE kod=? AND iptal=0', f.kod).t || '' }));

  // Dönüş: {durum, veri, cerez?: {ad, deger, yas}, ham?}
  async function platformIstek({ yontem, yol, govde = {}, cerezler = {}, yerel = false, ip = '', sorgu = new URLSearchParams() }) {
    if (yol === '/api/platform/durum') return { durum: 200, veri: { kurulu: yoneticiVar(), yerel } };
    if (yol === '/api/platform/kurulum' && yontem === 'POST') {
      if (yoneticiVar()) fail('Kurulum yapılmış.', 403);
      if (!yerel) fail('İlk kurulum yalnız sunucunun kendi bilgisayarından yapılabilir.', 403);
      yoneticiEkle(metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı'), sifreKontrol(govde.sifre));
      return { durum: 200, veri: { tamam: true } };
    }
    if (yol === '/api/platform/giris' && yontem === 'POST') {
      const kad = metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı');
      const anahtarlar = [[kad, 5], ...(ip ? [[`ip:${ip}`, 20]] : [])];
      denemeKontrol(anahtarlar);
      const u = q1('SELECT * FROM platform_kullanicilar WHERE kullanici_adi=?', kad);
      if (!u || !sifreDogru(govde.sifre, u.sifre)) { hataliDeneme(anahtarlar); fail('Kullanıcı adı veya şifre hatalı.', 401); }
      // Ek doğrulama kodu açıksa şifreden sonra istenir.
      if (u.totp_gizli) {
        if (!govde.kod) return { durum: 200, veri: { kodGerekli: true } };
        const adim = totpDogrula(u.totp_gizli, govde.kod, saatKaynagi().getTime(), u.totp_son_adim || 0);
        if (!adim) { hataliDeneme(anahtarlar); fail('Doğrulama kodu hatalı.', 401); }
        run('UPDATE platform_kullanicilar SET totp_son_adim=? WHERE kullanici_adi=?', adim, kad);
      }
      run('DELETE FROM platform_denemeler WHERE anahtar=?', kad);
      const anahtar = randomBytes(32).toString('base64url');
      run('INSERT INTO platform_oturumlar VALUES(?,?,?)', ozet(anahtar), kad, Date.now() + 8 * 3600000);
      kayit(kad, `Giriş yapıldı${ip ? ` (${ip})` : ''}`);
      return { durum: 200, veri: { tamam: true }, cerez: { ad: 'dc_platform', deger: anahtar, yas: 8 * 3600 } };
    }
    const ot = platformOturum(cerezler.dc_platform);
    if (yol === '/api/platform/cikis' && yontem === 'POST') {
      if (ot) run('DELETE FROM platform_oturumlar WHERE anahtar=?', ot.anahtar);
      return { durum: 200, veri: { tamam: true }, cerez: { ad: 'dc_platform', deger: '', yas: 0 } };
    }
    if (!ot) fail('Oturum kapalı.', 401);
    const ben = q1('SELECT * FROM platform_kullanicilar WHERE kullanici_adi=?', ot.kullanici);
    if (yol === '/api/platform/firmalar' && yontem === 'GET')
      return { durum: 200, veri: { ben: ot.kullanici, totp: !!ben?.totp_gizli, bugun: bugun(saatKaynagi()), firmalar: firmaListesi(), yedekTuru: yedekler ? 'dosya' : yedekDon ? 'zaman' : '' } };
    if (yol === '/api/platform/firma-ac' && yontem === 'POST') {
      const kod = await firmaOlustur(govde);
      kayit(ot.kullanici, `Firma açıldı: ${kod}`);
      return { durum: 200, veri: { tamam: true, kod } };
    }
    const firmaGerek = () => { const f = firmaBilgi(String(govde.kod || sorgu.get('kod') || '')); if (!f) fail('Firma bulunamadı.', 404); return f; };
    if (yol === '/api/platform/firma-duzenle' && yontem === 'POST') {
      const f = firmaGerek();
      run('UPDATE firmalar SET ad=?,yetkili=?,telefon=?,eposta=?,lisans_bitis=?,aktif=?,max_sube=?,notlar=?,max_kullanici=?,yillik_ucret=? WHERE kod=?',
        metin(govde.ad ?? f.ad, 120, true, 'Kurum adı'), metin(govde.yetkili ?? f.yetkili, 80), metin(govde.telefon ?? f.telefon, 30), metin(govde.eposta ?? f.eposta, 120),
        gun(govde.lisansBitis ?? f.lisans_bitis, 'Lisans bitiş'), govde.aktif === undefined ? f.aktif : govde.aktif ? 1 : 0,
        tamSayi(govde.maxSube ?? f.max_sube, 1, 100, 'Şube sayısı'), metin(govde.notlar ?? f.notlar, 500),
        tamSayi(govde.maxKullanici ?? f.max_kullanici, 0, 10000, 'Kullanıcı sınırı'), kurus(govde.yillikUcret ?? f.yillik_ucret, 'Yıllık ücret'), f.kod);
      kayit(ot.kullanici, `Firma güncellendi: ${f.kod}${govde.lisansBitis && govde.lisansBitis !== f.lisans_bitis ? ` (lisans ${govde.lisansBitis})` : ''}`);
      return { durum: 200, veri: { tamam: true } };
    }
    // Lisans ödemeleri ve fatura takibi. İstenirse lisans bitiş tarihi ödemenin dönem sonuna uzatılır.
    if (yol === '/api/platform/lisans-odemeleri' && yontem === 'GET') {
      const f = firmaGerek();
      return { durum: 200, veri: { odemeler: q('SELECT * FROM lisans_odemeleri WHERE kod=? ORDER BY tarih DESC', f.kod) } };
    }
    if (yol === '/api/platform/lisans-odeme' && yontem === 'POST') {
      const f = firmaGerek();
      if (govde.iptalId) {
        run('UPDATE lisans_odemeleri SET iptal=1 WHERE id=? AND kod=?', String(govde.iptalId), f.kod);
        kayit(ot.kullanici, `Lisans ödemesi iptal edildi: ${f.kod}`);
        return { durum: 200, veri: { tamam: true } };
      }
      const tutar = kurus(govde.tutar, 'Tutar', false);
      const bas = gun(govde.donemBas, 'Dönem başı', false), bit = gun(govde.donemBit, 'Dönem sonu', false);
      if (bas && bit && bas > bit) fail('Dönem başı sonundan sonra olamaz.');
      run('INSERT INTO lisans_odemeleri(id,kod,tarih,tutar,donem_bas,donem_bit,fatura_no,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?)',
        randomUUID(), f.kod, gun(govde.tarih || bugun(saatKaynagi()), 'Tarih'), tutar, bas, bit, metin(govde.faturaNo, 40), metin(govde.aciklama, 200), ot.kullanici, simdi());
      if (govde.lisansUzat && bit && bit > f.lisans_bitis) run('UPDATE firmalar SET lisans_bitis=? WHERE kod=?', bit, f.kod);
      kayit(ot.kullanici, `Lisans ödemesi: ${f.kod} ${(tutar / 100).toFixed(2)} TL${govde.lisansUzat && bit ? ` · lisans ${bit} tarihine uzatıldı` : ''}`);
      return { durum: 200, veri: { tamam: true } };
    }
    // Kullanım özeti: hangi firma ne kadar kullanıyor (içerik değil, yalnız sayılar).
    if (yol === '/api/platform/kullanim' && yontem === 'GET') {
      if (!firmaOzet) return { durum: 200, veri: { firmalar: [] } };
      const l = [];
      for (const f of q('SELECT kod, ad FROM firmalar ORDER BY ad')) {
        try { l.push({ kod: f.kod, ad: f.ad, ...(await firmaOzet(f.kod)) }); } catch (e) { l.push({ kod: f.kod, ad: f.ad, hata: String(e.message || e) }); }
      }
      return { durum: 200, veri: { firmalar: l } };
    }
    // Yedekler: bilgisayarda günlük dosya kopyası, bulutta son 30 gün içinde istenen ana dönüş.
    if (yol === '/api/platform/yedekler' && yontem === 'GET') {
      const f = firmaGerek();
      return { durum: 200, veri: { yedekler: yedekler ? await yedekler(f.kod) : [], tur: yedekler ? 'dosya' : yedekDon ? 'zaman' : '' } };
    }
    if (yol === '/api/platform/yedek-al' && yontem === 'POST') {
      const f = firmaGerek();
      if (!yedekAl) fail('Bu sunucuda elle yedek alınmaz; bulut kendi yedeğini tutar.');
      const r = await yedekAl(f.kod, 'elle');
      kayit(ot.kullanici, `Yedek alındı: ${f.kod} (${r.ad})`);
      return { durum: 200, veri: { tamam: true, ...r } };
    }
    if (yol === '/api/platform/yedek-don' && yontem === 'POST') {
      const f = firmaGerek();
      if (!yedekDon) fail('Bu sunucuda yedekten dönüş yok.');
      if (metin(govde.onay, 20) !== f.kod) fail('Onay için firma kodunu yazın.');
      const r = await yedekDon(f.kod, { ad: govde.ad ? metin(govde.ad, 120) : '', zaman: govde.zaman ? metin(govde.zaman, 40) : '' });
      kayit(ot.kullanici, `YEDEKTEN DÖNÜLDÜ: ${f.kod} → ${govde.ad || govde.zaman}`);
      return { durum: 200, veri: { tamam: true, ...r } };
    }
    // Kurumun (tek) yöneticisi şifresini unuttuğunda: kimliği telefonla doğrulandıktan sonra tek kullanımlık kod.
    if (yol === '/api/platform/yonetici-kodu' && yontem === 'POST') {
      const f = firmaGerek();
      if (!yoneticiKodu) fail('Bu sunucuda kullanılamaz.');
      const r = await yoneticiKodu(f.kod, metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı'), `DC (${ot.kullanici})`);
      kayit(ot.kullanici, `Şifre sıfırlama kodu üretildi: ${f.kod} / ${govde.kullaniciAdi}`);
      return { durum: 200, veri: { tamam: true, ...r } };
    }
    if (yol === '/api/platform/kayitlar' && yontem === 'GET')
      return { durum: 200, veri: { kayitlar: q('SELECT * FROM platform_olaylar ORDER BY id DESC LIMIT 300') } };
    // Platform girişine ek doğrulama kodu (Authenticator).
    if (yol === '/api/platform/totp-baslat' && yontem === 'POST') {
      if (ben.totp_gizli) fail('Ek doğrulama zaten açık.');
      const gizli = b32Kodla(randomBytes(20));
      run('UPDATE platform_kullanicilar SET totp_bekleyen=? WHERE kullanici_adi=?', gizli, ben.kullanici_adi);
      return { durum: 200, veri: { gizli, uri: `otpauth://totp/${encodeURIComponent('DC Platform:' + ben.kullanici_adi)}?secret=${gizli}&issuer=${encodeURIComponent('DC Platform')}&algorithm=SHA1&digits=6&period=30` } };
    }
    if (yol === '/api/platform/totp-ac' && yontem === 'POST') {
      if (!ben.totp_bekleyen) fail('Önce kurulumu başlatın.');
      const adim = totpDogrula(ben.totp_bekleyen, govde.kod, saatKaynagi().getTime());
      if (!adim) fail('Kod doğru değil.');
      run('UPDATE platform_kullanicilar SET totp_gizli=totp_bekleyen, totp_bekleyen=NULL, totp_son_adim=? WHERE kullanici_adi=?', adim, ben.kullanici_adi);
      kayit(ot.kullanici, 'Ek doğrulama kodu açıldı');
      return { durum: 200, veri: { tamam: true } };
    }
    if (yol === '/api/platform/totp-kapat' && yontem === 'POST') {
      if (!ben.totp_gizli) fail('Ek doğrulama kapalı.');
      if (!sifreDogru(govde.sifre, ben.sifre) || !totpDogrula(ben.totp_gizli, govde.kod, saatKaynagi().getTime(), ben.totp_son_adim || 0)) fail('Şifre ya da kod yanlış.');
      run('UPDATE platform_kullanicilar SET totp_gizli=NULL, totp_bekleyen=NULL, totp_son_adim=NULL WHERE kullanici_adi=?', ben.kullanici_adi);
      kayit(ot.kullanici, 'Ek doğrulama kodu kapatıldı');
      return { durum: 200, veri: { tamam: true } };
    }
    if (yol === '/api/platform/sifre' && yontem === 'POST') {
      if (!sifreDogru(govde.eskiSifre, ben.sifre)) fail('Mevcut şifre yanlış.');
      run('UPDATE platform_kullanicilar SET sifre=? WHERE kullanici_adi=?', sifreOzet(sifreKontrol(govde.yeniSifre)), ben.kullanici_adi);
      kayit(ot.kullanici, 'Şifre değiştirildi');
      return { durum: 200, veri: { tamam: true } };
    }
    fail('Bulunamadı.', 404);
  }

  return { platformIstek, firmaBilgi, lisansDurumu, firmaOlustur, yoneticiEkle, yoneticiVar, q, q1, run };
}
