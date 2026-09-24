// İnternetten ödeme (karar 15): her kurs kendi sanal POS bilgilerini girer; para doğrudan kursun hesabına geçer.
// Girmeyen kursta ödemeler yalnız kursta alınır.
//
//  - "deneme" sağlayıcısı: gerçek para çekmez; yalnız örnek kurumda ya da POS_DENEME=1 iken seçilebilir.
//  - "paytr" sağlayıcısı: PayTR iFrame API. DİKKAT: gerçek bir PayTR hesabıyla denenmedi; ilk kullanımda
//    PayTR'nin test modunda (Ayarlar > İnternetten ödeme > Deneme modu) denenmelidir.
//
// Ödeme kaydı, öğrencinin tarayıcısından değil yalnız ödeme firmasının imzalı bildiriminden yazılır.
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { fail, kurus, tlYaz } from '../domain.mjs';
import { makbuzNo } from './ogrenci.mjs';

const simdi = () => new Date().toISOString();
const esit = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const hmacB64 = (anahtar, metin) => createHmac('sha256', anahtar).update(metin).digest('base64');
const kacis = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// PayTR iFrame API: istek imzası ve bildirim imzası (PayTR belgelerindeki sırayla).
export function paytrIstekImzasi({ magazaNo, anahtar, gizli }, a) {
  const hashStr = `${magazaNo}${a.ip}${a.oid}${a.eposta}${a.tutar}${a.sepet}${a.taksitsiz}${a.enFazlaTaksit}TL${a.test}`;
  return hmacB64(anahtar, hashStr + gizli);
}
export const paytrBildirimImzasi = ({ anahtar, gizli }, oid, durum, toplam) => hmacB64(anahtar, `${oid}${gizli}${durum}${toplam}`);

// Deneme sayfasındaki düğmelerin imzası için kuruma özel gizli anahtar (ayarlarda değil, ekrana hiç gitmez).
function denemeAnahtari(c) {
  let a = c.q1("SELECT deger FROM sistem_anahtarlari WHERE ad='pos_deneme'")?.deger;
  if (!a) { a = randomBytes(32).toString('hex'); c.run("INSERT OR IGNORE INTO sistem_anahtarlari(ad,deger) VALUES('pos_deneme',?)", a); a = c.q1("SELECT deger FROM sistem_anahtarlari WHERE ad='pos_deneme'").deger; }
  return a;
}

function odemeYaz(c, islem, aciklama) {
  const o = c.q1('SELECT * FROM ogrenciler WHERE id=?', islem.ogrenci_id);
  c.islemde(() => {
    c.run("UPDATE pos_islemleri SET durum='basarili', sonuc_zamani=? WHERE id=?", simdi(), islem.id);
    c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no,pos_islem) VALUES(?,?,?,?,?,'internet',?,?,?,'odeme',?,?)",
      'pos-' + islem.id, o.id, o.sube_id, islem.tutar, c.bugunStr(), aciklama, 'İnternetten ödeme', simdi(), makbuzNo(c), islem.id);
  });
  const fazla = c.hesap(o).kalan < 0;
  c.olayYayinla({ ad: `${o.ad} ${o.soyad} (öğrenci)` }, o.sube_id, 'odeme',
    `${o.ad} ${o.soyad} internetten kartla ödedi: ${tlYaz(islem.tutar)}${fazla ? ' · DİKKAT: borçtan fazla ödeme, iade gerekebilir' : ''}`);
}

export default {
  ad: 'pos',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS pos_islemleri(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tutar INTEGER NOT NULL, saglayici TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'bekliyor', hata TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL, sonuc_zamani TEXT);
CREATE TABLE IF NOT EXISTS sistem_anahtarlari(ad TEXT PRIMARY KEY, deger TEXT NOT NULL);`);
  },

  ogrenciVeri(c, o, v) {
    const p = c.ayar().pos;
    v.pos = { acik: !!(p.acik && p.saglayici && (p.saglayici !== 'deneme' || c.posDeneme)) };
  },

  async ogrenciYol(c, o, { yontem, yol, govde, ip, koken, firmaKodu }) {
    if (yol !== '/api/pos-baslat' || yontem !== 'POST') return null;
    const kayit = c.q1('SELECT * FROM ogrenciler WHERE id=?', o.id);
    if (kayit.portal_sifre_gecici) fail('Önce kendi şifrenizi belirleyin.', 403);
    const p = c.ayar().pos;
    if (!p.acik || !p.saglayici) fail('Kursunuz internetten ödeme almıyor.');
    if (p.saglayici === 'deneme' && !c.posDeneme) fail('Deneme ödemesi bu kurumda kapalı.');
    const tutar = kurus(govde.tutar, 'Tutar', false);
    const kalan = c.hesap(kayit).kalan;
    if (tutar > kalan) fail(`Tutar kalan borcunuzdan (${tlYaz(kalan)}) büyük olamaz.`);
    if (tutar < 100) fail('En az 1 ₺ ödenebilir.');
    const oid = 'DC' + Date.now().toString(36).toUpperCase() + randomBytes(4).toString('hex').toUpperCase();
    c.run('INSERT INTO pos_islemleri(id,ogrenci_id,sube_id,tutar,saglayici,durum,olusturma) VALUES(?,?,?,?,?,?,?)', oid, kayit.id, kayit.sube_id, tutar, p.saglayici, 'bekliyor', simdi());

    if (p.saglayici === 'deneme') return { durum: 200, veri: { adres: `/api/pos-deneme?firma=${encodeURIComponent(firmaKodu)}&no=${oid}` } };

    // PayTR: ödeme sayfası için anahtar (token) alınır; öğrenci PayTR'nin güvenli sayfasında kart bilgisini girer.
    const a = {
      ip: ip || '127.0.0.1', oid, eposta: kayit.eposta || `ogrenci-${kayit.id.slice(0, 8)}@ornek.invalid`, tutar: String(tutar),
      sepet: Buffer.from(JSON.stringify([['Sürücü kursu ödemesi', (tutar / 100).toFixed(2), 1]])).toString('base64'),
      taksitsiz: '1', enFazlaTaksit: '0', test: p.deneme ? '1' : '0',
    };
    const form = new URLSearchParams({
      merchant_id: p.magazaNo, user_ip: a.ip, merchant_oid: oid, email: a.eposta, payment_amount: a.tutar, paytr_token: paytrIstekImzasi(p, a),
      user_basket: a.sepet, debug_on: '0', no_installment: a.taksitsiz, max_installment: a.enFazlaTaksit, user_name: `${kayit.ad} ${kayit.soyad}`,
      user_address: kayit.adres || '-', user_phone: kayit.telefon || '-', merchant_ok_url: `${koken}/?odeme=tamam`, merchant_fail_url: `${koken}/?odeme=hata`,
      timeout_limit: '30', currency: 'TL', test_mode: a.test, lang: 'tr',
    });
    let cevap;
    try {
      const r = await c.disIstek('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
      cevap = await r.json();
    } catch {
      c.run("UPDATE pos_islemleri SET durum='basarisiz', hata='baglanti' WHERE id=?", oid);
      fail('Ödeme sistemine ulaşılamadı. Biraz sonra tekrar deneyin.', 502);
    }
    if (cevap?.status !== 'success' || !cevap.token) {
      c.run("UPDATE pos_islemleri SET durum='basarisiz', hata=? WHERE id=?", String(cevap?.reason || 'bilinmiyor').slice(0, 200), oid);
      fail('Ödeme başlatılamadı. Kursunuza haber verin.', 502);
    }
    return { durum: 200, veri: { adres: `https://www.paytr.com/odeme/guvenli/${cevap.token}` } };
  },

  acikYol(c, { yontem, yol, sorgu, govde, firmaKodu, saglayici }) {
    // Deneme ödeme sayfası (gerçek para yok). Yalnız izinli kurumda.
    if (yol === '/api/pos-deneme' && yontem === 'GET') {
      if (!c.posDeneme) fail('Bulunamadı.', 404);
      const x = c.q1('SELECT * FROM pos_islemleri WHERE id=?', String(sorgu.get('no') || ''));
      if (!x) fail('Ödeme bulunamadı.', 404);
      const imza = hmacB64(denemeAnahtari(c), x.id);
      const dugme = (durum, yazi) => `<form method="post" action="/api/pos-bildirim/${kacis(firmaKodu)}/deneme"><input type="hidden" name="no" value="${kacis(x.id)}"><input type="hidden" name="durum" value="${durum}"><input type="hidden" name="imza" value="${kacis(imza)}"><button>${yazi}</button></form>`;
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Deneme ödeme</title>
<body style="font-family:system-ui;padding:20px"><h2>Deneme ödeme sayfası</h2><p>Gerçek para çekilmez. Tutar: <b>${kacis(tlYaz(x.tutar))}</b></p>
${x.durum === 'bekliyor' ? dugme('success', 'Ödeme başarılı') + '<br>' + dugme('failed', 'Kart reddedildi') : `<p>Bu ödeme sonuçlandı: ${kacis(x.durum)}</p>`}</body>`;
      return { durum: 200, ham: { basliklar: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'" }, govde: html } };
    }
    if (yol !== '/api/pos-bildirim' || yontem !== 'POST') return null;
    const p = c.ayar().pos;
    const tamam = (metin = 'OK') => ({ durum: 200, ham: { basliklar: { 'Content-Type': 'text/plain; charset=utf-8' }, govde: metin } });

    if (saglayici === 'deneme') {
      if (!c.posDeneme) fail('Bulunamadı.', 404);
      const x = c.q1('SELECT * FROM pos_islemleri WHERE id=?', String(govde.no || ''));
      if (!x || !esit(govde.imza, hmacB64(denemeAnahtari(c), x.id))) fail('İmza geçersiz.', 403);
      if (x.durum === 'bekliyor') {
        if (govde.durum === 'success') odemeYaz(c, x, `İnternetten kart (deneme) · ${x.id}`);
        else c.run("UPDATE pos_islemleri SET durum='basarisiz', hata='deneme red', sonuc_zamani=? WHERE id=?", simdi(), x.id);
      }
      const sonuc = govde.durum === 'success' ? 'Ödemeniz alındı. Bu pencereyi kapatabilirsiniz.' : 'Ödeme yapılamadı.';
      return { durum: 200, ham: { basliklar: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'" },
        govde: `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:20px"><h2>${sonuc}</h2></body>` } };
    }
    if (saglayici === 'paytr') {
      if (p.saglayici !== 'paytr' || !p.gizli) fail('Bulunamadı.', 404);
      const { merchant_oid: oid, status, total_amount: toplam, hash } = govde;
      if (!oid || !esit(hash, paytrBildirimImzasi(p, oid, status, toplam))) fail('İmza geçersiz.', 403);
      const x = c.q1('SELECT * FROM pos_islemleri WHERE id=?', String(oid));
      // PayTR aynı bildirimi birden çok gönderebilir; her durumda "OK" beklenir.
      if (!x || x.durum !== 'bekliyor') return tamam();
      if (status === 'success') odemeYaz(c, x, `İnternetten kart (PayTR) · ${x.id}`);
      else c.run("UPDATE pos_islemleri SET durum='basarisiz', hata=?, sonuc_zamani=? WHERE id=?", String(govde.failed_reason_msg || '').slice(0, 200), simdi(), x.id);
      return tamam();
    }
    fail('Bulunamadı.', 404);
  },
};
