// Platform: DC Sürücü Kursu'nu kullanan bütün kurs firmaları. (karar 1: birçok firmaya satılan ürün)
//  - Her firma ayrı veritabanı dosyasında durur: veri/firmalar/<firma kodu>.sqlite
//  - Firma kodu ekrana bir kez yazılır; tarayıcı hatırlar. Oturum çerezi firmaya özeldir.
//  - Lisans süresi biten ya da kapatılan firma giriş yapamaz; kayıtları silinmez.
//  - Platform yöneticisi (DC) firma açar, lisans uzatır. Firmaların içeriğini göremez.
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeVeritabani } from './db.mjs';
import { firmaAc, sifreKontrol, sifreOzet, sifreDogru } from './firma.mjs';
import { IsHatasi, fail, metin, gun, tamSayi, bugun } from './domain.mjs';
import { ornekFirmaDoldur } from './ornek.mjs';

const KOK = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ozet = (v) => createHash('sha256').update(v).digest('hex');
const simdi = () => new Date().toISOString();
export const KOD_KALIBI = /^[a-z0-9][a-z0-9-]{2,29}$/;

const PLATFORM_SEMA = `
CREATE TABLE IF NOT EXISTS firmalar(kod TEXT PRIMARY KEY, ad TEXT NOT NULL, yetkili TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
  eposta TEXT NOT NULL DEFAULT '', lisans_bitis TEXT NOT NULL, aktif INTEGER NOT NULL DEFAULT 1, max_sube INTEGER NOT NULL DEFAULT 1,
  notlar TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platform_kullanicilar(kullanici_adi TEXT PRIMARY KEY, sifre TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platform_oturumlar(anahtar TEXT PRIMARY KEY, kullanici TEXT NOT NULL, bitis INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_denemeler(anahtar TEXT PRIMARY KEY, sayi INTEGER NOT NULL, kilit_bitis INTEGER NOT NULL DEFAULT 0);
`;

export function platformAc({
  veriDizini = resolve(KOK, 'veri'),
  bellekte = false,
  demo = process.env.ENABLE_DEMO === '1',
  guvenliCerez = process.env.SECURE_COOKIE === '1',
  statikDizin = [resolve(KOK, 'istemci', 'dist'), resolve(KOK, 'public')].find((d) => existsSync(resolve(d, 'index.html'))),
  saatKaynagi = () => new Date(),
} = {}) {
  const pdb = nodeVeritabani(bellekte ? ':memory:' : resolve(veriDizini, 'platform.sqlite'));
  pdb.exec(PLATFORM_SEMA);
  const { q, q1, run } = pdb;
  const firmalar = new Map();

  function firmaMotoru(kod) {
    let f = firmalar.get(kod);
    if (!f) {
      const db = nodeVeritabani(bellekte ? ':memory:' : resolve(veriDizini, 'firmalar', `${kod}.sqlite`));
      f = firmaAc({ db, saatKaynagi, limit: () => ({ maxSube: q1('SELECT max_sube FROM firmalar WHERE kod=?', kod)?.max_sube ?? 1 }) });
      firmalar.set(kod, f);
    }
    return f;
  }
  function firmaBilgi(kod) {
    if (!kod || !KOD_KALIBI.test(kod)) return null;
    return q1('SELECT * FROM firmalar WHERE kod=?', kod) || null;
  }
  function lisansDurumu(f) {
    if (!f.aktif) return 'kapali';
    if (f.lisans_bitis < bugun(saatKaynagi())) return 'bitti';
    return 'acik';
  }

  // Platform yöneticisi ortam değişkeniyle ya da (yalnız bu bilgisayardan) ilk kurulumla oluşur.
  if (process.env.PLATFORM_KULLANICI && process.env.PLATFORM_SIFRE && !q1('SELECT 1 FROM platform_kullanicilar LIMIT 1'))
    run('INSERT INTO platform_kullanicilar VALUES(?,?,?)', process.env.PLATFORM_KULLANICI, sifreOzet(process.env.PLATFORM_SIFRE), simdi());

  function firmaOlustur(g) {
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
      firmaMotoru(kod).kurulum({ kurumAdi: ad, subeAdi: g.subeAdi || 'Merkez', ad: y.ad, kullaniciAdi: y.kullaniciAdi, sifre: y.sifre });
    } catch (e) {
      run('DELETE FROM firmalar WHERE kod=?', kod);
      firmalar.get(kod)?.kapat(); firmalar.delete(kod);
      throw e;
    }
    return kod;
  }

  if (demo) {
    if (!q1('SELECT 1 FROM platform_kullanicilar LIMIT 1')) run('INSERT INTO platform_kullanicilar VALUES(?,?,?)', 'dc', sifreOzet('Deneme123!'), simdi());
    if (!firmaBilgi('ornek')) {
      run("INSERT INTO firmalar(kod,ad,yetkili,telefon,eposta,lisans_bitis,aktif,max_sube,notlar,olusturma) VALUES('ornek','Örnek Sürücü Kursu','Ayşe Patron','','',?,1,5,'Deneme kurumu, uydurma veriler',?)",
        '2099-12-31', simdi());
      ornekFirmaDoldur(firmaMotoru('ornek').ctx);
    }
  }

  // -------------------------------------------------------------------------
  // PLATFORM YÖNETİMİ (DC)
  // -------------------------------------------------------------------------
  function platformOturum(anahtar) {
    if (!anahtar) return null;
    const o = q1('SELECT * FROM platform_oturumlar WHERE anahtar=?', ozet(anahtar));
    return o && o.bitis > Date.now() ? o : null;
  }
  function platformIstek({ yontem, yol, govde, cerezler, yerel }) {
    if (yol === '/api/platform/durum') return { durum: 200, veri: { kurulu: !!q1('SELECT 1 FROM platform_kullanicilar LIMIT 1'), yerel } };
    if (yol === '/api/platform/kurulum' && yontem === 'POST') {
      if (q1('SELECT 1 FROM platform_kullanicilar LIMIT 1')) fail('Kurulum yapılmış.', 403);
      if (!yerel) fail('İlk kurulum yalnız sunucunun kendi bilgisayarından yapılabilir.', 403);
      const kad = metin(govde.kullaniciAdi, 40, true, 'Kullanıcı adı');
      run('INSERT INTO platform_kullanicilar VALUES(?,?,?)', kad, sifreOzet(sifreKontrol(govde.sifre)), simdi());
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
    if (yol === '/api/platform/firmalar' && yontem === 'GET') {
      return { durum: 200, veri: { ben: ot.kullanici, bugun: bugun(saatKaynagi()), firmalar: q('SELECT * FROM firmalar ORDER BY ad').map((f) => ({ ...f, lisans: lisansDurumu(f) })) } };
    }
    if (yol === '/api/platform/firma-ac' && yontem === 'POST') return { durum: 200, veri: { tamam: true, kod: firmaOlustur(govde) } };
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

  // -------------------------------------------------------------------------
  // HTTP (Node)
  // -------------------------------------------------------------------------
  const TURLER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  const GUVENLIK = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self' https://www.paytr.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };
  const cerezYaz = ({ ad, deger, yas }) => `${ad}=${deger}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${yas}${guvenliCerez ? '; Secure' : ''}`;
  function cerezOku(req) {
    const c = {};
    for (const p of (req.headers.cookie || '').split(';')) {
      const i = p.indexOf('=');
      if (i > 0) c[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    }
    return c;
  }
  function json(res, durum, veri, basliklar = {}) {
    res.writeHead(durum, { ...GUVENLIK, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...basliklar });
    res.end(JSON.stringify(veri));
  }
  async function govdeOku(req) {
    let boy = 0; const parcalar = [];
    for await (const p of req) { boy += p.length; if (boy > 12_000_000) fail('İstek çok büyük.', 413); parcalar.push(p); }
    if (!boy) return {};
    const tur = req.headers['content-type'] || '';
    const ham = Buffer.concat(parcalar).toString('utf8');
    if (tur.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(ham));
    try { return JSON.parse(ham); } catch { fail('İstek okunamadı.'); }
  }
  function dosya(res, yol) {
    if (!statikDizin) { res.writeHead(404); return res.end('Ekran dosyaları bulunamadı. "npm run build" çalıştırın.'); }
    let temiz;
    try { temiz = decodeURIComponent(yol.split('?')[0]); } catch { temiz = '/'; }
    let hedef = resolve(statikDizin, '.' + (temiz === '/' ? '/index.html' : temiz));
    if (!hedef.startsWith(statikDizin + sep) || !existsSync(hedef) || !statSync(hedef).isFile()) hedef = resolve(statikDizin, 'index.html');
    const uzanti = extname(hedef);
    const kalici = hedef.includes(`${sep}assets${sep}`);
    res.writeHead(200, { ...GUVENLIK, 'Content-Type': TURLER[uzanti] || 'application/octet-stream', 'Cache-Control': kalici ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(readFileSync(hedef));
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://yerel');
    const yol = url.pathname;
    try {
      if (!yol.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') fail('Bulunamadı.', 404);
        return dosya(res, yol);
      }
      // Başka siteden gönderilen sahte istekleri engellemek için her yazma isteği bu başlığı taşımalı.
      // (Sanal POS bildirim adresi hariç: onu ödeme firması çağırır ve imzayla doğrulanır.)
      const posBildirim = yol.startsWith('/api/pos-bildirim/');
      if (req.method === 'POST' && !posBildirim && req.headers['x-dc'] !== '1') fail('Geçersiz istek.', 403);
      const cerezler = cerezOku(req);
      const yerel = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

      if (yol.startsWith('/api/platform/')) {
        const r = platformIstek({ yontem: req.method, yol, govde: req.method === 'POST' ? await govdeOku(req) : {}, cerezler, yerel });
        return json(res, r.durum, r.veri, r.cerez ? { 'Set-Cookie': cerezYaz(r.cerez) } : {});
      }

      // Firma: başlıktan, adres satırından ya da ödeme bildirim adresinden okunur.
      const kod = posBildirim ? yol.split('/')[3] : String(req.headers['x-firma'] || url.searchParams.get('firma') || '').toLocaleLowerCase('tr-TR');
      const f = firmaBilgi(kod);
      if (yol === '/api/firma' && req.method === 'GET') {
        if (!f) return json(res, 404, { hata: 'Bu kodla bir kurum bulunamadı.' });
        const d = firmaMotoru(f.kod).istek({ yontem: 'GET', yol: '/api/durum' });
        return json(res, 200, { kod: f.kod, ad: d.veri.kurum || f.ad, logo: d.veri.logo || '', lisans: lisansDurumu(f), demo: f.kod === 'ornek' && demo });
      }
      if (!f) fail('Kurum kodu bulunamadı. Giriş ekranından kurum kodunuzu yazın.', 404);
      const lisans = lisansDurumu(f);
      if (lisans !== 'acik' && !posBildirim) fail(lisans === 'bitti' ? 'Kurumunuzun kullanım süresi dolmuştur. Kayıtlarınız saklanıyor; uzatmak için DC ile görüşün.' : 'Kurumunuzun hesabı kapalıdır. DC ile görüşün.', 402);
      const motor = firmaMotoru(f.kod);
      const cerezAd = `dc_${f.kod.replace(/-/g, '_')}`;

      if (yol === '/api/canli' && req.method === 'GET') {
        const iptal = motor.abone(cerezler[cerezAd], (olay) => res.write(`event: degisti\ndata: ${JSON.stringify(olay)}\n\n`));
        if (!iptal) fail('Oturum kapalı.', 401);
        res.writeHead(200, { ...GUVENLIK, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(': baglandi\n\n');
        const nabiz = setInterval(() => res.write(': nabiz\n\n'), 25000);
        req.on('close', () => { clearInterval(nabiz); iptal(); });
        return;
      }
      const govde = req.method === 'POST' ? await govdeOku(req) : {};
      const r = motor.istek({ yontem: req.method, yol, sorgu: url.searchParams, oturum: cerezler[cerezAd], govde, firmaKodu: f.kod });
      const basliklar = {};
      if (r.oturum !== undefined) basliklar['Set-Cookie'] = cerezYaz({ ad: cerezAd, deger: r.oturum?.deger || '', yas: r.oturum?.yas || 0 });
      if (r.ham) { res.writeHead(r.durum, { ...GUVENLIK, 'Cache-Control': 'no-store', ...r.ham.basliklar }); return res.end(r.ham.govde); }
      return json(res, r.durum, r.veri, basliklar);
    } catch (e) {
      if (e instanceof IsHatasi) return json(res, e.durum, { hata: e.message });
      console.error(e);
      return json(res, 500, { hata: 'Beklenmeyen bir hata oldu. Tekrar deneyin.' });
    }
  }

  return {
    handler, firmaOlustur, firmaMotoru,
    kapat() { for (const f of firmalar.values()) f.kapat(); firmalar.clear(); pdb.kapat(); },
  };
}
