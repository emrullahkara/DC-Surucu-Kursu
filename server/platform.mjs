// Platform: DC Sürücü Kursu'nu kullanan bütün kurs firmaları. (karar 1: birçok firmaya satılan ürün)
//  - Her firma ayrı veritabanı dosyasında durur: veri/firmalar/<firma kodu>.sqlite
//  - Firma kodu ekrana bir kez yazılır; tarayıcı hatırlar. Oturum çerezi firmaya özeldir.
//  - Lisans süresi biten ya da kapatılan firma giriş yapamaz; kayıtları silinmez.
//  - Platform yöneticisi (DC) firma açar, lisans uzatır. Firmaların içeriğini göremez.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeVeritabani } from './db.mjs';
import { firmaAc } from './firma.mjs';
import { IsHatasi, fail } from './domain.mjs';
import { platformCekirdegi } from './platform-cekirdek.mjs';
import { ornekFirmaDoldur } from './ornek.mjs';

export { KOD_KALIBI } from './platform-cekirdek.mjs';
const KOK = resolve(fileURLToPath(new URL('..', import.meta.url)));
const simdi = () => new Date().toISOString();

export function platformAc({
  veriDizini = resolve(KOK, 'veri'),
  bellekte = false,
  demo = process.env.ENABLE_DEMO === '1',
  guvenliCerez = process.env.SECURE_COOKIE === '1',
  statikDizin = [resolve(KOK, 'istemci', 'dist'), resolve(KOK, 'public')].find((d) => existsSync(resolve(d, 'index.html'))),
  saatKaynagi = () => new Date(),
} = {}) {
  const pdb = nodeVeritabani(bellekte ? ':memory:' : resolve(veriDizini, 'platform.sqlite'));
  const firmalar = new Map();
  const { platformIstek, firmaBilgi, lisansDurumu, firmaOlustur, yoneticiEkle, yoneticiVar, q1, run } = platformCekirdegi({
    pdb, saatKaynagi,
    firmaKur: (kod, g) => firmaMotoru(kod).kurulum(g),
    firmaSil: (kod) => { firmalar.get(kod)?.kapat(); firmalar.delete(kod); },
  });

  function firmaMotoru(kod) {
    let f = firmalar.get(kod);
    if (!f) {
      const db = nodeVeritabani(bellekte ? ':memory:' : resolve(veriDizini, 'firmalar', `${kod}.sqlite`));
      f = firmaAc({ db, saatKaynagi, posDeneme: demo || process.env.POS_DENEME === '1', limit: () => ({ maxSube: q1('SELECT max_sube FROM firmalar WHERE kod=?', kod)?.max_sube ?? 1 }) });
      firmalar.set(kod, f);
    }
    return f;
  }

  // Platform yöneticisi ortam değişkeniyle ya da (yalnız bu bilgisayardan) ilk kurulumla oluşur.
  if (process.env.PLATFORM_KULLANICI && process.env.PLATFORM_SIFRE && !yoneticiVar()) yoneticiEkle(process.env.PLATFORM_KULLANICI, process.env.PLATFORM_SIFRE);
  if (demo) {
    if (!yoneticiVar()) yoneticiEkle('dc', 'Deneme123!');
    if (!firmaBilgi('ornek')) {
      run("INSERT INTO firmalar(kod,ad,yetkili,telefon,eposta,lisans_bitis,aktif,max_sube,notlar,olusturma) VALUES('ornek','Örnek Sürücü Kursu','Ayşe Patron','','',?,1,5,'Deneme kurumu, uydurma veriler',?)",
        '2099-12-31', simdi());
      ornekFirmaDoldur(firmaMotoru('ornek').ctx);
    }
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
        const r = await platformIstek({ yontem: req.method, yol, govde: req.method === 'POST' ? await govdeOku(req) : {}, cerezler, yerel });
        return json(res, r.durum, r.veri, r.cerez ? { 'Set-Cookie': cerezYaz(r.cerez) } : {});
      }

      // Firma: başlıktan, adres satırından ya da ödeme bildirim adresinden okunur.
      const kod = posBildirim ? yol.split('/')[3] : String(req.headers['x-firma'] || url.searchParams.get('firma') || '').toLocaleLowerCase('tr-TR');
      const f = firmaBilgi(kod);
      if (yol === '/api/firma' && req.method === 'GET') {
        if (!f) return json(res, 404, { hata: 'Bu kodla bir kurum bulunamadı.' });
        const d = await firmaMotoru(f.kod).istek({ yontem: 'GET', yol: '/api/durum' });
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
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '');
      const koken = process.env.GENEL_ADRES || `${guvenliCerez ? 'https' : 'http'}://${req.headers.host}`;
      const r = await motor.istek({ yontem: req.method, yol: posBildirim ? '/api/pos-bildirim' : yol, sorgu: url.searchParams, oturum: cerezler[cerezAd], govde, firmaKodu: f.kod, ip, koken, saglayici: posBildirim ? yol.split('/')[4] : '' });
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
