// Para: tahsilat, iade, ek ücret kalemleri ve indirim, giderler, tedarikçi borçları, şube kasası gün sonu.
// Tutarlar kuruştur. Hiçbir para kaydı silinmez; yanlış kayıt "iptal" edilir ve nedeni saklanır.
import { randomUUID } from 'node:crypto';
import { fail, metin, kurus, gun, secim, tlYaz } from '../domain.mjs';
import { makbuzNo } from './ogrenci.mjs';
import { hesapAl } from './banka.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;
export const YONTEMLER = ['nakit', 'kart', 'havale', 'internet'];
export const KALEM_TURLERI = { ek_ders: 'Ek direksiyon dersi', sinav_tekrar: 'Sınav tekrar ücreti', diger: 'Diğer ücret', indirim: 'İndirim' };

export default {
  ad: 'para',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS odemeler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tutar INTEGER NOT NULL, tarih TEXT NOT NULL, yontem TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL,
  iptal INTEGER NOT NULL DEFAULT 0, iptal_nedeni TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL,
  tur TEXT NOT NULL DEFAULT 'odeme', makbuz_no TEXT NOT NULL DEFAULT '', pos_islem TEXT);
CREATE INDEX IF NOT EXISTS odeme_ogr ON odemeler(ogrenci_id);
CREATE TABLE IF NOT EXISTS ucret_kalemleri(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tur TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', tutar INTEGER NOT NULL, tarih TEXT NOT NULL, kaydeden TEXT NOT NULL,
  iptal INTEGER NOT NULL DEFAULT 0, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tedarikciler(id TEXT PRIMARY KEY, ad TEXT NOT NULL, telefon TEXT NOT NULL DEFAULT '', vergi_no TEXT NOT NULL DEFAULT '',
  notlar TEXT NOT NULL DEFAULT '', aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS giderler(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL, tutar INTEGER NOT NULL, tarih TEXT NOT NULL,
  kategori TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, iptal INTEGER NOT NULL DEFAULT 0, olusturma TEXT NOT NULL,
  yontem TEXT NOT NULL DEFAULT 'nakit', tedarikci_id TEXT REFERENCES tedarikciler(id), veresiye INTEGER NOT NULL DEFAULT 0, arac_id TEXT);
CREATE TABLE IF NOT EXISTS tedarikci_odemeleri(id TEXT PRIMARY KEY, tedarikci_id TEXT NOT NULL REFERENCES tedarikciler(id), sube_id TEXT NOT NULL,
  tutar INTEGER NOT NULL, tarih TEXT NOT NULL, yontem TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL,
  iptal INTEGER NOT NULL DEFAULT 0, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gun_sonlari(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL, tarih TEXT NOT NULL, beklenen INTEGER NOT NULL,
  sayilan INTEGER NOT NULL, fark INTEGER NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL,
  UNIQUE(sube_id, tarih));
`);
  },

  veri(c, k, v) {
    const kps = c.kapsam(k);
    const sp = kps === null ? [] : [kps];
    const sart = kps === null ? '1=1' : 'sube_id=?';
    v.tanimlar.kalemTurleri = KALEM_TURLERI;
    v.tanimlar.ucretler = c.ayar().ucretler;
    if (c.hak(k, 'tahsilat'))
      v.odemeler = c.q(`SELECT * FROM odemeler WHERE ${sart} ORDER BY tarih DESC, olusturma DESC LIMIT 3000`, ...sp);
    if (c.hak(k, 'kasa')) {
      v.giderler = c.q(`SELECT * FROM giderler WHERE ${sart} ORDER BY tarih DESC, olusturma DESC LIMIT 3000`, ...sp);
      v.tedarikciler = c.q('SELECT * FROM tedarikciler ORDER BY ad').map((t) => ({ ...t, bakiye: tedarikciBakiye(c, t.id, kps) }));
      v.tedarikciOdemeleri = c.q(`SELECT * FROM tedarikci_odemeleri WHERE ${sart} ORDER BY tarih DESC LIMIT 2000`, ...sp);
      v.gunSonlari = c.q(`SELECT * FROM gun_sonlari WHERE ${sart} ORDER BY tarih DESC LIMIT 400`, ...sp);
    }
  },

  islemler: {
    odeme_al(c, k, g) {
      c.hakGerek(k, 'tahsilat');
      const o = c.ogrenciAl(k, g.ogrenciId);
      const tutar = kurus(g.tutar, 'Tutar', false);
      const kalan = c.hesap(o).kalan;
      if (tutar > kalan) fail(`Tutar kalan borçtan (${tlYaz(kalan)}) büyük olamaz.`);
      const tarih = gun(g.tarih || c.bugunStr()), yontem = secim(g.yontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli');
      const not = kasaGunuDenetle(c, k, o.sube_id, tarih, yontem, g);
      const hesap = yontem !== 'nakit' && g.hesapId ? hesapAl(c, k, g.hesapId) : null;
      const id = randomUUID(), no = makbuzNo(c, o.sube_id);
      c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no,hesap_id) VALUES(?,?,?,?,?,?,?,?,?,'odeme',?,?)",
        id, o.id, o.sube_id, tutar, tarih, yontem, metin(g.aciklama, 200), k.ad, simdi(), no, hesap?.id || null);
      return { sonuc: { id, makbuzNo: no }, olay: [o.sube_id, 'odeme', `${adSoyad(o)} ödeme yaptı: ${tlYaz(tutar)} (makbuz ${no})${not}`] };
    },
    odeme_iptal(c, k, g) {
      c.hakGerek(k, 'kasa');
      const od = c.q1('SELECT * FROM odemeler WHERE id=?', metin(g.id, 60, true));
      if (!od || od.iptal) fail('Ödeme bulunamadı.', 404);
      c.subeIzinli(k, od.sube_id);
      if (od.tur === 'odeme' && od.pos_islem) fail('İnternetten alınan ödeme buradan iptal edilemez; iadesini sanal POS panelinden yapıp "İade" girin.');
      const o = c.q1('SELECT * FROM ogrenciler WHERE id=?', od.ogrenci_id);
      if (od.tur === 'odeme') {
        // İptal sonrası ödenen, iade edilenden az kalamaz.
        const h = c.hesap(o);
        if (h.odenen - od.tutar < 0) fail('Bu ödemeden iade yapılmış; önce iadeyi iptal edin.');
      }
      const not = kasaGunuDenetle(c, k, od.sube_id, od.tarih, od.yontem, g);
      c.run('UPDATE odemeler SET iptal=1, iptal_nedeni=? WHERE id=?', metin(g.neden, 200, true, 'İptal nedeni'), od.id);
      return { olay: [od.sube_id, 'kasa', `${adSoyad(o)} ${od.tur === 'iade' ? 'iadesi' : 'ödemesi'} iptal edildi: ${tlYaz(od.tutar)} (${g.neden})${not}`] };
    },
    iade(c, k, g) {
      c.hakGerek(k, 'kasa');
      const o = c.ogrenciAl(k, g.ogrenciId);
      const tutar = kurus(g.tutar, 'Tutar', false);
      const odenen = c.hesap(o).odenen;
      if (tutar > odenen) fail(`İade, ödenen tutardan (${tlYaz(odenen)}) büyük olamaz.`);
      const tarih = gun(g.tarih || c.bugunStr()), yontem = secim(g.yontem || 'nakit', ['nakit', 'kart', 'havale'], 'İade şekli');
      const not = kasaGunuDenetle(c, k, o.sube_id, tarih, yontem, g);
      const id = randomUUID();
      c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,?,?,?,?,'iade','')",
        id, o.id, o.sube_id, tutar, tarih, yontem, metin(g.aciklama, 200, true, 'İade nedeni'), k.ad, simdi());
      return { sonuc: { id }, olay: [o.sube_id, 'kasa', `${adSoyad(o)} için iade yapıldı: ${tlYaz(tutar)}${not}`] };
    },
    // Paket dışı ek ücret (ek ders, sınav tekrarı) veya indirim. İndirim eksi tutar olarak saklanır.
    ucret_kalemi_ekle(c, k, g) {
      const tur = secim(g.tur, Object.keys(KALEM_TURLERI), 'Kalem türü');
      c.hakGerek(k, tur === 'indirim' ? 'kasa' : 'tahsilat');
      const o = c.ogrenciAl(k, g.ogrenciId);
      let tutar = kurus(g.tutar, 'Tutar', false);
      if (tur === 'indirim') {
        const h = c.hesap(o);
        if (tutar > h.kalan) fail(`İndirim kalan borçtan (${tlYaz(h.kalan)}) büyük olamaz.`);
        tutar = -tutar;
      }
      const id = randomUUID();
      c.run('INSERT INTO ucret_kalemleri(id,ogrenci_id,sube_id,tur,aciklama,tutar,tarih,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?)',
        id, o.id, o.sube_id, tur, metin(g.aciklama, 200), tutar, gun(g.tarih || c.bugunStr()), k.ad, simdi());
      return { sonuc: { id }, olay: [o.sube_id, 'kasa', `${adSoyad(o)}: ${KALEM_TURLERI[tur]} ${tlYaz(Math.abs(tutar))}`] };
    },
    ucret_kalemi_iptal(c, k, g) {
      c.hakGerek(k, 'kasa');
      const x = c.q1('SELECT * FROM ucret_kalemleri WHERE id=?', metin(g.id, 60, true));
      if (!x || x.iptal) fail('Kalem bulunamadı.', 404);
      const o = c.ogrenciAl(k, x.ogrenci_id);
      if (x.tutar > 0) {
        const h = c.hesap(o);
        if (h.ucret - x.tutar < h.odenen) fail('Bu kalem kaldırılırsa ödenen tutar borçtan fazla olur; önce iade yapın.');
      }
      c.run('UPDATE ucret_kalemleri SET iptal=1 WHERE id=?', x.id);
      return { olay: [x.sube_id, 'kasa', `${adSoyad(o)}: ${KALEM_TURLERI[x.tur]} kaldırıldı (${tlYaz(Math.abs(x.tutar))})`] };
    },

    gider_ekle(c, k, g) {
      c.hakGerek(k, 'kasa');
      c.subeIzinli(k, g.subeId);
      const tutar = kurus(g.tutar, 'Tutar', false);
      const kategori = metin(g.kategori, 40, true, 'Gider türü');
      const tedarikci = g.tedarikciId ? c.q1('SELECT * FROM tedarikciler WHERE id=?', String(g.tedarikciId)) : null;
      if (g.tedarikciId && !tedarikci) fail('Tedarikçi bulunamadı.');
      const veresiye = g.veresiye ? 1 : 0;
      if (veresiye && !tedarikci) fail('Veresiye gider için tedarikçi seçin.');
      const arac = g.aracId ? c.aracAl(g.subeId, g.aracId, { arizaSerbest: true }) : null;
      const tarih = gun(g.tarih || c.bugunStr());
      const yontem = veresiye ? 'veresiye' : secim(g.yontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli');
      const not = kasaGunuDenetle(c, k, g.subeId, tarih, yontem, g);
      const hesap = !['nakit', 'veresiye'].includes(yontem) && g.hesapId ? hesapAl(c, k, g.hesapId) : null;
      const id = randomUUID();
      c.run('INSERT INTO giderler(id,sube_id,tutar,tarih,kategori,aciklama,kaydeden,olusturma,yontem,tedarikci_id,veresiye,arac_id,hesap_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, g.subeId, tutar, tarih, kategori, metin(g.aciklama, 200), k.ad, simdi(), yontem, tedarikci?.id || null, veresiye, arac?.id || null, hesap?.id || null);
      return { sonuc: { id }, olay: [g.subeId, 'kasa', `Gider girildi: ${kategori} ${tlYaz(tutar)}${tedarikci ? ` · ${tedarikci.ad}${veresiye ? ' (veresiye)' : ''}` : ''}${not}`] };
    },
    gider_iptal(c, k, g) {
      c.hakGerek(k, 'kasa');
      const gd = c.q1('SELECT * FROM giderler WHERE id=?', metin(g.id, 60, true));
      if (!gd || gd.iptal) fail('Gider bulunamadı.', 404);
      c.subeIzinli(k, gd.sube_id);
      const not = kasaGunuDenetle(c, k, gd.sube_id, gd.tarih, gd.veresiye ? 'veresiye' : gd.yontem, g);
      c.run('UPDATE giderler SET iptal=1 WHERE id=?', gd.id);
      return { olay: [gd.sube_id, 'kasa', `Gider iptal edildi: ${gd.kategori} ${tlYaz(gd.tutar)}${not}`] };
    },

    tedarikci_ekle(c, k, g) {
      c.hakGerek(k, 'kasa');
      const ad = metin(g.ad, 100, true, 'Firma adı');
      if (c.q1('SELECT 1 FROM tedarikciler WHERE ad=? COLLATE NOCASE', ad)) fail('Bu adla bir tedarikçi var.');
      const id = randomUUID();
      c.run('INSERT INTO tedarikciler(id,ad,telefon,vergi_no,notlar,aktif,olusturma) VALUES(?,?,?,?,?,1,?)', id, ad, metin(g.telefon, 30), metin(g.vergiNo, 20), metin(g.notlar, 500), simdi());
      return { sonuc: { id }, olay: [k.sube_id, 'kasa', `Tedarikçi eklendi: ${ad}`] };
    },
    tedarikci_duzenle(c, k, g) {
      c.hakGerek(k, 'kasa');
      const t = c.q1('SELECT * FROM tedarikciler WHERE id=?', metin(g.id, 60, true));
      if (!t) fail('Tedarikçi bulunamadı.', 404);
      c.run('UPDATE tedarikciler SET ad=?,telefon=?,vergi_no=?,notlar=?,aktif=? WHERE id=?', metin(g.ad ?? t.ad, 100, true, 'Firma adı'), metin(g.telefon ?? t.telefon, 30),
        metin(g.vergiNo ?? t.vergi_no, 20), metin(g.notlar ?? t.notlar, 500), g.aktif === undefined ? t.aktif : g.aktif ? 1 : 0, t.id);
      return { olay: [k.sube_id, 'kasa', `Tedarikçi güncellendi: ${g.ad ?? t.ad}`] };
    },
    tedarikci_odeme(c, k, g) {
      c.hakGerek(k, 'kasa');
      c.subeIzinli(k, g.subeId);
      const t = c.q1('SELECT * FROM tedarikciler WHERE id=?', metin(g.tedarikciId, 60, true, 'Tedarikçi'));
      if (!t) fail('Tedarikçi bulunamadı.');
      const tutar = kurus(g.tutar, 'Tutar', false);
      const bakiye = tedarikciBakiye(c, t.id, g.subeId);
      if (tutar > bakiye) fail(`Bu şubenin ${t.ad} firmasına borcu ${tlYaz(bakiye)}. Fazla ödeme girilemez.`);
      const tarih = gun(g.tarih || c.bugunStr()), yontem = secim(g.yontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli');
      const not = kasaGunuDenetle(c, k, g.subeId, tarih, yontem, g);
      const hesap = yontem !== 'nakit' && g.hesapId ? hesapAl(c, k, g.hesapId) : null;
      const id = randomUUID();
      c.run('INSERT INTO tedarikci_odemeleri(id,tedarikci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,hesap_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id, t.id, g.subeId, tutar, tarih, yontem, metin(g.aciklama, 200), k.ad, simdi(), hesap?.id || null);
      return { sonuc: { id }, olay: [g.subeId, 'kasa', `${t.ad} firmasına ödeme yapıldı: ${tlYaz(tutar)}${not}`] };
    },
    tedarikci_odeme_iptal(c, k, g) {
      c.hakGerek(k, 'kasa');
      const x = c.q1('SELECT * FROM tedarikci_odemeleri WHERE id=?', metin(g.id, 60, true));
      if (!x || x.iptal) fail('Ödeme bulunamadı.', 404);
      c.subeIzinli(k, x.sube_id);
      const not = kasaGunuDenetle(c, k, x.sube_id, x.tarih, x.yontem, g);
      c.run('UPDATE tedarikci_odemeleri SET iptal=1 WHERE id=?', x.id);
      return { olay: [x.sube_id, 'kasa', `Tedarikçi ödemesi iptal edildi: ${tlYaz(x.tutar)}${not}`] };
    },

    // Gün sonu: sayılan nakit ile sistemin beklediği nakit karşılaştırılır, fark kaydedilir.
    gun_sonu(c, k, g) {
      c.hakGerek(k, 'kasa');
      const s = c.subeIzinli(k, g.subeId);
      const tarih = gun(g.tarih || c.bugunStr());
      if (c.q1('SELECT 1 FROM gun_sonlari WHERE sube_id=? AND tarih=?', s.id, tarih)) fail('Bu şube için bu günün kasası zaten kapatılmış.');
      if (c.q1('SELECT 1 FROM gun_sonlari WHERE sube_id=? AND tarih>?', s.id, tarih)) fail('Daha sonraki bir günün kasası kapatılmış; geriye dönük gün sonu yapılamaz.');
      if (tarih > c.bugunStr()) fail('İleri tarihli gün sonu yapılamaz.');
      const beklenen = nakitBeklenen(c, s.id, tarih);
      const sayilan = kurus(g.sayilan, 'Sayılan nakit');
      c.run('INSERT INTO gun_sonlari(id,sube_id,tarih,beklenen,sayilan,fark,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?)',
        randomUUID(), s.id, tarih, beklenen, sayilan, sayilan - beklenen, metin(g.aciklama, 300), k.ad, simdi());
      const fark = sayilan - beklenen;
      return { sonuc: { beklenen, fark }, olay: [s.id, 'kasa', `${s.ad} kasası kapatıldı (${tarih}): sayılan ${tlYaz(sayilan)}${fark ? `, fark ${fark > 0 ? '+' : '-'}${tlYaz(Math.abs(fark))}` : ', fark yok'}`] };
    },
  },

  yol(c, k, { yontem, yol, sorgu }) {
    if (yol === '/api/kasa-beklenen' && yontem === 'GET') {
      c.hakGerek(k, 'kasa');
      const s = c.subeIzinli(k, sorgu.get('sube'));
      const tarih = gun(sorgu.get('tarih') || c.bugunStr());
      return { durum: 200, veri: { beklenen: nakitBeklenen(c, s.id, tarih), ...nakitHareket(c, s.id, tarih) } };
    }
    return null;
  },
};

// Kasası kapatılmış (gün sonu yapılmış) bir güne ya da ondan önceki bir güne nakit hareket girilemez; girilirse
// o günün sayımı sessizce bozulur. Zorunlu hallerde yalnız yönetici, gerekçe yazarak girebilir.
// Dönüş: olay yazısına eklenecek not ('' ya da gerekçe).
export function kasaGunuDenetle(c, k, subeId, tarih, yontem, g = {}) {
  if (yontem !== 'nakit') return '';
  const son = c.q1('SELECT MAX(tarih) t FROM gun_sonlari WHERE sube_id=?', subeId)?.t;
  if (!son || tarih > son) return '';
  const tr = (x) => x.split('-').reverse().join('.');
  if (k.rol !== 'yonetici') fail(`${tr(tarih)} tarihli kasa kapatılmış (son gün sonu ${tr(son)}). Kapalı güne nakit kayıt girilemez; kaydı ${tr(son)} sonrasındaki bir tarihle girin ya da yöneticiye başvurun.`, 409);
  const gerekce = metin(g.gerekce, 200);
  if (!gerekce) fail('Bu günün kasası kapatılmış. Yine de girmek için gerekçe yazın.', 409);
  return ` · KAPANMIŞ GÜNE GERİYE DÖNÜK KAYIT (gerekçe: ${gerekce})`;
}

export function tedarikciBakiye(c, tedarikciId, subeId = null) {
  const sart = subeId ? ' AND sube_id=?' : '';
  const p = subeId ? [subeId] : [];
  const borc = c.q1(`SELECT COALESCE(SUM(tutar),0) t FROM giderler WHERE tedarikci_id=? AND veresiye=1 AND iptal=0${sart}`, tedarikciId, ...p).t;
  const odenen = c.q1(`SELECT COALESCE(SUM(tutar),0) t FROM tedarikci_odemeleri WHERE tedarikci_id=? AND iptal=0${sart}`, tedarikciId, ...p).t;
  return borc - odenen;
}
// Bir şube kasasının [bas, bit] arasındaki nakit hareketleri (aktarımlar dahil).
function nakitAralik(c, subeId, bas, bit) {
  const t = (sql) => c.q1(sql, subeId, bas, bit).t;
  return {
    giren: t("SELECT COALESCE(SUM(tutar),0) t FROM odemeler WHERE sube_id=? AND tarih>=? AND tarih<=? AND iptal=0 AND tur='odeme' AND yontem='nakit'"),
    iade: t("SELECT COALESCE(SUM(tutar),0) t FROM odemeler WHERE sube_id=? AND tarih>=? AND tarih<=? AND iptal=0 AND tur='iade' AND yontem='nakit'"),
    gider: t("SELECT COALESCE(SUM(tutar),0) t FROM giderler WHERE sube_id=? AND tarih>=? AND tarih<=? AND iptal=0 AND veresiye=0 AND yontem='nakit'"),
    tedarikci: t("SELECT COALESCE(SUM(tutar),0) t FROM tedarikci_odemeleri WHERE sube_id=? AND tarih>=? AND tarih<=? AND iptal=0 AND yontem='nakit'"),
    aktarimGelen: t("SELECT COALESCE(SUM(tutar),0) t FROM para_transferleri WHERE hedef_tur='kasa' AND hedef_id=? AND tarih>=? AND tarih<=? AND iptal=0"),
    aktarimGiden: t("SELECT COALESCE(SUM(tutar),0) t FROM para_transferleri WHERE kaynak_tur='kasa' AND kaynak_id=? AND tarih>=? AND tarih<=? AND iptal=0"),
  };
}
const nakitHareket = (c, subeId, tarih) => nakitAralik(c, subeId, tarih, tarih);
// Beklenen nakit = son gün sonunda sayılan + o günden sonraki nakit girişler - nakit çıkışlar (+/- aktarımlar).
export function nakitBeklenen(c, subeId, tarih) {
  const son = c.q1('SELECT tarih, sayilan FROM gun_sonlari WHERE sube_id=? AND tarih<? ORDER BY tarih DESC LIMIT 1', subeId, tarih);
  const bas = son?.tarih ? new Date(Date.parse(son.tarih + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) : '0000-00-00';
  const h = nakitAralik(c, subeId, bas, tarih);
  return (son?.sayilan || 0) + h.giren - h.iade - h.gider - h.tedarikci + h.aktarimGelen - h.aktarimGiden;
}
