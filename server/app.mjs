// DC Sürücü Kursu · sunucu ve bütün iş kuralları.
// Yetki kuralları BURADA uygulanır. Ekranda gizlemek yeterli sayılmaz: bir kullanıcının görmemesi
// gereken bilgi sunucudan hiç gönderilmez.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IsHatasi, fail, metin, kurus, tamSayi, gun, saat, secim, bugun,
  tcGecerli, tcMaskele, SINIFLAR, SINAV_HAKKI, taksitPlani, hesapDurumu, tlYaz,
} from './domain.mjs';

const KOK = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ---------------------------------------------------------------------------
// ROLLER VE YETKİLER
//  yonetici     : kurum sahibi / merkez. Bütün şubeler, bütün yetkiler.
//  sube_muduru  : yalnız kendi şubesi, o şubede bütün yetkiler.
//  buro         : kendi şubesinde kayıt, tahsilat, ders ve sınav işleri (ayarlanabilir).
//  egitmen      : yalnız kendisine bağlı öğrenciler ve kendi dersleri. Para bilgisi görmez.
//  (öğrenci ayrı kapıdan girer, yalnız kendi bilgisini görür.)
// ---------------------------------------------------------------------------
export const HAKLAR = {
  kayit: 'Öğrenci kaydı ve düzenleme',
  hassas: 'T.C. kimlik no, adres, doğum tarihi görme',
  tahsilat: 'Ödeme alma ve öğrenci borçlarını görme',
  kasa: 'Gider girme, ödeme iptali, kasa',
  ders: 'Bütün öğrencilere ders planlama',
  sinav: 'Sınav kaydı ve sonuç girme',
  rapor: 'Raporlar',
  personel: 'Personel ve araç yönetimi',
};
const TUM_HAKLAR = Object.keys(HAKLAR);
export const ROLLER = { yonetici: 'Yönetici (Merkez)', sube_muduru: 'Şube müdürü', buro: 'Büro personeli', egitmen: 'Eğitmen' };
const ROL_VARSAYILAN = { buro: ['kayit', 'hassas', 'tahsilat', 'ders', 'sinav'], egitmen: [] };
// Büro ve eğitmene verilebilecek en geniş haklar. Personel yönetimi yalnız müdür ve yöneticidedir.
const VERILEBILIR = TUM_HAKLAR.filter((h) => h !== 'personel');

export function etkinHaklar(k) {
  if (k.rol === 'yonetici' || k.rol === 'sube_muduru') return TUM_HAKLAR.slice();
  let h = null;
  try { h = JSON.parse(k.yetkiler || 'null'); } catch { h = null; }
  if (!Array.isArray(h)) h = ROL_VARSAYILAN[k.rol] || [];
  return [...new Set(h.filter((x) => VERILEBILIR.includes(x)))];
}

// ---------------------------------------------------------------------------
// ŞİFRE
// ---------------------------------------------------------------------------
const ZAYIF = new Set(['12345678', '123456789', 'password', 'parola123', 'sifre123', 'qwerty123', '11111111', 'abcd1234', 'admin123', 'deneme123']);
function sifreKontrol(v, enAz = 8) {
  const s = metin(v, 200, true, 'Şifre');
  if (s.length < enAz) fail(`Şifre en az ${enAz} karakter olmalı.`);
  if (ZAYIF.has(s.toLocaleLowerCase('tr-TR'))) fail('Bu şifre çok yaygın, başka bir şifre seçin.');
  if (enAz >= 8 && /^\d+$/.test(s)) fail('Şifre yalnızca rakamlardan oluşamaz.');
  return s;
}
function sifreOzet(s) {
  const tuz = randomBytes(16).toString('hex');
  return tuz + ':' + scryptSync(s, tuz, 32).toString('hex');
}
function sifreDogru(s, kayitli) {
  try {
    const [tuz, h] = String(kayitli).split(':');
    return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(String(s), tuz, 32));
  } catch { return false; }
}
const ozet = (v) => createHash('sha256').update(v).digest('hex');

// ---------------------------------------------------------------------------
// VERİTABANI
// ---------------------------------------------------------------------------
const SEMA = `
CREATE TABLE IF NOT EXISTS kurum(id INTEGER PRIMARY KEY CHECK(id=1), ad TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subeler(id TEXT PRIMARY KEY, ad TEXT NOT NULL, adres TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
  merkez INTEGER NOT NULL DEFAULT 0, aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kullanicilar(id TEXT PRIMARY KEY, kullanici_adi TEXT NOT NULL UNIQUE COLLATE NOCASE, ad TEXT NOT NULL,
  sifre TEXT NOT NULL, rol TEXT NOT NULL, sube_id TEXT REFERENCES subeler(id), yetkiler TEXT, telefon TEXT NOT NULL DEFAULT '',
  aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS araclar(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL REFERENCES subeler(id), plaka TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '', sinif TEXT NOT NULL DEFAULT 'B', aktif INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS ogrenciler(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL REFERENCES subeler(id), ad TEXT NOT NULL, soyad TEXT NOT NULL,
  tc TEXT NOT NULL, telefon TEXT NOT NULL DEFAULT '', dogum TEXT NOT NULL DEFAULT '', adres TEXT NOT NULL DEFAULT '',
  sinif TEXT NOT NULL, kayit_tarihi TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'aktif', ucret INTEGER NOT NULL DEFAULT 0,
  egitmen_id TEXT REFERENCES kullanicilar(id), portal_sifre TEXT, notlar TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ogr_sube ON ogrenciler(sube_id);
CREATE INDEX IF NOT EXISTS ogr_tc ON ogrenciler(tc);
CREATE TABLE IF NOT EXISTS taksitler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), vade TEXT NOT NULL, tutar INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS odemeler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tutar INTEGER NOT NULL, tarih TEXT NOT NULL, yontem TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL,
  iptal INTEGER NOT NULL DEFAULT 0, iptal_nedeni TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS giderler(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL, tutar INTEGER NOT NULL, tarih TEXT NOT NULL,
  kategori TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, iptal INTEGER NOT NULL DEFAULT 0, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dersler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  egitmen_id TEXT REFERENCES kullanicilar(id), arac_id TEXT, tur TEXT NOT NULL, tarih TEXT NOT NULL, saat TEXT NOT NULL DEFAULT '',
  sure_dk INTEGER NOT NULL DEFAULT 50, durum TEXT NOT NULL DEFAULT 'planli', notu TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL,
  tamamlanma TEXT, olusturma TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ders_ogr ON dersler(ogrenci_id);
CREATE INDEX IF NOT EXISTS ders_tarih ON dersler(tarih);
CREATE TABLE IF NOT EXISTS sinavlar(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tur TEXT NOT NULL, tarih TEXT NOT NULL, saat TEXT NOT NULL DEFAULT '', deneme INTEGER NOT NULL, sonuc TEXT NOT NULL DEFAULT 'bekliyor',
  puan INTEGER, notu TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS olaylar(id INTEGER PRIMARY KEY AUTOINCREMENT, zaman TEXT NOT NULL, sube_id TEXT, kullanici TEXT NOT NULL,
  tur TEXT NOT NULL, metin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oturumlar(anahtar TEXT PRIMARY KEY, tur TEXT NOT NULL, kimlik TEXT NOT NULL, bitis INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS giris_denemeleri(anahtar TEXT PRIMARY KEY, sayi INTEGER NOT NULL, kilit_bitis INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS islem_kayit(istek_no TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL, sonuc TEXT NOT NULL, zaman TEXT NOT NULL);
`;

const OTURUM_SURESI = 12 * 3600 * 1000;
const KILIT_SINIRI = 5;
const KILIT_SURESI = 15 * 60 * 1000;
const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;

export function createApp({
  dbPath = resolve(KOK, 'data', 'kurs.sqlite'),
  staticDir = resolve(KOK, 'public'),
  demo = process.env.ENABLE_DEMO === '1',
  guvenliCerez = process.env.SECURE_COOKIE === '1',
  saatKaynagi = () => new Date(),
} = {}) {
  if (dbPath !== ':memory:') mkdirSync(resolve(dbPath, '..'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(SEMA);

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const q1 = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const islemde = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const bugunStr = () => bugun(saatKaynagi());

  // -------------------------------------------------------------------------
  // CANLI BİLDİRİM: sahadan girilen kayıt merkezin ekranına anında düşer.
  // Her bağlantı kendi kapsamındaki (şubesindeki) olayları alır.
  // -------------------------------------------------------------------------
  const dinleyiciler = new Set();
  function yayinla(subeId, olay) {
    const veri = `event: degisti\ndata: ${JSON.stringify(olay)}\n\n`;
    for (const d of dinleyiciler) if (d.kapsam === null || d.kapsam === subeId) d.res.write(veri);
  }
  const nabiz = setInterval(() => { for (const d of dinleyiciler) d.res.write(': nabiz\n\n'); }, 25000);
  nabiz.unref?.();

  function olayYaz(k, subeId, tur, yazi) {
    const zaman = simdi();
    const r = run('INSERT INTO olaylar(zaman,sube_id,kullanici,tur,metin) VALUES(?,?,?,?,?)', zaman, subeId, k.ad, tur, yazi);
    return { id: Number(r.lastInsertRowid), zaman, sube_id: subeId, kullanici: k.ad, tur, metin: yazi };
  }

  // -------------------------------------------------------------------------
  // KAPSAM (hangi şube)
  // -------------------------------------------------------------------------
  const kapsam = (k) => (k.rol === 'yonetici' ? null : k.sube_id);
  function subeIzinli(k, subeId) {
    if (!subeId) fail('Şube seçin.');
    const s = q1('SELECT * FROM subeler WHERE id=?', subeId);
    if (!s) fail('Şube bulunamadı.', 404);
    if (k.rol !== 'yonetici' && subeId !== k.sube_id) fail('Bu şube için yetkiniz yok.', 403);
    return s;
  }
  function hakGerek(k, hak) {
    if (!etkinHaklar(k).includes(hak)) fail(`Bu işlem için yetkiniz yok (${HAKLAR[hak]}).`, 403);
  }
  // Eğitmen, "ders" hakkı yoksa yalnız kendisine bağlı ya da kendisine ders verilmiş öğrencileri görür.
  function egitmenKisitli(k) {
    return k.rol === 'egitmen' && !etkinHaklar(k).includes('ders') && !etkinHaklar(k).includes('kayit');
  }
  function ogrenciGorebilir(k, o) {
    if (k.rol !== 'yonetici' && o.sube_id !== k.sube_id) return false;
    if (egitmenKisitli(k))
      return o.egitmen_id === k.id || !!q1('SELECT 1 FROM dersler WHERE ogrenci_id=? AND egitmen_id=? LIMIT 1', o.id, k.id);
    return true;
  }
  function ogrenciAl(k, id) {
    const o = q1('SELECT * FROM ogrenciler WHERE id=?', metin(id, 60, true, 'Öğrenci'));
    if (!o || !ogrenciGorebilir(k, o)) fail('Öğrenci bulunamadı.', 404);
    return o;
  }
  function egitmenAl(subeId, id) {
    if (!id) return null;
    const e = q1("SELECT * FROM kullanicilar WHERE id=? AND rol IN ('egitmen','sube_muduru','yonetici') AND aktif=1", id);
    if (!e) fail('Eğitmen bulunamadı.');
    if (e.rol !== 'yonetici' && e.sube_id !== subeId) fail('Eğitmen bu şubede çalışmıyor.');
    return e;
  }
  function aracAl(subeId, id) {
    if (!id) return null;
    const a = q1('SELECT * FROM araclar WHERE id=? AND aktif=1', id);
    if (!a || a.sube_id !== subeId) fail('Araç bu şubede bulunamadı.');
    return a;
  }

  const odenenToplam = (ogrId) => q1('SELECT COALESCE(SUM(tutar),0) t FROM odemeler WHERE ogrenci_id=? AND iptal=0', ogrId).t;
  const hesap = (o) =>
    hesapDurumu(o.ucret, q('SELECT vade,tutar FROM taksitler WHERE ogrenci_id=? ORDER BY vade', o.id), odenenToplam(o.id), bugunStr());

  function dersSayaci(ogrId) {
    const r = q("SELECT tur, COUNT(*) n FROM dersler WHERE ogrenci_id=? AND durum='tamamlandi' GROUP BY tur", ogrId);
    const s = { teorik: 0, direksiyon: 0 };
    for (const x of r) s[x.tur] = x.n;
    return s;
  }

  // -------------------------------------------------------------------------
  // PERSONEL EKRANI İÇİN VERİ (yetkiye göre süzülmüş)
  // -------------------------------------------------------------------------
  function veri(k) {
    const h = etkinHaklar(k);
    const kps = kapsam(k);
    const subeSart = kps === null ? '1=1' : 'sube_id=?';
    const sp = kps === null ? [] : [kps];
    const subeler = q(`SELECT id,ad,adres,telefon,merkez,aktif FROM subeler WHERE ${kps === null ? '1=1' : 'id=?'} ORDER BY merkez DESC, ad`, ...sp);
    const personel = h.includes('personel')
      ? q(`SELECT id,kullanici_adi,ad,rol,sube_id,yetkiler,telefon,aktif FROM kullanicilar WHERE ${kps === null ? '1=1' : '(sube_id=? AND rol IN (\'buro\',\'egitmen\')) OR id=?'} ORDER BY ad`, ...(kps === null ? [] : [kps, k.id]))
          .map((p) => ({ ...p, yetkiler: undefined, haklar: etkinHaklar(p) }))
      : q(`SELECT id,ad,rol,sube_id FROM kullanicilar WHERE aktif=1 AND (${kps === null ? '1=1' : "sube_id=? OR rol='yonetici'"}) ORDER BY ad`, ...sp);
    const araclar = q(`SELECT * FROM araclar WHERE ${subeSart} ORDER BY plaka`, ...sp);

    let ogrSatir = q(`SELECT * FROM ogrenciler WHERE ${subeSart} ORDER BY kayit_tarihi DESC, soyad`, ...sp);
    if (egitmenKisitli(k)) {
      const dersli = new Set(q('SELECT DISTINCT ogrenci_id FROM dersler WHERE egitmen_id=?', k.id).map((x) => x.ogrenci_id));
      ogrSatir = ogrSatir.filter((o) => o.egitmen_id === k.id || dersli.has(o.id));
    }
    const gorunen = new Set(ogrSatir.map((o) => o.id));
    const ogrenciler = ogrSatir.map((o) => {
      const x = {
        id: o.id, sube_id: o.sube_id, ad: o.ad, soyad: o.soyad, telefon: o.telefon, sinif: o.sinif,
        kayit_tarihi: o.kayit_tarihi, durum: o.durum, egitmen_id: o.egitmen_id, notlar: o.notlar,
        portal_acik: !!o.portal_sifre, dersler: dersSayaci(o.id),
        tc: h.includes('hassas') ? o.tc : tcMaskele(o.tc),
      };
      if (h.includes('hassas')) { x.dogum = o.dogum; x.adres = o.adres; }
      if (h.includes('tahsilat')) x.hesap = hesap(o);
      return x;
    });
    const filtre = (satirlar) => satirlar.filter((s) => gorunen.has(s.ogrenci_id));
    const sinir = new Date(saatKaynagi().getTime() - 180 * 86400000).toISOString().slice(0, 10);
    let dersler = filtre(q(`SELECT * FROM dersler WHERE ${subeSart} AND tarih>=? ORDER BY tarih, saat`, ...sp, sinir));
    if (egitmenKisitli(k)) dersler = dersler.filter((d) => d.egitmen_id === k.id);
    const sinavlar = filtre(q(`SELECT * FROM sinavlar WHERE ${subeSart} ORDER BY tarih DESC, saat`, ...sp));
    const sonuc = {
      ben: { id: k.id, ad: k.ad, rol: k.rol, sube_id: k.sube_id, haklar: h, kullanici_adi: k.kullanici_adi },
      kurum: q1('SELECT ad FROM kurum'), bugun: bugunStr(),
      tanimlar: { haklar: HAKLAR, roller: ROLLER, siniflar: SINIFLAR, sinavHakki: SINAV_HAKKI },
      subeler, personel, araclar, ogrenciler, dersler, sinavlar,
    };
    if (h.includes('tahsilat'))
      sonuc.odemeler = q(`SELECT * FROM odemeler WHERE ${subeSart} ORDER BY tarih DESC, olusturma DESC LIMIT 2000`, ...sp);
    if (h.includes('kasa'))
      sonuc.giderler = q(`SELECT * FROM giderler WHERE ${subeSart} ORDER BY tarih DESC, olusturma DESC LIMIT 2000`, ...sp);
    if (!egitmenKisitli(k))
      sonuc.olaylar = q(`SELECT * FROM olaylar WHERE ${kps === null ? '1=1' : 'sube_id=?'} ORDER BY id DESC LIMIT 80`, ...sp);
    return sonuc;
  }

  // Öğrenci kendi ekranı: yalnız kendi kaydı.
  function ogrenciVeri(o) {
    const sube = q1('SELECT ad,telefon,adres FROM subeler WHERE id=?', o.sube_id);
    const egitmen = o.egitmen_id ? q1('SELECT ad FROM kullanicilar WHERE id=?', o.egitmen_id) : null;
    return {
      kurum: q1('SELECT ad FROM kurum'), bugun: bugunStr(),
      ben: { ad: o.ad, soyad: o.soyad, sinif: o.sinif, sinif_ad: SINIFLAR[o.sinif]?.ad || o.sinif, durum: o.durum,
        kayit_tarihi: o.kayit_tarihi, sube: sube?.ad, sube_telefon: sube?.telefon, egitmen: egitmen?.ad || '' },
      gerekli: SINIFLAR[o.sinif] || null, sayac: dersSayaci(o.id), sinavHakki: SINAV_HAKKI,
      dersler: q("SELECT tur,tarih,saat,sure_dk,durum FROM dersler WHERE ogrenci_id=? AND durum!='iptal' ORDER BY tarih DESC, saat DESC", o.id),
      sinavlar: q('SELECT tur,tarih,saat,deneme,sonuc,puan FROM sinavlar WHERE ogrenci_id=? ORDER BY tarih DESC', o.id),
      hesap: hesap(o),
    };
  }

  // -------------------------------------------------------------------------
  // RAPOR (şube bazında ve şubeler toplamı)
  // -------------------------------------------------------------------------
  function rapor(k, bas, bit) {
    hakGerek(k, 'rapor');
    bas = gun(bas, 'Başlangıç'); bit = gun(bit, 'Bitiş');
    if (bas > bit) fail('Başlangıç tarihi bitişten sonra olamaz.');
    const kps = kapsam(k);
    const subeler = q(`SELECT id,ad FROM subeler WHERE ${kps === null ? '1=1' : 'id=?'} ORDER BY merkez DESC, ad`, ...(kps === null ? [] : [kps]));
    const satirlar = subeler.map((s) => {
      const t = (sql, ...p) => q1(sql, s.id, ...p);
      const ogr = q('SELECT * FROM ogrenciler WHERE sube_id=?', s.id);
      let alacak = 0, geciken = 0;
      for (const o of ogr) if (o.durum !== 'iptal') { const hs = hesap(o); alacak += Math.max(0, hs.kalan); geciken += hs.geciken; }
      const sinav = (tur) => t(`SELECT SUM(sonuc='gecti') g, SUM(sonuc IN ('gecti','kaldi')) n FROM sinavlar WHERE sube_id=? AND tur=? AND tarih BETWEEN ? AND ?`, tur, bas, bit);
      const es = sinav('e_sinav'), dr = sinav('direksiyon');
      const tahsilat = t('SELECT COALESCE(SUM(tutar),0) v FROM odemeler WHERE sube_id=? AND iptal=0 AND tarih BETWEEN ? AND ?', bas, bit).v;
      const gider = t('SELECT COALESCE(SUM(tutar),0) v FROM giderler WHERE sube_id=? AND iptal=0 AND tarih BETWEEN ? AND ?', bas, bit).v;
      return {
        sube_id: s.id, sube: s.ad,
        yeniKayit: t('SELECT COUNT(*) v FROM ogrenciler WHERE sube_id=? AND kayit_tarihi BETWEEN ? AND ?', bas, bit).v,
        aktifOgrenci: ogr.filter((o) => o.durum === 'aktif').length,
        tamamlananDers: t("SELECT COUNT(*) v FROM dersler WHERE sube_id=? AND durum='tamamlandi' AND tarih BETWEEN ? AND ?", bas, bit).v,
        gelmeyen: t("SELECT COUNT(*) v FROM dersler WHERE sube_id=? AND durum='gelmedi' AND tarih BETWEEN ? AND ?", bas, bit).v,
        eSinav: { gecen: es.g || 0, giren: es.n || 0 }, direksiyonSinav: { gecen: dr.g || 0, giren: dr.n || 0 },
        tahsilat, gider, net: tahsilat - gider, alacak, geciken,
      };
    });
    const top = (f) => satirlar.reduce((a, r) => a + f(r), 0);
    const toplam = {
      sube: 'Şubeler toplamı', yeniKayit: top((r) => r.yeniKayit), aktifOgrenci: top((r) => r.aktifOgrenci),
      tamamlananDers: top((r) => r.tamamlananDers), gelmeyen: top((r) => r.gelmeyen),
      eSinav: { gecen: top((r) => r.eSinav.gecen), giren: top((r) => r.eSinav.giren) },
      direksiyonSinav: { gecen: top((r) => r.direksiyonSinav.gecen), giren: top((r) => r.direksiyonSinav.giren) },
      tahsilat: top((r) => r.tahsilat), gider: top((r) => r.gider), net: top((r) => r.net), alacak: top((r) => r.alacak), geciken: top((r) => r.geciken),
    };
    const egitmenler = q(
      `SELECT k.ad, k.sube_id, SUM(d.durum='tamamlandi') tamamlanan, SUM(d.durum='gelmedi') gelmeyen, COALESCE(SUM(CASE WHEN d.durum='tamamlandi' THEN d.sure_dk END),0) dakika
       FROM dersler d JOIN kullanicilar k ON k.id=d.egitmen_id WHERE d.tarih BETWEEN ? AND ? ${kps === null ? '' : 'AND d.sube_id=?'}
       GROUP BY k.id ORDER BY tamamlanan DESC`, bas, bit, ...(kps === null ? [] : [kps]));
    return { bas, bit, satirlar, toplam, egitmenler };
  }

  // -------------------------------------------------------------------------
  // İŞLEMLER. Her biri: yetki kontrolü -> doğrulama -> kayıt -> olay.
  // Dönüş: { sonuc, olay:[subeId, tur, metin] }
  // -------------------------------------------------------------------------
  function personelYetkiDenetle(k, rol, subeId) {
    hakGerek(k, 'personel');
    secim(rol, Object.keys(ROLLER), 'Görev');
    if (k.rol !== 'yonetici') {
      if (!['buro', 'egitmen'].includes(rol)) fail('Şube müdürü yalnız büro personeli ve eğitmen ekleyebilir.', 403);
      if (subeId !== k.sube_id) fail('Yalnız kendi şubenize personel ekleyebilirsiniz.', 403);
    }
    if (rol === 'yonetici') return null;
    subeIzinli(k, subeId);
    return subeId;
  }
  function hakListesi(v) {
    if (v === undefined || v === null) return null;
    if (!Array.isArray(v)) fail('Yetki listesi geçersiz.');
    return JSON.stringify([...new Set(v.filter((x) => VERILEBILIR.includes(x)))]);
  }

  const ISLEMLER = {
    sube_ekle(k, g) {
      if (k.rol !== 'yonetici') fail('Şube yalnız yönetici tarafından açılır.', 403);
      const ad = metin(g.ad, 80, true, 'Şube adı');
      if (q1('SELECT 1 FROM subeler WHERE ad=? COLLATE NOCASE', ad)) fail('Bu adla bir şube zaten var.');
      const id = randomUUID();
      run('INSERT INTO subeler(id,ad,adres,telefon,merkez,aktif,olusturma) VALUES(?,?,?,?,0,1,?)', id, ad, metin(g.adres, 300), metin(g.telefon, 30), simdi());
      return { sonuc: { id }, olay: [id, 'sube', `Yeni şube açıldı: ${ad}`] };
    },
    sube_duzenle(k, g) {
      if (k.rol !== 'yonetici') fail('Şube bilgisi yalnız yönetici tarafından değiştirilir.', 403);
      const s = subeIzinli(k, g.id);
      const aktif = g.aktif === undefined ? s.aktif : g.aktif ? 1 : 0;
      if (s.merkez && !aktif) fail('Merkez şube kapatılamaz.');
      run('UPDATE subeler SET ad=?,adres=?,telefon=?,aktif=? WHERE id=?', metin(g.ad ?? s.ad, 80, true, 'Şube adı'), metin(g.adres ?? s.adres, 300), metin(g.telefon ?? s.telefon, 30), aktif, s.id);
      return { olay: [s.id, 'sube', `Şube bilgisi güncellendi: ${g.ad ?? s.ad}${aktif ? '' : ' (kapatıldı)'}`] };
    },

    personel_ekle(k, g) {
      const subeId = personelYetkiDenetle(k, g.rol, g.subeId);
      const kad = metin(g.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
      if (!/^[a-z0-9._-]{3,40}$/.test(kad)) fail('Kullanıcı adı en az 3 karakter olmalı; harf, rakam, nokta ve tire kullanılabilir.');
      if (q1('SELECT 1 FROM kullanicilar WHERE kullanici_adi=?', kad)) fail('Bu kullanıcı adı alınmış.');
      const id = randomUUID();
      const ad = metin(g.ad, 80, true, 'Ad soyad');
      run('INSERT INTO kullanicilar(id,kullanici_adi,ad,sifre,rol,sube_id,yetkiler,telefon,aktif,olusturma) VALUES(?,?,?,?,?,?,?,?,1,?)',
        id, kad, ad, sifreOzet(sifreKontrol(g.sifre)), g.rol, subeId, hakListesi(g.yetkiler), metin(g.telefon, 30), simdi());
      return { sonuc: { id }, olay: [subeId, 'personel', `Personel eklendi: ${ad} (${ROLLER[g.rol]})`] };
    },
    personel_duzenle(k, g) {
      hakGerek(k, 'personel');
      const p = q1('SELECT * FROM kullanicilar WHERE id=?', metin(g.id, 60, true));
      if (!p) fail('Personel bulunamadı.', 404);
      if (k.rol !== 'yonetici' && (p.id !== k.id && (!['buro', 'egitmen'].includes(p.rol) || p.sube_id !== k.sube_id))) fail('Bu personeli düzenleme yetkiniz yok.', 403);
      const rol = g.rol ?? p.rol;
      const subeId = g.subeId !== undefined ? g.subeId : p.sube_id;
      if (p.id === k.id) {
        if (rol !== p.rol || subeId !== p.sube_id || g.aktif === false) fail('Kendi görevinizi, şubenizi veya girişinizi değiştiremezsiniz.');
      } else personelYetkiDenetle(k, rol, subeId);
      const yeniSube = rol === 'yonetici' ? null : subeId;
      const aktif = g.aktif === undefined ? p.aktif : g.aktif ? 1 : 0;
      if (p.rol === 'yonetici' && (!aktif || rol !== 'yonetici')
        && q1("SELECT COUNT(*) n FROM kullanicilar WHERE rol='yonetici' AND aktif=1").n <= 1) fail('Son yönetici kapatılamaz.');
      run('UPDATE kullanicilar SET ad=?,rol=?,sube_id=?,yetkiler=?,telefon=?,aktif=? WHERE id=?',
        metin(g.ad ?? p.ad, 80, true, 'Ad soyad'), rol, yeniSube, g.yetkiler !== undefined ? hakListesi(g.yetkiler) : p.yetkiler,
        metin(g.telefon ?? p.telefon, 30), aktif, p.id);
      if (g.yeniSifre) run('UPDATE kullanicilar SET sifre=? WHERE id=?', sifreOzet(sifreKontrol(g.yeniSifre)), p.id);
      if (g.yeniSifre || !aktif) run("DELETE FROM oturumlar WHERE tur='personel' AND kimlik=?", p.id);
      return { olay: [yeniSube, 'personel', `Personel bilgisi güncellendi: ${g.ad ?? p.ad}${aktif ? '' : ' (girişi kapatıldı)'}`] };
    },
    sifre_degistir(k, g) {
      const p = q1('SELECT * FROM kullanicilar WHERE id=?', k.id);
      if (!sifreDogru(g.eskiSifre, p.sifre)) fail('Mevcut şifre yanlış.');
      run('UPDATE kullanicilar SET sifre=? WHERE id=?', sifreOzet(sifreKontrol(g.yeniSifre)), k.id);
      return { olay: [k.sube_id, 'personel', `${k.ad} şifresini değiştirdi`] };
    },

    arac_ekle(k, g) {
      hakGerek(k, 'personel');
      subeIzinli(k, g.subeId);
      const plaka = metin(g.plaka, 15, true, 'Plaka').toLocaleUpperCase('tr-TR');
      if (q1('SELECT 1 FROM araclar WHERE plaka=?', plaka)) fail('Bu plaka zaten kayıtlı.');
      const id = randomUUID();
      run('INSERT INTO araclar(id,sube_id,plaka,model,sinif,aktif) VALUES(?,?,?,?,?,1)', id, g.subeId, plaka, metin(g.model, 60), secim(g.sinif || 'B', Object.keys(SINIFLAR), 'Sınıf'));
      return { sonuc: { id }, olay: [g.subeId, 'arac', `Araç eklendi: ${plaka}`] };
    },
    arac_duzenle(k, g) {
      hakGerek(k, 'personel');
      const a = q1('SELECT * FROM araclar WHERE id=?', metin(g.id, 60, true));
      if (!a) fail('Araç bulunamadı.', 404);
      subeIzinli(k, a.sube_id);
      const subeId = g.subeId ?? a.sube_id;
      subeIzinli(k, subeId);
      run('UPDATE araclar SET model=?,sinif=?,aktif=?,sube_id=? WHERE id=?', metin(g.model ?? a.model, 60), secim(g.sinif ?? a.sinif, Object.keys(SINIFLAR), 'Sınıf'), g.aktif === undefined ? a.aktif : g.aktif ? 1 : 0, subeId, a.id);
      return { olay: [subeId, 'arac', `Araç güncellendi: ${a.plaka}`] };
    },

    ogrenci_ekle(k, g) {
      hakGerek(k, 'kayit');
      const s = subeIzinli(k, g.subeId);
      if (!s.aktif) fail('Kapalı şubeye kayıt yapılamaz.');
      const ad = metin(g.ad, 60, true, 'Ad'), soyad = metin(g.soyad, 60, true, 'Soyad');
      const tc = metin(g.tc, 11, true, 'T.C. kimlik no');
      if (!tcGecerli(tc)) fail('T.C. kimlik numarası geçersiz.');
      const sinif = secim(g.sinif, Object.keys(SINIFLAR), 'Ehliyet sınıfı');
      // Aynı kişi aynı sınıfa ikinci kez aktif kayıt olamaz (hangi şubede olursa olsun).
      const var_ = q1("SELECT o.id, s.ad sube FROM ogrenciler o JOIN subeler s ON s.id=o.sube_id WHERE o.tc=? AND o.sinif=? AND o.durum IN ('aktif','dondu')", tc, sinif);
      if (var_) fail(`Bu kişinin ${sinif} sınıfı için açık bir kaydı var (${k.rol === 'yonetici' || var_.sube === s.ad ? var_.sube : 'başka bir şube'}).`);
      const egitmen = egitmenAl(s.id, g.egitmenId);
      const ucret = kurus(g.ucret ?? 0, 'Kurs ücreti');
      const pesinat = kurus(g.pesinat ?? 0, 'Peşinat');
      if (pesinat > 0) hakGerek(k, 'tahsilat');
      const kayitTarihi = gun(g.kayitTarihi || bugunStr(), 'Kayıt tarihi');
      const taksitSayisi = ucret - pesinat > 0 ? tamSayi(g.taksitSayisi ?? 1, 1, 24, 'Taksit sayısı') : 0;
      const plan = taksitPlani(ucret, pesinat, taksitSayisi, gun(g.ilkVade || kayitTarihi, 'İlk taksit tarihi'), kayitTarihi);
      const id = randomUUID();
      run(`INSERT INTO ogrenciler(id,sube_id,ad,soyad,tc,telefon,dogum,adres,sinif,kayit_tarihi,durum,ucret,egitmen_id,portal_sifre,notlar,olusturma)
           VALUES(?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?)`,
        id, s.id, ad, soyad, tc, metin(g.telefon, 30), gun(g.dogum, 'Doğum tarihi', false), metin(g.adres, 300), sinif, kayitTarihi,
        ucret, egitmen?.id || null, g.portalSifre ? sifreOzet(sifreKontrol(g.portalSifre, 6)) : null, metin(g.notlar, 1000), simdi());
      for (const t of plan) run('INSERT INTO taksitler(id,ogrenci_id,vade,tutar) VALUES(?,?,?,?)', randomUUID(), id, t.vade, t.tutar);
      if (pesinat > 0)
        run('INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?)',
          randomUUID(), id, s.id, pesinat, kayitTarihi, secim(g.pesinatYontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli'), 'Peşinat', k.ad, simdi());
      return { sonuc: { id }, olay: [s.id, 'kayit', `Yeni kayıt: ${ad} ${soyad} (${sinif}) · ${s.ad}`] };
    },
    ogrenci_duzenle(k, g) {
      hakGerek(k, 'kayit');
      const o = ogrenciAl(k, g.id);
      const hassas = etkinHaklar(k).includes('hassas');
      let tc = o.tc;
      if (g.tc !== undefined && hassas) { tc = metin(g.tc, 11, true, 'T.C. kimlik no'); if (!tcGecerli(tc)) fail('T.C. kimlik numarası geçersiz.'); }
      const sinif = g.sinif !== undefined ? secim(g.sinif, Object.keys(SINIFLAR), 'Ehliyet sınıfı') : o.sinif;
      const egitmenId = g.egitmenId !== undefined ? egitmenAl(o.sube_id, g.egitmenId)?.id || null : o.egitmen_id;
      run('UPDATE ogrenciler SET ad=?,soyad=?,tc=?,telefon=?,dogum=?,adres=?,sinif=?,egitmen_id=?,notlar=? WHERE id=?',
        metin(g.ad ?? o.ad, 60, true, 'Ad'), metin(g.soyad ?? o.soyad, 60, true, 'Soyad'), tc, metin(g.telefon ?? o.telefon, 30),
        hassas && g.dogum !== undefined ? gun(g.dogum, 'Doğum tarihi', false) : o.dogum,
        hassas && g.adres !== undefined ? metin(g.adres, 300) : o.adres, sinif, egitmenId, metin(g.notlar ?? o.notlar, 1000), o.id);
      return { olay: [o.sube_id, 'kayit', `Öğrenci bilgisi güncellendi: ${adSoyad(o)}`] };
    },
    ogrenci_durum(k, g) {
      hakGerek(k, 'kayit');
      const o = ogrenciAl(k, g.id);
      const durum = secim(g.durum, ['aktif', 'dondu', 'tamamlandi', 'iptal'], 'Durum');
      run('UPDATE ogrenciler SET durum=? WHERE id=?', durum, o.id);
      if (durum === 'iptal' || durum === 'dondu') run("UPDATE dersler SET durum='iptal', notu='Kayıt ' || ? WHERE ogrenci_id=? AND durum='planli'", durum === 'iptal' ? 'iptal edildi' : 'donduruldu', o.id);
      const ad = { aktif: 'aktif', dondu: 'donduruldu', tamamlandi: 'tamamlandı', iptal: 'iptal edildi' }[durum];
      return { olay: [o.sube_id, 'kayit', `${adSoyad(o)} kaydı ${ad}`] };
    },
    ogrenci_nakil(k, g) {
      if (k.rol !== 'yonetici') fail('Şubeler arası nakli yalnız yönetici yapar.', 403);
      const o = ogrenciAl(k, g.id);
      const s = subeIzinli(k, g.subeId);
      if (s.id === o.sube_id) fail('Öğrenci zaten bu şubede.');
      const eski = q1('SELECT ad FROM subeler WHERE id=?', o.sube_id).ad;
      // Geçmiş ödeme, ders ve sınav kayıtları eski şubede kalır (o şubenin cirosu ve emeği bozulmaz).
      run('UPDATE ogrenciler SET sube_id=?, egitmen_id=NULL WHERE id=?', s.id, o.id);
      run("UPDATE dersler SET durum='iptal', notu='Şube nakli' WHERE ogrenci_id=? AND durum='planli'", o.id);
      olayYaz(k, o.sube_id, 'kayit', `${adSoyad(o)} ${s.ad} şubesine nakledildi`);
      return { olay: [s.id, 'kayit', `${adSoyad(o)} ${eski} şubesinden nakil geldi`] };
    },
    ogrenci_portal(k, g) {
      hakGerek(k, 'kayit');
      const o = ogrenciAl(k, g.id);
      const s = g.sifre ? sifreOzet(sifreKontrol(g.sifre, 6)) : null;
      run('UPDATE ogrenciler SET portal_sifre=? WHERE id=?', s, o.id);
      run("DELETE FROM oturumlar WHERE tur='ogrenci' AND kimlik=?", o.id);
      return { olay: [o.sube_id, 'kayit', `${adSoyad(o)} için öğrenci girişi ${s ? 'açıldı / şifre yenilendi' : 'kapatıldı'}`] };
    },
    ogrenci_ucret(k, g) {
      hakGerek(k, 'kasa');
      const o = ogrenciAl(k, g.id);
      const ucret = kurus(g.ucret, 'Kurs ücreti');
      const odenen = odenenToplam(o.id);
      if (ucret < odenen) fail(`Ücret ödenmiş tutardan (${tlYaz(odenen)}) az olamaz.`);
      const sayi = ucret - odenen > 0 ? tamSayi(g.taksitSayisi ?? 1, 1, 24, 'Taksit sayısı') : 0;
      const plan = taksitPlani(ucret, odenen, sayi, gun(g.ilkVade || bugunStr(), 'İlk taksit tarihi'), o.kayit_tarihi);
      run('DELETE FROM taksitler WHERE ogrenci_id=?', o.id);
      for (const t of plan) run('INSERT INTO taksitler(id,ogrenci_id,vade,tutar) VALUES(?,?,?,?)', randomUUID(), o.id, t.vade, t.tutar);
      run('UPDATE ogrenciler SET ucret=? WHERE id=?', ucret, o.id);
      return { olay: [o.sube_id, 'kasa', `${adSoyad(o)} ücret / taksit planı güncellendi: ${tlYaz(ucret)}`] };
    },

    odeme_al(k, g) {
      hakGerek(k, 'tahsilat');
      const o = ogrenciAl(k, g.ogrenciId);
      const tutar = kurus(g.tutar, 'Tutar', false);
      const kalan = o.ucret - odenenToplam(o.id);
      if (tutar > kalan) fail(`Tutar kalan borçtan (${tlYaz(kalan)}) büyük olamaz.`);
      const id = randomUUID();
      run('INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?)',
        id, o.id, o.sube_id, tutar, gun(g.tarih || bugunStr()), secim(g.yontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli'), metin(g.aciklama, 200), k.ad, simdi());
      return { sonuc: { id }, olay: [o.sube_id, 'odeme', `${adSoyad(o)} ödeme yaptı: ${tlYaz(tutar)}`] };
    },
    odeme_iptal(k, g) {
      hakGerek(k, 'kasa');
      const od = q1('SELECT * FROM odemeler WHERE id=?', metin(g.id, 60, true));
      if (!od || od.iptal) fail('Ödeme bulunamadı.', 404);
      subeIzinli(k, od.sube_id);
      const o = q1('SELECT * FROM ogrenciler WHERE id=?', od.ogrenci_id);
      run('UPDATE odemeler SET iptal=1, iptal_nedeni=? WHERE id=?', metin(g.neden, 200, true, 'İptal nedeni'), od.id);
      return { olay: [od.sube_id, 'kasa', `${adSoyad(o)} ödemesi iptal edildi: ${tlYaz(od.tutar)} (${g.neden})`] };
    },
    gider_ekle(k, g) {
      hakGerek(k, 'kasa');
      subeIzinli(k, g.subeId);
      const tutar = kurus(g.tutar, 'Tutar', false);
      const kategori = metin(g.kategori, 40, true, 'Gider türü');
      const id = randomUUID();
      run('INSERT INTO giderler(id,sube_id,tutar,tarih,kategori,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?)',
        id, g.subeId, tutar, gun(g.tarih || bugunStr()), kategori, metin(g.aciklama, 200), k.ad, simdi());
      return { sonuc: { id }, olay: [g.subeId, 'kasa', `Gider girildi: ${kategori} ${tlYaz(tutar)}`] };
    },
    gider_iptal(k, g) {
      hakGerek(k, 'kasa');
      const gd = q1('SELECT * FROM giderler WHERE id=?', metin(g.id, 60, true));
      if (!gd || gd.iptal) fail('Gider bulunamadı.', 404);
      subeIzinli(k, gd.sube_id);
      run('UPDATE giderler SET iptal=1 WHERE id=?', gd.id);
      return { olay: [gd.sube_id, 'kasa', `Gider iptal edildi: ${gd.kategori} ${tlYaz(gd.tutar)}`] };
    },

    ders_planla(k, g) {
      const o = ogrenciAl(k, g.ogrenciId);
      if (o.durum !== 'aktif') fail('Yalnız aktif öğrenciye ders planlanır.');
      const egitmen = egitmenAl(o.sube_id, g.egitmenId || (k.rol === 'egitmen' ? k.id : null));
      if (!etkinHaklar(k).includes('ders') && egitmen?.id !== k.id) fail('Yalnız kendi dersinizi planlayabilirsiniz.', 403);
      const tur = secim(g.dersTuru, ['teorik', 'direksiyon'], 'Ders türü');
      if (tur === 'direksiyon' && !egitmen) fail('Direksiyon dersi için eğitmen seçin.');
      const tarih = gun(g.tarih), sa = saat(g.saat, true);
      const arac = tur === 'direksiyon' ? aracAl(o.sube_id, g.aracId) : null;
      if (egitmen && q1("SELECT 1 FROM dersler WHERE egitmen_id=? AND tarih=? AND saat=? AND durum='planli'", egitmen.id, tarih, sa)) fail(`${egitmen.ad} bu saatte başka derste.`);
      if (arac && q1("SELECT 1 FROM dersler WHERE arac_id=? AND tarih=? AND saat=? AND durum='planli'", arac.id, tarih, sa)) fail(`${arac.plaka} bu saatte başka derste.`);
      if (q1("SELECT 1 FROM dersler WHERE ogrenci_id=? AND tarih=? AND saat=? AND durum='planli'", o.id, tarih, sa)) fail('Öğrencinin bu saatte başka dersi var.');
      const id = randomUUID();
      run('INSERT INTO dersler(id,ogrenci_id,sube_id,egitmen_id,arac_id,tur,tarih,saat,sure_dk,durum,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        id, o.id, o.sube_id, egitmen?.id || null, arac?.id || null, tur, tarih, sa, tamSayi(g.sureDk ?? 50, 10, 240, 'Süre'), 'planli', k.ad, simdi());
      return { sonuc: { id }, olay: [o.sube_id, 'ders', `${adSoyad(o)} için ${tur} dersi planlandı: ${tarih} ${sa}`] };
    },
    ders_sonuc(k, g) {
      const d = q1('SELECT * FROM dersler WHERE id=?', metin(g.id, 60, true));
      if (!d) fail('Ders bulunamadı.', 404);
      const o = ogrenciAl(k, d.ogrenci_id);
      if (d.egitmen_id !== k.id && !etkinHaklar(k).includes('ders')) fail('Yalnız kendi dersinizin sonucunu girebilirsiniz.', 403);
      const durum = secim(g.durum, ['tamamlandi', 'gelmedi', 'iptal', 'planli'], 'Ders durumu');
      if (d.durum === durum) return { sonuc: { ayni: true } };
      if (d.durum !== 'planli' && !etkinHaklar(k).includes('ders')) fail('Sonuçlanmış ders yalnız ders yetkisi olan personel tarafından değiştirilir.', 403);
      run('UPDATE dersler SET durum=?, notu=?, tamamlanma=? WHERE id=?', durum, metin(g.notu ?? d.notu, 500), durum === 'planli' ? null : simdi(), d.id);
      const yazi = { tamamlandi: 'tamamlandı', gelmedi: 'öğrenci gelmedi', iptal: 'iptal edildi', planli: 'yeniden plana alındı' }[durum];
      return { olay: [d.sube_id, 'ders', `${adSoyad(o)} ${d.tur} dersi ${yazi} (${k.ad})`] };
    },
    // Sahada eğitmenin önceden planlanmamış bir dersi "şimdi tamamlandı" diye girmesi.
    ders_saha(k, g) {
      const o = ogrenciAl(k, g.ogrenciId);
      if (o.durum !== 'aktif') fail('Yalnız aktif öğrenciye ders girilir.');
      if (!etkinHaklar(k).includes('ders') && o.egitmen_id !== k.id) fail('Bu öğrenci size bağlı değil.', 403);
      const tur = secim(g.dersTuru || 'direksiyon', ['teorik', 'direksiyon'], 'Ders türü');
      const an = saatKaynagi();
      const yerel = new Date(an.getTime() - an.getTimezoneOffset() * 60000).toISOString();
      const id = randomUUID();
      run("INSERT INTO dersler(id,ogrenci_id,sube_id,egitmen_id,arac_id,tur,tarih,saat,sure_dk,durum,notu,kaydeden,tamamlanma,olusturma) VALUES(?,?,?,?,?,?,?,?,?,'tamamlandi',?,?,?,?)",
        id, o.id, o.sube_id, k.id, tur === 'direksiyon' ? aracAl(o.sube_id, g.aracId)?.id || null : null, tur,
        yerel.slice(0, 10), yerel.slice(11, 16), tamSayi(g.sureDk ?? 50, 10, 240, 'Süre'), metin(g.notu, 500), k.ad, simdi(), simdi());
      return { sonuc: { id }, olay: [o.sube_id, 'ders', `Sahadan: ${adSoyad(o)} ${tur} dersi tamamlandı (${k.ad})`] };
    },

    sinav_ekle(k, g) {
      hakGerek(k, 'sinav');
      const o = ogrenciAl(k, g.ogrenciId);
      if (o.durum !== 'aktif') fail('Yalnız aktif öğrenci sınava yazılır.');
      const tur = secim(g.sinavTuru, ['e_sinav', 'direksiyon'], 'Sınav türü');
      const onceki = q('SELECT * FROM sinavlar WHERE ogrenci_id=? AND tur=?', o.id, tur);
      if (onceki.some((s) => s.sonuc === 'gecti')) fail('Öğrenci bu sınavı zaten geçti.');
      if (onceki.some((s) => s.sonuc === 'bekliyor')) fail('Öğrencinin sonucu girilmemiş bir sınavı var.');
      const hak = onceki.filter((s) => s.sonuc === 'kaldi').length;
      if (hak >= SINAV_HAKKI) fail(`Sınav hakkı dolmuş (${SINAV_HAKKI}).`);
      if (tur === 'direksiyon' && !q1("SELECT 1 FROM sinavlar WHERE ogrenci_id=? AND tur='e_sinav' AND sonuc='gecti'", o.id)) fail('Önce e-sınavı geçmesi gerekir.');
      const tarih = gun(g.tarih);
      const id = randomUUID();
      run('INSERT INTO sinavlar(id,ogrenci_id,sube_id,tur,tarih,saat,deneme,sonuc,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id, o.id, o.sube_id, tur, tarih, saat(g.saat), hak + 1, 'bekliyor', k.ad, simdi());
      return { sonuc: { id }, olay: [o.sube_id, 'sinav', `${adSoyad(o)} ${tur === 'e_sinav' ? 'e-sınava' : 'direksiyon sınavına'} yazıldı: ${tarih} (${hak + 1}. hak)`] };
    },
    sinav_sonuc(k, g) {
      hakGerek(k, 'sinav');
      const s = q1('SELECT * FROM sinavlar WHERE id=?', metin(g.id, 60, true));
      if (!s) fail('Sınav bulunamadı.', 404);
      const o = ogrenciAl(k, s.ogrenci_id);
      let puan = null, sonuc = secim(g.sonuc, ['gecti', 'kaldi', 'girmedi', 'bekliyor'], 'Sonuç');
      if (s.tur === 'e_sinav' && g.puan !== undefined && g.puan !== null && g.puan !== '') {
        puan = tamSayi(g.puan, 0, 100, 'Puan');
        if (sonuc !== 'girmedi') sonuc = puan >= 70 ? 'gecti' : 'kaldi';
      }
      run('UPDATE sinavlar SET sonuc=?, puan=?, notu=? WHERE id=?', sonuc, puan, metin(g.notu ?? s.notu, 300), s.id);
      if (s.tur === 'direksiyon' && sonuc === 'gecti') run("UPDATE ogrenciler SET durum='tamamlandi' WHERE id=?", o.id);
      const ad = s.tur === 'e_sinav' ? 'e-sınav' : 'direksiyon sınavı';
      const yazi = { gecti: 'GEÇTİ', kaldi: 'kaldı', girmedi: 'girmedi', bekliyor: 'sonuç bekleniyor' }[sonuc];
      return { olay: [s.sube_id, 'sinav', `${adSoyad(o)} ${ad}: ${yazi}${puan !== null ? ` (${puan} puan)` : ''}`] };
    },
  };

  function islemYap(k, g) {
    const tur = String(g?.tur || '');
    const f = Object.hasOwn(ISLEMLER, tur) ? ISLEMLER[tur] : null;
    if (!f) fail('Bilinmeyen işlem.');
    // Sahadan internet kopukken sıraya alınmış istek iki kez gelirse ikincisi aynı cevabı alır, çift kayıt olmaz.
    const istekNo = g.istekNo ? metin(g.istekNo, 80, false, 'İstek no') : '';
    const sonuc = islemde(() => {
      if (istekNo) {
        const onceki = q1('SELECT sonuc, kullanici_id FROM islem_kayit WHERE istek_no=?', istekNo);
        if (onceki && onceki.kullanici_id === k.id) return { tekrar: true, sonuc: JSON.parse(onceki.sonuc) };
        if (onceki) fail('İstek numarası kullanılmış.');
      }
      const r = f(k, g) || {};
      let olay = null;
      if (r.olay) olay = olayYaz(k, r.olay[0], r.olay[1], r.olay[2]);
      const cevap = r.sonuc || {};
      if (istekNo) run('INSERT INTO islem_kayit(istek_no,kullanici_id,sonuc,zaman) VALUES(?,?,?,?)', istekNo, k.id, JSON.stringify(cevap), simdi());
      return { sonuc: cevap, olay };
    });
    if (sonuc.olay) yayinla(sonuc.olay.sube_id, sonuc.olay);
    return sonuc.sonuc;
  }

  // -------------------------------------------------------------------------
  // GİRİŞ
  // -------------------------------------------------------------------------
  function denemeKontrol(anahtar) {
    const d = q1('SELECT * FROM giris_denemeleri WHERE anahtar=?', anahtar);
    if (d && d.kilit_bitis > Date.now()) fail(`Çok fazla hatalı deneme. ${Math.ceil((d.kilit_bitis - Date.now()) / 60000)} dakika sonra tekrar deneyin.`, 429);
  }
  function hataliDeneme(anahtar) {
    const d = q1('SELECT * FROM giris_denemeleri WHERE anahtar=?', anahtar);
    const sayi = (d && d.kilit_bitis <= Date.now() && d.kilit_bitis > 0 ? 0 : d?.sayi || 0) + 1;
    const kilit = sayi >= KILIT_SINIRI ? Date.now() + KILIT_SURESI : 0;
    run('INSERT INTO giris_denemeleri(anahtar,sayi,kilit_bitis) VALUES(?,?,?) ON CONFLICT(anahtar) DO UPDATE SET sayi=excluded.sayi, kilit_bitis=excluded.kilit_bitis', anahtar, kilit ? 0 : sayi, kilit);
  }
  function oturumAc(tur, kimlik) {
    const anahtar = randomBytes(32).toString('base64url');
    run('DELETE FROM oturumlar WHERE bitis<?', Date.now());
    run('INSERT INTO oturumlar(anahtar,tur,kimlik,bitis) VALUES(?,?,?,?)', ozet(anahtar), tur, kimlik, Date.now() + OTURUM_SURESI);
    return anahtar;
  }
  function personelGiris(g) {
    const kad = metin(g.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
    const anahtar = 'p:' + kad;
    denemeKontrol(anahtar);
    const k = q1('SELECT * FROM kullanicilar WHERE kullanici_adi=?', kad);
    if (!k || !sifreDogru(g.sifre, k.sifre) || !k.aktif) { hataliDeneme(anahtar); fail('Kullanıcı adı veya şifre hatalı.', 401); }
    run('DELETE FROM giris_denemeleri WHERE anahtar=?', anahtar);
    const kapi = g.kapi === 'yonetici' ? 'yonetici' : 'personel';
    const yoneticiRol = ['yonetici', 'sube_muduru'].includes(k.rol);
    if (kapi === 'yonetici' && !yoneticiRol) fail('Bu hesap personel hesabıdır. "Personel girişi" bölümünü kullanın.', 403);
    if (kapi === 'personel' && yoneticiRol) fail('Bu hesap yetkili hesabıdır. "Yetkili girişi" bölümünü kullanın.', 403);
    if (k.sube_id && !q1('SELECT aktif FROM subeler WHERE id=?', k.sube_id)?.aktif) fail('Şubeniz kapalı olduğu için giriş yapılamıyor.', 403);
    return oturumAc('personel', k.id);
  }
  function ogrenciGiris(g) {
    const tc = metin(g.tc, 11, true, 'T.C. kimlik no');
    const anahtar = 'o:' + tc;
    denemeKontrol(anahtar);
    const adaylar = q("SELECT * FROM ogrenciler WHERE tc=? AND portal_sifre IS NOT NULL AND durum!='iptal' ORDER BY kayit_tarihi DESC", tc);
    const o = adaylar.find((x) => sifreDogru(g.sifre, x.portal_sifre));
    if (!o) { hataliDeneme(anahtar); fail('T.C. kimlik no veya şifre hatalı.', 401); }
    run('DELETE FROM giris_denemeleri WHERE anahtar=?', anahtar);
    return oturumAc('ogrenci', o.id);
  }
  function oturumBul(req) {
    const c = /(?:^|;\s*)dc_oturum=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
    if (!c) return null;
    const o = q1('SELECT * FROM oturumlar WHERE anahtar=?', ozet(c[1]));
    if (!o || o.bitis < Date.now()) return null;
    if (o.tur === 'personel') {
      const k = q1('SELECT * FROM kullanicilar WHERE id=? AND aktif=1', o.kimlik);
      if (!k) return null;
      if (k.sube_id && !q1('SELECT aktif FROM subeler WHERE id=?', k.sube_id)?.aktif) return null;
      return { tur: 'personel', k, anahtar: o.anahtar };
    }
    const ogr = q1("SELECT * FROM ogrenciler WHERE id=? AND durum!='iptal' AND portal_sifre IS NOT NULL", o.kimlik);
    return ogr ? { tur: 'ogrenci', o: ogr, anahtar: o.anahtar } : null;
  }

  function kurulum(g) {
    if (q1('SELECT 1 FROM kullanicilar LIMIT 1')) fail('Kurulum daha önce yapılmış.', 403);
    const kad = metin(g.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
    if (!/^[a-z0-9._-]{3,40}$/.test(kad)) fail('Kullanıcı adı en az 3 karakter olmalı; harf, rakam, nokta ve tire kullanılabilir.');
    const sifre = sifreKontrol(g.sifre);
    islemde(() => {
      run('INSERT INTO kurum(id,ad,olusturma) VALUES(1,?,?)', metin(g.kurumAdi, 120, true, 'Kurum adı'), simdi());
      run('INSERT INTO subeler(id,ad,adres,telefon,merkez,aktif,olusturma) VALUES(?,?,?,?,1,1,?)', randomUUID(), metin(g.subeAdi || 'Merkez', 80, true, 'Şube adı'), metin(g.adres, 300), metin(g.telefon, 30), simdi());
      run("INSERT INTO kullanicilar(id,kullanici_adi,ad,sifre,rol,sube_id,yetkiler,telefon,aktif,olusturma) VALUES(?,?,?,?,'yonetici',NULL,NULL,'',1,?)",
        randomUUID(), kad, metin(g.ad, 80, true, 'Ad soyad'), sifreOzet(sifre), simdi());
    });
    return oturumAc('personel', q1('SELECT id FROM kullanicilar WHERE kullanici_adi=?', kad).id);
  }

  if (demo && !q1('SELECT 1 FROM kullanicilar LIMIT 1')) ornekVeri({ run, q1, islemde, sifreOzet, bugunStr, saatKaynagi });

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------
  const TURLER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
  const GUVENLIK = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  };
  const cerez = (v, yas) => `dc_oturum=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${yas}${guvenliCerez ? '; Secure' : ''}`;

  function json(res, durum, veri, basliklar = {}) {
    res.writeHead(durum, { ...GUVENLIK, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...basliklar });
    res.end(JSON.stringify(veri));
  }
  async function govde(req) {
    let boy = 0; const parcalar = [];
    for await (const p of req) { boy += p.length; if (boy > 1_000_000) fail('İstek çok büyük.', 413); parcalar.push(p); }
    if (!boy) return {};
    try { return JSON.parse(Buffer.concat(parcalar).toString('utf8')); } catch { fail('İstek okunamadı.'); }
  }
  function dosya(res, yol) {
    const temiz = decodeURIComponent(yol.split('?')[0]);
    let hedef = resolve(staticDir, '.' + (temiz === '/' ? '/index.html' : temiz));
    if (!hedef.startsWith(staticDir + sep) || !existsSync(hedef) || !statSync(hedef).isFile()) hedef = resolve(staticDir, 'index.html');
    res.writeHead(200, { ...GUVENLIK, 'Content-Type': TURLER[extname(hedef)] || 'application/octet-stream', 'Cache-Control': extname(hedef) === '.html' ? 'no-cache' : 'public, max-age=300' });
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
      if (req.method === 'POST' && req.headers['x-dc'] !== '1') fail('Geçersiz istek.', 403);

      if (yol === '/api/durum' && req.method === 'GET') {
        const kur = q1('SELECT ad FROM kurum');
        return json(res, 200, { kurulu: !!q1('SELECT 1 FROM kullanicilar LIMIT 1'), kurum: kur?.ad || '', demo });
      }
      if (yol === '/api/kurulum' && req.method === 'POST') {
        const a = kurulum(await govde(req));
        return json(res, 200, { tamam: true }, { 'Set-Cookie': cerez(a, OTURUM_SURESI / 1000) });
      }
      if (yol === '/api/giris' && req.method === 'POST') {
        const a = personelGiris(await govde(req));
        return json(res, 200, { tamam: true }, { 'Set-Cookie': cerez(a, OTURUM_SURESI / 1000) });
      }
      if (yol === '/api/ogrenci-giris' && req.method === 'POST') {
        const a = ogrenciGiris(await govde(req));
        return json(res, 200, { tamam: true }, { 'Set-Cookie': cerez(a, OTURUM_SURESI / 1000) });
      }
      const ot = oturumBul(req);
      if (yol === '/api/cikis' && req.method === 'POST') {
        if (ot) run('DELETE FROM oturumlar WHERE anahtar=?', ot.anahtar);
        return json(res, 200, { tamam: true }, { 'Set-Cookie': cerez('', 0) });
      }
      if (!ot) fail('Oturum kapalı. Lütfen giriş yapın.', 401);

      if (yol === '/api/ben' && req.method === 'GET') return json(res, 200, { tur: ot.tur });
      if (ot.tur === 'ogrenci') {
        if (yol === '/api/ogrenci' && req.method === 'GET') return json(res, 200, ogrenciVeri(ot.o));
        fail('Bu sayfa için yetkiniz yok.', 403);
      }
      const k = ot.k;
      if (yol === '/api/veri' && req.method === 'GET') return json(res, 200, veri(k));
      if (yol === '/api/islem' && req.method === 'POST') return json(res, 200, { tamam: true, ...islemYap(k, await govde(req)) });
      if (yol === '/api/rapor' && req.method === 'GET') return json(res, 200, rapor(k, url.searchParams.get('bas'), url.searchParams.get('bit')));
      if (yol === '/api/canli' && req.method === 'GET') {
        res.writeHead(200, { ...GUVENLIK, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': baglandi\n\n');
        const d = { res, kapsam: kapsam(k) };
        dinleyiciler.add(d);
        req.on('close', () => dinleyiciler.delete(d));
        return;
      }
      fail('Bulunamadı.', 404);
    } catch (e) {
      if (e instanceof IsHatasi) return json(res, e.durum, { hata: e.message });
      console.error(e);
      return json(res, 500, { hata: 'Beklenmeyen bir hata oldu. Tekrar deneyin.' });
    }
  }

  return {
    handler, db,
    kapat() { clearInterval(nabiz); for (const d of dinleyiciler) d.res.end(); dinleyiciler.clear(); db.close(); },
  };
}

// ---------------------------------------------------------------------------
// ÖRNEK KURUM (yalnız ENABLE_DEMO=1). Bütün kişiler ve numaralar uydurmadır.
// ---------------------------------------------------------------------------
export function tcUret(ilk9) {
  const d = [...String(ilk9)].map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8], cift = d[1] + d[3] + d[5] + d[7];
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return String(ilk9) + d10 + d11;
}
function ornekVeri({ run, islemde, sifreOzet, bugunStr }) {
  const t = new Date().toISOString();
  const gunEkle = (n) => { const d = new Date(bugunStr() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  islemde(() => {
    run('INSERT INTO kurum(id,ad,olusturma) VALUES(1,?,?)', 'Örnek Sürücü Kursu', t);
    const sube = { merkez: 'sube-merkez', cankaya: 'sube-cankaya', kecioren: 'sube-kecioren' };
    run('INSERT INTO subeler VALUES(?,?,?,?,1,1,?)', sube.merkez, 'Merkez', 'Örnek Cad. No:1', '0312 000 00 01', t);
    run('INSERT INTO subeler VALUES(?,?,?,?,0,1,?)', sube.cankaya, 'Çankaya Şubesi', 'Deneme Sok. No:5', '0312 000 00 02', t);
    run('INSERT INTO subeler VALUES(?,?,?,?,0,1,?)', sube.kecioren, 'Keçiören Şubesi', 'Uydurma Bulvarı No:9', '0312 000 00 03', t);
    const s = sifreOzet('Deneme123!');
    const kul = [
      ['k-patron', 'patron', 'Ayşe Patron', 'yonetici', null],
      ['k-mudur', 'mudur', 'Burak Müdür', 'sube_muduru', sube.cankaya],
      ['k-buro', 'buro', 'Canan Büro', 'buro', sube.cankaya],
      ['k-egitmen1', 'egitmen1', 'Deniz Eğitmen', 'egitmen', sube.cankaya],
      ['k-egitmen2', 'egitmen2', 'Emre Eğitmen', 'egitmen', sube.cankaya],
      ['k-egitmen3', 'egitmen3', 'Figen Eğitmen', 'egitmen', sube.kecioren],
      ['k-buro2', 'buro2', 'Gökhan Büro', 'buro', sube.merkez],
    ];
    for (const [id, kad, ad, rol, sb] of kul)
      run("INSERT INTO kullanicilar(id,kullanici_adi,ad,sifre,rol,sube_id,yetkiler,telefon,aktif,olusturma) VALUES(?,?,?,?,?,?,NULL,'',1,?)", id, kad, ad, s, rol, sb, t);
    run("INSERT INTO araclar VALUES('a1',?,'06 DC 001','Örnek Sedan','B',1)", sube.cankaya);
    run("INSERT INTO araclar VALUES('a2',?,'06 DC 002','Örnek Hatchback','B',1)", sube.cankaya);
    run("INSERT INTO araclar VALUES('a3',?,'06 DC 003','Örnek Motosiklet','A2',1)", sube.kecioren);
    run("INSERT INTO araclar VALUES('a4',?,'06 DC 004','Örnek Sedan','B',1)", sube.merkez);
    const ogr = [
      ['o1', sube.cankaya, 'Hakan', 'Deneme', '100000001', 'B', 'k-egitmen1', 1500000, 500000, 2, -40],
      ['o2', sube.cankaya, 'İrem', 'Örnek', '100000002', 'B', 'k-egitmen1', 1500000, 1500000, 0, -60],
      ['o3', sube.cankaya, 'Kerem', 'Uydurma', '100000003', 'B Otomatik', 'k-egitmen2', 1800000, 300000, 3, -70],
      ['o4', sube.kecioren, 'Leyla', 'Deneme', '100000004', 'A2', 'k-egitmen3', 1000000, 200000, 4, -20],
      ['o5', sube.merkez, 'Mert', 'Örnek', '100000005', 'B', null, 1500000, 0, 5, -5],
    ];
    const plan = (toplam, pes, n, bas) => taksitPlani(toplam, pes, n, gunEkle(bas + 30), gunEkle(bas));
    for (const [id, sb, ad, soyad, tc9, sinif, eg, ucret, pes, n, bas] of ogr) {
      run("INSERT INTO ogrenciler VALUES(?,?,?,?,?,?,'','',?,?,'aktif',?,?,?,'',?)", id, sb, ad, soyad, tcUret(tc9), '0500 000 00 0' + id.slice(1), sinif, gunEkle(bas), ucret, eg, id === 'o1' ? sifreOzet('ogrenci1') : null, t);
      for (const x of plan(ucret, pes, n, bas)) run('INSERT INTO taksitler VALUES(?,?,?,?)', randomUUID(), id, x.vade, x.tutar);
      if (pes) run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,'nakit','Peşinat','Örnek',?)", randomUUID(), id, sb, pes, gunEkle(bas), t);
    }
    const ders = (ogrId, sb, eg, arac, tur, gunN, sa, durum) =>
      run('INSERT INTO dersler(id,ogrenci_id,sube_id,egitmen_id,arac_id,tur,tarih,saat,sure_dk,durum,kaydeden,tamamlanma,olusturma) VALUES(?,?,?,?,?,?,?,?,50,?,?,?,?)',
        randomUUID(), ogrId, sb, eg, arac, tur, gunEkle(gunN), sa, durum, 'Örnek', durum === 'planli' ? null : t, t);
    for (let i = 0; i < 6; i++) ders('o1', sube.cankaya, 'k-egitmen1', 'a1', 'direksiyon', -12 + i * 2, '10:00', 'tamamlandi');
    for (let i = 0; i < 14; i++) ders('o2', sube.cankaya, 'k-egitmen1', 'a1', 'direksiyon', -50 + i * 3, '14:00', 'tamamlandi');
    ders('o1', sube.cankaya, 'k-egitmen1', 'a1', 'direksiyon', 0, '10:00', 'planli');
    ders('o3', sube.cankaya, 'k-egitmen2', 'a2', 'direksiyon', 0, '11:00', 'planli');
    ders('o1', sube.cankaya, 'k-egitmen1', 'a1', 'direksiyon', 1, '10:00', 'planli');
    ders('o4', sube.kecioren, 'k-egitmen3', 'a3', 'direksiyon', 0, '15:00', 'planli');
    const sinav = (ogrId, sb, tur, gunN, deneme, sonuc, puan) =>
      run('INSERT INTO sinavlar(id,ogrenci_id,sube_id,tur,tarih,saat,deneme,sonuc,puan,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        randomUUID(), ogrId, sb, tur, gunEkle(gunN), '09:00', deneme, sonuc, puan, 'Örnek', t);
    sinav('o1', sube.cankaya, 'e_sinav', -15, 1, 'kaldi', 62);
    sinav('o1', sube.cankaya, 'e_sinav', -3, 2, 'gecti', 84);
    sinav('o2', sube.cankaya, 'e_sinav', -30, 1, 'gecti', 90);
    sinav('o2', sube.cankaya, 'direksiyon', 3, 1, 'bekliyor', null);
    sinav('o4', sube.kecioren, 'e_sinav', 5, 1, 'bekliyor', null);
    run("INSERT INTO giderler(id,sube_id,tutar,tarih,kategori,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,'Yakıt','Örnek gider','Örnek',?)", randomUUID(), sube.cankaya, 250000, gunEkle(-2), t);
    run("INSERT INTO olaylar(zaman,sube_id,kullanici,tur,metin) VALUES(?,NULL,'Sistem','sistem','Örnek kurum hazırlandı (uydurma veriler)')", t);
  });
}
