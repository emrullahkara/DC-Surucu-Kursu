// Bir kurs firmasının bütün iş kuralları. Her firma kendi veritabanında yaşar; bir firmanın
// kullanıcısı başka firmanın hiçbir bilgisine ulaşamaz (ayrı dosya, ayrı oturum tablosu).
//
// Yetki kuralları BURADA uygulanır. Ekranda gizlemek yeterli sayılmaz: bir kullanıcının görmemesi
// gereken bilgi sunucudan hiç gönderilmez.
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { IsHatasi, fail, metin, gun, bugun, SINIFLAR, SINAV_HAKKI, tcMaskele, hesapDurumu } from './domain.mjs';
import temel from './moduller/temel.mjs';
import ogrenci from './moduller/ogrenci.mjs';
import para from './moduller/para.mjs';
import ders from './moduller/ders.mjs';
import sinav from './moduller/sinav.mjs';
import rapor from './moduller/rapor.mjs';
import donem from './moduller/donem.mjs';

export const MODULLER = [temel, donem, ogrenci, para, ders, sinav, rapor];

// ---------------------------------------------------------------------------
// ROLLER VE YETKİLER
//  yonetici     : kurum sahibi / merkez. Bütün şubeler, bütün yetkiler.
//  sube_muduru  : yalnız kendi şubesi, o şubede bütün yetkiler.
//  buro         : kendi şubesinde kayıt, tahsilat, ders ve sınav işleri (ayarlanabilir).
//  muhasebe     : kendi şubesinde (merkezdeyse bütün şubelerde değil) tahsilat, kasa ve raporlar.
//  egitmen      : yalnız kendisine bağlı öğrenciler ve kendi dersleri. Para bilgisi görmez.
//  (öğrenci ayrı kapıdan girer, yalnız kendi bilgisini görür.)
// ---------------------------------------------------------------------------
export const HAKLAR = {
  kayit: 'Öğrenci kaydı ve düzenleme',
  hassas: 'T.C. kimlik no, adres, doğum tarihi görme',
  evrak: 'Öğrenci evraklarını görme ve yükleme',
  tahsilat: 'Ödeme alma ve öğrenci borçlarını görme',
  kasa: 'Gider, tedarikçi, ödeme iptali, indirim ve iade',
  ders: 'Bütün öğrencilere ders planlama',
  sinav: 'Sınav kaydı ve sonuç girme',
  rapor: 'Raporlar ve Excel',
  personel: 'Personel ve araç yönetimi',
};
export const TUM_HAKLAR = Object.keys(HAKLAR);
export const ROLLER = { yonetici: 'Yönetici (Merkez)', sube_muduru: 'Şube müdürü', buro: 'Büro personeli', muhasebe: 'Muhasebe', egitmen: 'Eğitmen' };
const ROL_VARSAYILAN = {
  buro: ['kayit', 'hassas', 'evrak', 'tahsilat', 'ders', 'sinav'],
  muhasebe: ['tahsilat', 'kasa', 'rapor'],
  egitmen: [],
};
// Personel yönetimi yalnız müdür ve yöneticidedir; başkasına verilemez.
export const VERILEBILIR = TUM_HAKLAR.filter((h) => h !== 'personel');

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
const ZAYIF = new Set(['12345678', '123456789', 'password', 'parola123', 'sifre123', 'qwerty123', '11111111', 'abcd1234', 'admin123', 'deneme123', '123456', '111111', '000000', 'abc123']);
export function sifreKontrol(v, enAz = 8) {
  const s = metin(v, 200, true, 'Şifre');
  if (s.length < enAz) fail(`Şifre en az ${enAz} karakter olmalı.`);
  if (ZAYIF.has(s.toLocaleLowerCase('tr-TR'))) fail('Bu şifre çok yaygın, başka bir şifre seçin.');
  if (enAz >= 8 && /^\d+$/.test(s)) fail('Şifre yalnızca rakamlardan oluşamaz.');
  if (/^(.)\1+$/.test(s)) fail('Şifre aynı karakterin tekrarından oluşamaz.');
  return s;
}
export function sifreOzet(s) {
  const tuz = randomBytes(16).toString('hex');
  return tuz + ':' + scryptSync(s, tuz, 32).toString('hex');
}
export function sifreDogru(s, kayitli) {
  try {
    const [tuz, h] = String(kayitli).split(':');
    return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(String(s), tuz, 32));
  } catch { return false; }
}
const ozet = (v) => createHash('sha256').update(v).digest('hex');

// ---------------------------------------------------------------------------
// AYARLAR (yönetici değiştirir)
// ---------------------------------------------------------------------------
export const VARSAYILAN_AYAR = {
  siniflar: SINIFLAR,
  sinavHakki: SINAV_HAKKI,
  eSinavGecme: 70,
  dersSuresi: 50,
  konumKaydi: false,
  ogrenciDersSecimi: { acik: true, bas: '09:00', bit: '18:00', enErkenGun: 1, enGecGun: 14 },
  prim: { direksiyon: 0, teorik: 0 },
  ucretler: { ekDers: 0, sinavTekrar: 0 },
  kurum: { adres: '', telefon: '', vergiDairesi: '', vergiNo: '', logo: '' },
  sozlesmeMetni: '',
  sms: { acik: false, saglayici: '', baslik: '' },
  pos: { acik: false, saglayici: '', magazaNo: '', anahtar: '', gizli: '', deneme: true },
};

const TEMEL_SEMA = `
CREATE TABLE IF NOT EXISTS kurum(id INTEGER PRIMARY KEY CHECK(id=1), ad TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ayarlar(anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subeler(id TEXT PRIMARY KEY, ad TEXT NOT NULL, adres TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
  merkez INTEGER NOT NULL DEFAULT 0, aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kullanicilar(id TEXT PRIMARY KEY, kullanici_adi TEXT NOT NULL UNIQUE COLLATE NOCASE, ad TEXT NOT NULL,
  sifre TEXT NOT NULL, rol TEXT NOT NULL, sube_id TEXT REFERENCES subeler(id), yetkiler TEXT, telefon TEXT NOT NULL DEFAULT '',
  aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS olaylar(id INTEGER PRIMARY KEY AUTOINCREMENT, zaman TEXT NOT NULL, sube_id TEXT, kullanici TEXT NOT NULL,
  tur TEXT NOT NULL, metin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oturumlar(anahtar TEXT PRIMARY KEY, tur TEXT NOT NULL, kimlik TEXT NOT NULL, bitis INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS giris_denemeleri(anahtar TEXT PRIMARY KEY, sayi INTEGER NOT NULL, kilit_bitis INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS islem_kayit(istek_no TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL, sonuc TEXT NOT NULL, zaman TEXT NOT NULL);
`;

const OTURUM_SURESI = 12 * 3600 * 1000;
const KILIT_SINIRI = 5;
const KILIT_SURESI = 15 * 60 * 1000;
export const simdi = () => new Date().toISOString();
export const adSoyad = (o) => `${o.ad} ${o.soyad}`;

// Bütün firma şeması: temel + modüllerin tabloları. Bulut sürümü de bunu kullanır.
export function semaKur(db) {
  db.exec(TEMEL_SEMA);
  for (const m of MODULLER) m.sema?.(db);
}

// ---------------------------------------------------------------------------
// FİRMA MOTORU
// ---------------------------------------------------------------------------
export function firmaAc({ db, saatKaynagi = () => new Date(), rastgele = randomBytes, limit = () => ({ maxSube: 1000 }) } = {}) {
  semaKur(db);
  const { q, q1, run, islemde } = db;
  const bugunStr = () => bugun(saatKaynagi());

  // Canlı bildirim: sahadan girilen kayıt merkezin ekranına anında düşer.
  // Her dinleyici kendi kapsamındaki (şubesindeki) olayları alır.
  const dinleyiciler = new Set();
  function yayinla(olay) {
    for (const d of dinleyiciler) if (d.kapsam === null || d.kapsam === olay.sube_id || (d.egitmen && olay.egitmen === d.egitmen)) d.yaz(olay);
  }
  function olayYaz(k, subeId, tur, yazi, ek = {}) {
    const zaman = simdi();
    const r = run('INSERT INTO olaylar(zaman,sube_id,kullanici,tur,metin) VALUES(?,?,?,?,?)', zaman, subeId, k.ad, tur, yazi);
    return { id: Number(r.lastInsertRowid), zaman, sube_id: subeId, kullanici: k.ad, tur, metin: yazi, ...ek };
  }

  function ayar() {
    const a = structuredClone(VARSAYILAN_AYAR);
    for (const { anahtar, deger } of q('SELECT * FROM ayarlar')) {
      try {
        const v = JSON.parse(deger);
        a[anahtar] = v && typeof v === 'object' && !Array.isArray(v) && a[anahtar] && typeof a[anahtar] === 'object' ? { ...a[anahtar], ...v } : v;
      } catch { /* bozuk ayar yok sayılır */ }
    }
    return a;
  }
  const ayarYaz = (anahtar, deger) =>
    run('INSERT INTO ayarlar(anahtar,deger) VALUES(?,?) ON CONFLICT(anahtar) DO UPDATE SET deger=excluded.deger', anahtar, JSON.stringify(deger));

  // -------------------------------------------------------------------------
  // KAPSAM (hangi şube)
  // -------------------------------------------------------------------------
  const kapsam = (k) => (k.rol === 'yonetici' ? null : k.sube_id);
  function subeIzinli(k, subeId) {
    if (!subeId) fail('Şube seçin.');
    const s = q1('SELECT * FROM subeler WHERE id=?', String(subeId));
    if (!s) fail('Şube bulunamadı.', 404);
    if (k.rol !== 'yonetici' && subeId !== k.sube_id) fail('Bu şube için yetkiniz yok.', 403);
    return s;
  }
  const hak = (k, h) => etkinHaklar(k).includes(h);
  function hakGerek(k, h) {
    if (!hak(k, h)) fail(`Bu işlem için yetkiniz yok (${HAKLAR[h]}).`, 403);
  }
  // Eğitmen, "ders" veya "kayit" hakkı yoksa yalnız kendisine bağlı ya da kendisine ders verilmiş öğrencileri görür.
  const egitmenKisitli = (k) => k.rol === 'egitmen' && !hak(k, 'ders') && !hak(k, 'kayit');
  function ogrenciGorebilir(k, o) {
    if (egitmenKisitli(k))
      return o.egitmen_id === k.id || !!q1('SELECT 1 FROM dersler WHERE ogrenci_id=? AND egitmen_id=? LIMIT 1', o.id, k.id);
    return k.rol === 'yonetici' || o.sube_id === k.sube_id;
  }
  function ogrenciAl(k, id) {
    const o = q1('SELECT * FROM ogrenciler WHERE id=?', metin(id, 60, true, 'Öğrenci'));
    if (!o || !ogrenciGorebilir(k, o)) fail('Öğrenci bulunamadı.', 404);
    return o;
  }
  // Eğitmen kendi şubesinde ya da merkezin o gün için görevlendirdiği şubede ders verebilir.
  function gorevli(egitmenId, subeId, tarih) {
    return !!q1('SELECT 1 FROM gorevlendirmeler WHERE kullanici_id=? AND sube_id=? AND bas<=? AND bit>=?', egitmenId, subeId, tarih, tarih);
  }
  function egitmenAl(subeId, id, tarih = bugunStr()) {
    if (!id) return null;
    const e = q1("SELECT * FROM kullanicilar WHERE id=? AND rol IN ('egitmen','sube_muduru','yonetici') AND aktif=1", String(id));
    if (!e) fail('Eğitmen bulunamadı.');
    if (e.rol !== 'yonetici' && e.sube_id !== subeId && !gorevli(e.id, subeId, tarih)) fail(`${e.ad} bu şubede çalışmıyor (görevlendirme de yok).`);
    return e;
  }
  function aracAl(subeId, id) {
    if (!id) return null;
    const a = q1('SELECT * FROM araclar WHERE id=? AND aktif=1', String(id));
    if (!a || a.sube_id !== subeId) fail('Araç bu şubede bulunamadı.');
    return a;
  }

  // Öğrencinin borcu: paket ücret + ek kalemler - indirimler; ödenen: ödemeler - iadeler.
  const odenenToplam = (ogrId) =>
    q1("SELECT COALESCE(SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END),0) t FROM odemeler WHERE ogrenci_id=? AND iptal=0", ogrId).t;
  const kalemToplam = (ogrId) => q1('SELECT COALESCE(SUM(tutar),0) t FROM ucret_kalemleri WHERE ogrenci_id=? AND iptal=0', ogrId).t;
  function hesap(o) {
    const kalemler = q('SELECT id,tur,aciklama,tutar,tarih,iptal FROM ucret_kalemleri WHERE ogrenci_id=? ORDER BY tarih', o.id);
    const taksitler = q('SELECT vade,tutar FROM taksitler WHERE ogrenci_id=? ORDER BY vade', o.id);
    // Ek kalemler ekleneceği gün vadelidir; indirim (eksi tutar) en son taksitten düşülür.
    const plan = taksitler.slice();
    for (const x of kalemler) if (!x.iptal && x.tutar > 0) plan.push({ vade: x.tarih, tutar: x.tutar, ek: x.aciklama });
    let indirim = -kalemler.filter((x) => !x.iptal && x.tutar < 0).reduce((a, x) => a + x.tutar, 0);
    plan.sort((a, b) => (a.vade < b.vade ? -1 : a.vade > b.vade ? 1 : 0));
    for (let i = plan.length - 1; i >= 0 && indirim > 0; i--) {
      const d = Math.min(plan[i].tutar, indirim);
      plan[i] = { ...plan[i], tutar: plan[i].tutar - d };
      indirim -= d;
    }
    const h = hesapDurumu(o.ucret + kalemToplam(o.id), plan.filter((p) => p.tutar > 0), odenenToplam(o.id), bugunStr());
    return { ...h, paket: o.ucret, kalemler };
  }

  function dersSayaci(ogrId) {
    const r = q("SELECT tur, COUNT(*) n FROM dersler WHERE ogrenci_id=? AND durum='tamamlandi' GROUP BY tur", ogrId);
    const s = { teorik: 0, direksiyon: 0 };
    for (const x of r) s[x.tur] = x.n;
    s.teorik += q1("SELECT COALESCE(SUM(t.ders_saati),0) n FROM yoklamalar y JOIN teorik_oturumlar t ON t.id=y.oturum_id WHERE y.ogrenci_id=? AND y.durum='geldi' AND t.durum!='iptal'", ogrId).n;
    return s;
  }

  const ctx = {
    db, q, q1, run, islemde, bugunStr, saatKaynagi, simdi, ayar, ayarYaz, kapsam, subeIzinli, hak, hakGerek, egitmenKisitli,
    ogrenciGorebilir, ogrenciAl, egitmenAl, aracAl, gorevli, hesap, odenenToplam, dersSayaci, olayYaz, etkinHaklar,
    HAKLAR, ROLLER, VERILEBILIR, sifreKontrol, sifreOzet, sifreDogru, tcMaskele, limit,
  };

  // -------------------------------------------------------------------------
  // PERSONEL EKRANI İÇİN VERİ (yetkiye göre süzülmüş)
  // -------------------------------------------------------------------------
  function veri(k) {
    const h = etkinHaklar(k);
    const a = ayar();
    const v = {
      ben: { id: k.id, ad: k.ad, rol: k.rol, sube_id: k.sube_id, haklar: h, kullanici_adi: k.kullanici_adi, totp: !!k.totp_gizli },
      kurum: { ad: q1('SELECT ad FROM kurum')?.ad || '', ...a.kurum },
      bugun: bugunStr(),
      tanimlar: { haklar: HAKLAR, roller: ROLLER, siniflar: a.siniflar, sinavHakki: a.sinavHakki, eSinavGecme: a.eSinavGecme, dersSuresi: a.dersSuresi, konumKaydi: a.konumKaydi },
    };
    // Ayarların tamamı (sanal POS gizli anahtarı hariç) yalnız yöneticiye gider.
    if (k.rol === 'yonetici') v.ayarlar = { ...a, pos: { ...a.pos, gizli: a.pos.gizli ? '••••••' : '' } };
    for (const m of MODULLER) m.veri?.(ctx, k, v);
    return v;
  }

  function ogrenciVeri(o) {
    const a = ayar();
    const sube = q1('SELECT ad,telefon,adres FROM subeler WHERE id=?', o.sube_id);
    const egitmen = o.egitmen_id ? q1('SELECT ad FROM kullanicilar WHERE id=?', o.egitmen_id) : null;
    const v = {
      kurum: { ad: q1('SELECT ad FROM kurum')?.ad || '', logo: a.kurum.logo, telefon: a.kurum.telefon },
      bugun: bugunStr(),
      ben: { ad: o.ad, soyad: o.soyad, sinif: o.sinif, sinif_ad: a.siniflar[o.sinif]?.ad || o.sinif, durum: o.durum,
        kayit_tarihi: o.kayit_tarihi, sube: sube?.ad, sube_telefon: sube?.telefon, sube_adres: sube?.adres, egitmen: egitmen?.ad || '',
        sifreDegismeli: !!o.portal_sifre_gecici },
      gerekli: a.siniflar[o.sinif] || null, sayac: dersSayaci(o.id), sinavHakki: a.sinavHakki,
      hesap: hesap(o),
    };
    for (const m of MODULLER) m.ogrenciVeri?.(ctx, o, v);
    return v;
  }

  // -------------------------------------------------------------------------
  // İŞLEMLER
  // -------------------------------------------------------------------------
  const ISLEMLER = {};
  const OGRENCI_ISLEMLERI = {};
  for (const m of MODULLER) {
    Object.assign(ISLEMLER, m.islemler || {});
    Object.assign(OGRENCI_ISLEMLERI, m.ogrenciIslemleri || {});
  }
  ISLEMLER.sifre_degistir = (c, k, g) => {
    const p = q1('SELECT * FROM kullanicilar WHERE id=?', k.id);
    if (!sifreDogru(g.eskiSifre, p.sifre)) fail('Mevcut şifre yanlış.');
    run('UPDATE kullanicilar SET sifre=? WHERE id=?', sifreOzet(sifreKontrol(g.yeniSifre)), k.id);
    return { olay: [k.sube_id, 'personel', `${k.ad} şifresini değiştirdi`] };
  };

  function calistir(tablo, k, g, kimlikNo) {
    const tur = String(g?.islem || '');
    const f = Object.hasOwn(tablo, tur) ? tablo[tur] : null;
    if (!f) fail('Bilinmeyen işlem.');
    // Sahadan internet kopukken sıraya alınmış istek iki kez gelirse ikincisi aynı cevabı alır, çift kayıt olmaz.
    const istekNo = g.istekNo ? metin(g.istekNo, 80, false, 'İstek no') : '';
    const sonuc = islemde(() => {
      if (istekNo) {
        const onceki = q1('SELECT sonuc, kullanici_id FROM islem_kayit WHERE istek_no=?', istekNo);
        if (onceki && onceki.kullanici_id === kimlikNo) return { sonuc: JSON.parse(onceki.sonuc) };
        if (onceki) fail('İstek numarası kullanılmış.');
      }
      const r = f(ctx, k, g) || {};
      const olaylar = [];
      if (r.olay) olaylar.push(olayYaz(k, r.olay[0], r.olay[1], r.olay[2], r.olay[3] || {}));
      for (const o of r.ekOlaylar || []) olaylar.push(olayYaz(k, o[0], o[1], o[2], o[3] || {}));
      const cevap = r.sonuc || {};
      if (istekNo) run('INSERT INTO islem_kayit(istek_no,kullanici_id,sonuc,zaman) VALUES(?,?,?,?)', istekNo, kimlikNo, JSON.stringify(cevap), simdi());
      return { sonuc: cevap, olaylar };
    });
    for (const o of sonuc.olaylar || []) yayinla(o);
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
    const sayi = (d && d.kilit_bitis > 0 && d.kilit_bitis <= Date.now() ? 0 : d?.sayi || 0) + 1;
    const kilit = sayi >= KILIT_SINIRI ? Date.now() + KILIT_SURESI : 0;
    run('INSERT INTO giris_denemeleri(anahtar,sayi,kilit_bitis) VALUES(?,?,?) ON CONFLICT(anahtar) DO UPDATE SET sayi=excluded.sayi, kilit_bitis=excluded.kilit_bitis', anahtar, kilit ? 0 : sayi, kilit);
  }
  function oturumAc(tur, kimlik) {
    const anahtar = rastgele(32).toString('base64url');
    run('DELETE FROM oturumlar WHERE bitis<?', Date.now());
    run('INSERT INTO oturumlar(anahtar,tur,kimlik,bitis) VALUES(?,?,?,?)', ozet(anahtar), tur, kimlik, Date.now() + OTURUM_SURESI);
    return { deger: anahtar, yas: OTURUM_SURESI / 1000 };
  }
  function personelGiris(g) {
    const kad = metin(g.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
    const anahtar = 'p:' + kad;
    denemeKontrol(anahtar);
    const k = q1('SELECT * FROM kullanicilar WHERE kullanici_adi=?', kad);
    if (!k || !sifreDogru(g.sifre, k.sifre) || !k.aktif) { hataliDeneme(anahtar); fail('Kullanıcı adı veya şifre hatalı.', 401); }
    const kapi = g.kapi === 'yonetici' ? 'yonetici' : 'personel';
    const yoneticiRol = ['yonetici', 'sube_muduru'].includes(k.rol);
    if (kapi === 'yonetici' && !yoneticiRol) fail('Bu hesap personel hesabıdır. "Personel girişi" bölümünü kullanın.', 403);
    if (kapi === 'personel' && yoneticiRol) fail('Bu hesap yetkili hesabıdır. "Yetkili girişi" bölümünü kullanın.', 403);
    if (k.sube_id && !q1('SELECT aktif FROM subeler WHERE id=?', k.sube_id)?.aktif) fail('Şubeniz kapalı olduğu için giriş yapılamıyor.', 403);
    // İsteğe bağlı ek doğrulama kodu (Authenticator). Açmayan kullanıcı bugünkü gibi girer.
    const ek = MODULLER.map((m) => m.girisEkKontrol?.(ctx, k, g)).find(Boolean);
    if (ek === 'kod_gerekli') return { kodGerekli: true };
    if (ek === 'kod_yanlis') { hataliDeneme(anahtar); fail('Doğrulama kodu hatalı.', 401); }
    run('DELETE FROM giris_denemeleri WHERE anahtar=?', anahtar);
    return { oturum: oturumAc('personel', k.id) };
  }
  function ogrenciGiris(g) {
    const tc = metin(g.tc, 11, true, 'T.C. kimlik no');
    const anahtar = 'o:' + tc;
    denemeKontrol(anahtar);
    const adaylar = q("SELECT * FROM ogrenciler WHERE tc=? AND portal_sifre IS NOT NULL AND durum!='iptal' ORDER BY kayit_tarihi DESC", tc);
    const o = adaylar.find((x) => sifreDogru(g.sifre, x.portal_sifre));
    if (!o) { hataliDeneme(anahtar); fail('T.C. kimlik no veya şifre hatalı.', 401); }
    run('DELETE FROM giris_denemeleri WHERE anahtar=?', anahtar);
    return { oturum: oturumAc('ogrenci', o.id) };
  }
  function oturumBul(anahtar) {
    if (!anahtar) return null;
    const o = q1('SELECT * FROM oturumlar WHERE anahtar=?', ozet(anahtar));
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

  // Firma ilk açıldığında: kurum, merkez şube ve ilk yönetici. Platform yönetimi çağırır.
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
  }

  // -------------------------------------------------------------------------
  // İSTEK KARŞILAMA (sunucudan bağımsız). istek: {yontem, yol, sorgu, oturum, govde}
  // Dönüş: {durum, veri, oturum?: {deger, yas} | null (çıkış)}
  // -------------------------------------------------------------------------
  function istek({ yontem, yol, sorgu = new URLSearchParams(), oturum, govde = {}, firmaKodu = '' }) {
    ctx.firmaKodu = firmaKodu;
    try {
      if (yol === '/api/durum' && yontem === 'GET') {
        return { durum: 200, veri: { kurulu: !!q1('SELECT 1 FROM kullanicilar LIMIT 1'), kurum: q1('SELECT ad FROM kurum')?.ad || '', logo: ayar().kurum.logo } };
      }
      if (yol === '/api/giris' && yontem === 'POST') {
        const r = personelGiris(govde);
        return r.kodGerekli ? { durum: 200, veri: { kodGerekli: true } } : { durum: 200, veri: { tamam: true }, oturum: r.oturum };
      }
      if (yol === '/api/ogrenci-giris' && yontem === 'POST') {
        const r = ogrenciGiris(govde);
        return { durum: 200, veri: { tamam: true }, oturum: r.oturum };
      }
      const ot = oturumBul(oturum);
      if (yol === '/api/cikis' && yontem === 'POST') {
        if (ot) run('DELETE FROM oturumlar WHERE anahtar=?', ot.anahtar);
        return { durum: 200, veri: { tamam: true }, oturum: null };
      }
      if (!ot) fail('Oturum kapalı. Lütfen giriş yapın.', 401);
      if (yol === '/api/ben' && yontem === 'GET') return { durum: 200, veri: { tur: ot.tur } };

      if (ot.tur === 'ogrenci') {
        if (yol === '/api/ogrenci' && yontem === 'GET') return { durum: 200, veri: ogrenciVeri(ot.o) };
        if (yol === '/api/ogrenci-islem' && yontem === 'POST') {
          // Kursun verdiği ilk şifreyle giren öğrenci, kendi şifresini belirlemeden başka işlem yapamaz.
          if (ot.o.portal_sifre_gecici && govde.islem !== 'ogrenci_sifre') fail('Önce kendi şifrenizi belirleyin.', 403);
          const kisi = { ...ot.o, ad: `${ot.o.ad} ${ot.o.soyad} (öğrenci)`, ogrenci: true };
          return { durum: 200, veri: { tamam: true, ...calistir(OGRENCI_ISLEMLERI, kisi, govde, 'o:' + ot.o.id) } };
        }
        for (const m of MODULLER) {
          const r = m.ogrenciYol?.(ctx, ot.o, { yontem, yol, sorgu });
          if (r) return r;
        }
        fail('Bu sayfa için yetkiniz yok.', 403);
      }
      const k = ot.k;
      if (yol === '/api/veri' && yontem === 'GET') return { durum: 200, veri: veri(k) };
      if (yol === '/api/islem' && yontem === 'POST') return { durum: 200, veri: { tamam: true, ...calistir(ISLEMLER, k, govde, k.id) } };
      for (const m of MODULLER) {
        const r = m.yol?.(ctx, k, { yontem, yol, sorgu });
        if (r) return r;
      }
      fail('Bulunamadı.', 404);
    } catch (e) {
      if (e instanceof IsHatasi) return { durum: e.durum, veri: { hata: e.message } };
      console.error(e);
      return { durum: 500, veri: { hata: 'Beklenmeyen bir hata oldu. Tekrar deneyin.' } };
    }
  }

  // Canlı akışa abone ol. Oturum geçersizse null döner.
  function abone(oturum, yaz) {
    const ot = oturumBul(oturum);
    if (!ot || ot.tur !== 'personel') return null;
    const d = { kapsam: kapsam(ot.k), egitmen: egitmenKisitli(ot.k) ? ot.k.id : null, yaz };
    if (d.egitmen) d.kapsam = ot.k.sube_id;
    dinleyiciler.add(d);
    return () => dinleyiciler.delete(d);
  }

  return {
    istek, abone, kurulum, ctx,
    dinleyiciSayisi: () => dinleyiciler.size,
    kapat() { dinleyiciler.clear(); db.kapat?.(); },
  };
}

export { gun };
