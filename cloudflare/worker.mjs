// DC Sürücü Kursu · bulut sürümü (Cloudflare Workers + Durable Objects).
//
// DİKKAT: Bu dosya yalnız yayına HAZIRLIKTIR. Yayın Emrullah KARA'nın onayıyla ve ayrı deneme adıyla yapılır
// (bkz. docs/YAYIN.md). Mağaza Takip'in canlı sürümüne dokunulmaz.
//
// Yapı:
//  - PlatformDO (tek): firma listesi, lisanslar, DC platform yönetimi.
//  - FirmaDO (her kurs firması için ayrı): o firmanın bütün kayıtları. Firmalar birbirinin verisini göremez.
//  - İş kuralları bilgisayardaki sunucuyla AYNI dosyalardır (server/firma.mjs, server/moduller/*).
import { DurableObject } from 'cloudflare:workers';
import { firmaAc } from '../server/firma.mjs';
import { platformCekirdegi } from '../server/platform-cekirdek.mjs';
import { ornekFirmaDoldur } from '../server/ornek.mjs';
import { IsHatasi } from '../server/domain.mjs';
import { anahtarCoz } from '../server/sifreleme.mjs';

// ---------------------------------------------------------------------------
// Durable Object SQLite ara katmanı: server/db.mjs ile aynı dört işlev.
// ---------------------------------------------------------------------------
function doVeritabani(storage) {
  const sql = storage.sql;
  const baglama = (p) => p.map((x) => (x === undefined ? null : x instanceof Uint8Array ? x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) : typeof x === 'boolean' ? Number(x) : x));
  let derinlik = 0;
  return {
    q: (s, ...p) => sql.exec(s, ...baglama(p)).toArray(),
    q1: (s, ...p) => sql.exec(s, ...baglama(p)).toArray()[0],
    run(s, ...p) {
      const c = sql.exec(s, ...baglama(p));
      c.toArray();
      return { changes: c.rowsWritten, lastInsertRowid: sql.exec('SELECT last_insert_rowid() AS id').one().id };
    },
    // Birden çok komutu tek tek çalıştırır (şema dosyaları).
    exec(s) { for (const t of s.split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean)) sql.exec(t); },
    islemde(fn) {
      if (derinlik > 0) return fn();
      derinlik++;
      try { return storage.transactionSync(fn); } finally { derinlik--; }
    },
  };
}

const GUVENLIK = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self' https://www.paytr.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
const json = (durum, veri, basliklar = {}) => new Response(JSON.stringify(veri), { status: durum, headers: { ...GUVENLIK, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...basliklar } });
const cerezYaz = ({ ad, deger, yas }) => `${ad}=${deger}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${yas}; Secure`;
function cerezOku(req) {
  const c = {};
  for (const p of (req.headers.get('cookie') || '').split(';')) { const i = p.indexOf('='); if (i > 0) c[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
  return c;
}
async function govdeOku(req) {
  if (req.method !== 'POST') return {};
  const ham = await req.text();
  if (ham.length > 12_000_000) throw new IsHatasi('İstek çok büyük.', 413);
  if (!ham) return {};
  if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(ham));
  try { return JSON.parse(ham); } catch { throw new IsHatasi('İstek okunamadı.', 400); }
}
const hataYaniti = (e) => (e instanceof IsHatasi ? json(e.durum, { hata: e.message }) : (console.error(e), json(500, { hata: 'Beklenmeyen bir hata oldu. Tekrar deneyin.' })));

// ---------------------------------------------------------------------------
// PLATFORM
// ---------------------------------------------------------------------------
export class PlatformDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    const ic = async (kod, yol, govde) => {
      const r = await firmaStub(env, kod).fetch(`https://ic/ic/${yol}`, govde === undefined ? {} : { method: 'POST', body: JSON.stringify(govde) });
      const j = await r.json();
      if (!r.ok) throw new IsHatasi(j.hata || 'İşlem yapılamadı.', r.status);
      return j;
    };
    this.p = platformCekirdegi({
      pdb: doVeritabani(ctx.storage),
      firmaKur: (kod, g) => ic(kod, 'kurulum', g),
      firmaOzet: (kod) => ic(kod, 'ozet'),
      // Bulutta dosya yedeği yoktur: Durable Object son 30 gün içindeki herhangi bir ana geri döndürülebilir.
      yedekDon: (kod, { zaman }) => ic(kod, 'geri-don', { zaman }),
      yoneticiKodu: (kod, kullaniciAdi, veren) => ic(kod, 'yonetici-kodu', { kullaniciAdi, veren }),
    });
    this.hazir = ctx.blockConcurrencyWhile(async () => {
      if (env.PLATFORM_KULLANICI && env.PLATFORM_SIFRE && !this.p.yoneticiVar()) this.p.yoneticiEkle(env.PLATFORM_KULLANICI, env.PLATFORM_SIFRE);
      if (env.ENABLE_DEMO === '1') {
        if (!this.p.yoneticiVar()) this.p.yoneticiEkle('dc', 'Deneme123!');
        if (!this.p.firmaBilgi('ornek')) {
          this.p.run("INSERT INTO firmalar(kod,ad,yetkili,telefon,eposta,lisans_bitis,aktif,max_sube,notlar,olusturma) VALUES('ornek','Örnek Sürücü Kursu','Ayşe Patron','','','2099-12-31',1,5,'Deneme kurumu, uydurma veriler',?)", new Date().toISOString());
          await firmaStub(env, 'ornek').fetch('https://ic/ic/ornek', { method: 'POST' });
        }
      }
    });
  }
  async fetch(req) {
    await this.hazir;
    const url = new URL(req.url);
    try {
      if (url.pathname === '/ic/firma') {
        const f = this.p.firmaBilgi(url.searchParams.get('kod') || '');
        return json(200, f ? { ...f, lisans: this.p.lisansDurumu(f) } : null);
      }
      // Bulutta "sunucunun kendi bilgisayarı" yoktur; ilk yönetici PLATFORM_KULLANICI / PLATFORM_SIFRE ile oluşur.
      const r = await this.p.platformIstek({ yontem: req.method, yol: url.pathname, govde: await govdeOku(req), cerezler: cerezOku(req), yerel: false,
        ip: req.headers.get('cf-connecting-ip') || '', sorgu: url.searchParams });
      return json(r.durum, r.veri, r.cerez ? { 'Set-Cookie': cerezYaz(r.cerez) } : {});
    } catch (e) { return hataYaniti(e); }
  }
}

// ---------------------------------------------------------------------------
// FİRMA (her kurs firmasına bir tane)
// ---------------------------------------------------------------------------
export class FirmaDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.maxSube = 1;
    this.maxKullanici = 0;
    this.motor = firmaAc({
      db: doVeritabani(ctx.storage),
      posDeneme: env.ENABLE_DEMO === '1' || env.POS_DENEME === '1',
      // Hassas bilgiler (evrak, anahtarlar) VERI_ANAHTARI gizli değişkeniyle şifrelenir (wrangler secret put VERI_ANAHTARI).
      veriAnahtari: anahtarCoz(env.VERI_ANAHTARI),
      limit: () => ({ maxSube: this.maxSube, maxKullanici: this.maxKullanici }),
      disIstek: (...a) => fetch(...a),
    });
  }
  // Zamanlanmış işler (hatırlatmalar): yarım saatte bir. İlk istek alarmı kurar.
  async alarmKur() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 30 * 60 * 1000);
  }
  async alarm() {
    await this.motor.zamanli();
    await this.ctx.storage.setAlarm(Date.now() + 30 * 60 * 1000);
  }
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/ic/kurulum') { this.motor.kurulum(await req.json()); return json(200, { tamam: true }); }
      if (url.pathname === '/ic/ozet') return json(200, { ...this.motor.ozet(), boyutMb: Math.round(this.ctx.storage.sql.databaseSize / 1048576 * 10) / 10 });
      if (url.pathname === '/ic/yonetici-kodu') { const g = await req.json(); return json(200, this.motor.yoneticiKoduUret(g.kullaniciAdi, g.veren)); }
      // Zamanda geri dönüş: istenen andaki hale dönülür, nesne yeniden başlar. Dönmeden önceki an da kayıtlıdır
      // (yanlış ana dönülürse o ana yeniden dönülebilir).
      if (url.pathname === '/ic/geri-don') {
        const { zaman } = await req.json();
        const ms = Date.parse(zaman);
        if (!Number.isFinite(ms) || ms > Date.now() || ms < Date.now() - 30 * 86400000) throw new IsHatasi('Son 30 gün içinde bir an seçin.');
        const onceki = await this.ctx.storage.getCurrentBookmark();
        const im = await this.ctx.storage.getBookmarkForTime(ms);
        await this.ctx.storage.onNextSessionRestoreBookmark(im);
        setTimeout(() => this.ctx.abort('yedekten dönüş'), 50);
        return json(200, { tamam: true, oncekiIsaret: onceki });
      }
      if (url.pathname === '/ic/ornek') {
        if (!this.motor.ctx.q1('SELECT 1 FROM kullanicilar LIMIT 1')) ornekFirmaDoldur(this.motor.ctx);
        return json(200, { tamam: true });
      }
      this.maxSube = Number(req.headers.get('x-dc-max-sube') || 1);
      this.maxKullanici = Number(req.headers.get('x-dc-max-kullanici') || 0);
      this.ctx.waitUntil(this.alarmKur());
      const kod = req.headers.get('x-dc-kod') || '';
      const cerezAd = `dc_${kod.replace(/-/g, '_')}`;
      const cerezler = cerezOku(req);

      // Canlı akış (sahadan girilen kayıt merkezin ekranına düşer).
      if (url.pathname === '/api/canli') {
        const { readable, writable } = new TransformStream();
        const yazici = writable.getWriter();
        const kodla = new TextEncoder();
        let nabiz;
        const kapat = () => { clearInterval(nabiz); iptal?.(); yazici.close().catch(() => {}); };
        const iptal = this.motor.abone(cerezler[cerezAd], (o) => { yazici.write(kodla.encode(`event: degisti\ndata: ${JSON.stringify(o)}\n\n`)).catch(() => {}); },
          () => { clearInterval(nabiz); yazici.close().catch(() => {}); });
        if (!iptal) return json(401, { hata: 'Oturum kapalı.' });
        yazici.write(kodla.encode(': baglandi\n\n'));
        nabiz = setInterval(() => { this.motor.dinleyicileriDenetle(); yazici.write(kodla.encode(': nabiz\n\n')).catch(() => kapat()); }, 25000);
        req.signal?.addEventListener('abort', kapat);
        return new Response(readable, { headers: { ...GUVENLIK, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
      }
      const posBildirim = url.pathname.startsWith('/api/pos-bildirim/');
      const r = await this.motor.istek({
        yontem: req.method, yol: posBildirim ? '/api/pos-bildirim' : url.pathname, sorgu: url.searchParams, oturum: cerezler[cerezAd],
        govde: await govdeOku(req), firmaKodu: kod, ip: req.headers.get('cf-connecting-ip') || '', koken: url.origin,
        saglayici: posBildirim ? url.pathname.split('/')[4] : '',
      });
      const basliklar = {};
      if (r.oturum !== undefined) basliklar['Set-Cookie'] = cerezYaz({ ad: cerezAd, deger: r.oturum?.deger || '', yas: r.oturum?.yas || 0 });
      if (r.ham) return new Response(r.ham.govde, { status: r.durum, headers: { ...GUVENLIK, 'Cache-Control': 'no-store', ...r.ham.basliklar } });
      return json(r.durum, r.veri, basliklar);
    } catch (e) { return hataYaniti(e); }
  }
}

const platformStub = (env) => env.PLATFORM.get(env.PLATFORM.idFromName('platform'));
const firmaStub = (env, kod) => env.FIRMA.get(env.FIRMA.idFromName(kod));

// ---------------------------------------------------------------------------
// GİRİŞ KAPISI
// ---------------------------------------------------------------------------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      const posBildirim = url.pathname.startsWith('/api/pos-bildirim/');
      if (req.method === 'POST' && !posBildirim && req.headers.get('x-dc') !== '1') return json(403, { hata: 'Geçersiz istek.' });
      if (url.pathname.startsWith('/api/platform/')) return platformStub(env).fetch(req);

      const kod = (posBildirim ? url.pathname.split('/')[3] : req.headers.get('x-firma') || url.searchParams.get('firma') || '').toLocaleLowerCase('tr-TR');
      const f = await (await platformStub(env).fetch(`https://ic/ic/firma?kod=${encodeURIComponent(kod)}`)).json();
      if (url.pathname === '/api/firma') {
        if (!f) return json(404, { hata: 'Bu kodla bir kurum bulunamadı.' });
        const d = await (await firmaStub(env, f.kod).fetch(new Request('https://ic/api/durum', { headers: { 'x-dc-kod': f.kod } }))).json();
        return json(200, { kod: f.kod, ad: d.kurum || f.ad, logo: d.logo || '', lisans: f.lisans, lisansBitis: f.lisans_bitis, demo: f.kod === 'ornek' && env.ENABLE_DEMO === '1', onKayit: !!d.onKayit });
      }
      if (!f) return json(404, { hata: 'Kurum kodu bulunamadı. Giriş ekranından kurum kodunuzu yazın.' });
      if (f.lisans !== 'acik' && !posBildirim)
        return json(402, { hata: f.lisans === 'bitti' ? 'Kurumunuzun kullanım süresi dolmuştur. Kayıtlarınız saklanıyor; uzatmak için DC ile görüşün.' : 'Kurumunuzun hesabı kapalıdır. DC ile görüşün.' });
      const ic = new Request(req);
      ic.headers.set('x-dc-kod', f.kod);
      ic.headers.set('x-dc-max-sube', String(f.max_sube));
      ic.headers.set('x-dc-max-kullanici', String(f.max_kullanici || 0));
      return firmaStub(env, f.kod).fetch(ic);
    } catch (e) { return hataYaniti(e); }
  },
};
