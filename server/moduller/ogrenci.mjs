// Öğrenci kaydı, düzenleme, durum, nakil, öğrenci girişi.
import { randomUUID } from 'node:crypto';
import { fail, metin, kurus, tamSayi, gun, secim, tcGecerli, taksitPlani, tlYaz } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;

export default {
  ad: 'ogrenci',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS ogrenciler(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL REFERENCES subeler(id), ad TEXT NOT NULL, soyad TEXT NOT NULL,
  tc TEXT NOT NULL, telefon TEXT NOT NULL DEFAULT '', dogum TEXT NOT NULL DEFAULT '', adres TEXT NOT NULL DEFAULT '',
  sinif TEXT NOT NULL, kayit_tarihi TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'aktif', ucret INTEGER NOT NULL DEFAULT 0,
  egitmen_id TEXT REFERENCES kullanicilar(id), portal_sifre TEXT, notlar TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL,
  portal_sifre_gecici INTEGER NOT NULL DEFAULT 0, mevcut_ehliyet TEXT NOT NULL DEFAULT '', donem_id TEXT, eposta TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS ogr_sube ON ogrenciler(sube_id);
CREATE INDEX IF NOT EXISTS ogr_tc ON ogrenciler(tc);
CREATE TABLE IF NOT EXISTS taksitler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), vade TEXT NOT NULL, tutar INTEGER NOT NULL);
`);
  },

  veri(c, k, v) {
    const h = c.etkinHaklar(k);
    const kps = c.kapsam(k);
    let satirlar;
    if (c.egitmenKisitli(k)) {
      // Eğitmen: kendisine bağlı ya da kendisine dersi olan öğrenciler (görevlendirildiği şubedekiler dahil).
      satirlar = c.q(`SELECT * FROM ogrenciler WHERE egitmen_id=? OR id IN (SELECT DISTINCT ogrenci_id FROM dersler WHERE egitmen_id=?) ORDER BY soyad`, k.id, k.id);
    } else {
      satirlar = c.q(`SELECT * FROM ogrenciler WHERE ${kps === null ? '1=1' : 'sube_id=?'} ORDER BY kayit_tarihi DESC, soyad`, ...(kps === null ? [] : [kps]));
    }
    v.ogrenciler = satirlar.map((o) => {
      const x = {
        id: o.id, sube_id: o.sube_id, ad: o.ad, soyad: o.soyad, telefon: o.telefon, sinif: o.sinif, mevcut_ehliyet: o.mevcut_ehliyet,
        kayit_tarihi: o.kayit_tarihi, durum: o.durum, egitmen_id: o.egitmen_id, notlar: o.notlar, donem_id: o.donem_id, eposta: o.eposta,
        portal_acik: !!o.portal_sifre, dersler: c.dersSayaci(o.id),
        tc: h.includes('hassas') ? o.tc : c.tcMaskele(o.tc),
      };
      if (h.includes('hassas')) { x.dogum = o.dogum; x.adres = o.adres; }
      if (h.includes('tahsilat')) x.hesap = c.hesap(o);
      return x;
    });
  },

  islemler: {
    ogrenci_ekle(c, k, g) {
      c.hakGerek(k, 'kayit');
      const s = c.subeIzinli(k, g.subeId);
      if (!s.aktif) fail('Kapalı şubeye kayıt yapılamaz.');
      const a = c.ayar();
      const ad = metin(g.ad, 60, true, 'Ad'), soyad = metin(g.soyad, 60, true, 'Soyad');
      const tc = metin(g.tc, 11, true, 'T.C. kimlik no');
      if (!tcGecerli(tc)) fail('T.C. kimlik numarası geçersiz.');
      const sinif = secim(g.sinif, Object.keys(a.siniflar), 'Ehliyet sınıfı');
      // Aynı kişi aynı sınıfa ikinci kez açık kayıt olamaz (hangi şubede olursa olsun).
      const var_ = c.q1("SELECT o.id, s.ad sube FROM ogrenciler o JOIN subeler s ON s.id=o.sube_id WHERE o.tc=? AND o.sinif=? AND o.durum IN ('aktif','dondu')", tc, sinif);
      if (var_) fail(`Bu kişinin ${sinif} sınıfı için açık bir kaydı var (${k.rol === 'yonetici' || var_.sube === s.ad ? var_.sube : 'başka bir şube'}).`);
      const kayitTarihi = gun(g.kayitTarihi || c.bugunStr(), 'Kayıt tarihi');
      const egitmen = c.egitmenAl(s.id, g.egitmenId, kayitTarihi);
      const ucret = kurus(g.ucret ?? 0, 'Kurs ücreti');
      const pesinat = kurus(g.pesinat ?? 0, 'Peşinat');
      if (pesinat > 0) c.hakGerek(k, 'tahsilat');
      const taksitSayisi = ucret - pesinat > 0 ? tamSayi(g.taksitSayisi || 1, 1, 24, 'Taksit sayısı') : 0;
      const plan = taksitPlani(ucret, pesinat, taksitSayisi, gun(g.ilkVade || kayitTarihi, 'İlk taksit tarihi'), kayitTarihi);
      const donem = g.donemId ? c.q1('SELECT id FROM donemler WHERE id=?', String(g.donemId)) : null;
      const id = randomUUID();
      c.run(`INSERT INTO ogrenciler(id,sube_id,ad,soyad,tc,telefon,dogum,adres,sinif,kayit_tarihi,durum,ucret,egitmen_id,portal_sifre,portal_sifre_gecici,notlar,olusturma,mevcut_ehliyet,donem_id,eposta)
           VALUES(?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?,?,?,?,?)`,
        id, s.id, ad, soyad, tc, metin(g.telefon, 30), gun(g.dogum, 'Doğum tarihi', false), metin(g.adres, 300), sinif, kayitTarihi,
        ucret, egitmen?.id || null, g.portalSifre ? c.sifreOzet(c.sifreKontrol(g.portalSifre, 6)) : null, g.portalSifre ? 1 : 0,
        metin(g.notlar, 1000), simdi(), metin(g.mevcutEhliyet, 20), donem?.id || null, metin(g.eposta, 120));
      for (const t of plan) c.run('INSERT INTO taksitler(id,ogrenci_id,vade,tutar) VALUES(?,?,?,?)', randomUUID(), id, t.vade, t.tutar);
      if (pesinat > 0)
        c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,?,?,?,?,'odeme',?)",
          randomUUID(), id, s.id, pesinat, kayitTarihi, secim(g.pesinatYontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli'), 'Peşinat', k.ad, simdi(), makbuzNo(c));
      return { sonuc: { id }, olay: [s.id, 'kayit', `Yeni kayıt: ${ad} ${soyad} (${sinif}) · ${s.ad}`] };
    },
    ogrenci_duzenle(c, k, g) {
      c.hakGerek(k, 'kayit');
      const o = c.ogrenciAl(k, g.id);
      const hassas = c.hak(k, 'hassas');
      let tc = o.tc;
      if (g.tc !== undefined && hassas && g.tc !== o.tc) { tc = metin(g.tc, 11, true, 'T.C. kimlik no'); if (!tcGecerli(tc)) fail('T.C. kimlik numarası geçersiz.'); }
      const sinif = g.sinif !== undefined ? secim(g.sinif, Object.keys(c.ayar().siniflar), 'Ehliyet sınıfı') : o.sinif;
      const egitmenId = g.egitmenId !== undefined ? c.egitmenAl(o.sube_id, g.egitmenId)?.id || null : o.egitmen_id;
      const donemId = g.donemId !== undefined ? (g.donemId ? c.q1('SELECT id FROM donemler WHERE id=?', String(g.donemId))?.id || null : null) : o.donem_id;
      c.run('UPDATE ogrenciler SET ad=?,soyad=?,tc=?,telefon=?,dogum=?,adres=?,sinif=?,egitmen_id=?,notlar=?,mevcut_ehliyet=?,donem_id=?,eposta=? WHERE id=?',
        metin(g.ad ?? o.ad, 60, true, 'Ad'), metin(g.soyad ?? o.soyad, 60, true, 'Soyad'), tc, metin(g.telefon ?? o.telefon, 30),
        hassas && g.dogum !== undefined ? gun(g.dogum, 'Doğum tarihi', false) : o.dogum,
        hassas && g.adres !== undefined ? metin(g.adres, 300) : o.adres, sinif, egitmenId, metin(g.notlar ?? o.notlar, 1000),
        metin(g.mevcutEhliyet ?? o.mevcut_ehliyet, 20), donemId, metin(g.eposta ?? o.eposta, 120), o.id);
      return { olay: [o.sube_id, 'kayit', `Öğrenci bilgisi güncellendi: ${adSoyad(o)}`] };
    },
    ogrenci_durum(c, k, g) {
      c.hakGerek(k, 'kayit');
      const o = c.ogrenciAl(k, g.id);
      const durum = secim(g.durum, ['aktif', 'dondu', 'tamamlandi', 'iptal'], 'Durum');
      c.run('UPDATE ogrenciler SET durum=? WHERE id=?', durum, o.id);
      if (durum === 'iptal' || durum === 'dondu')
        c.run("UPDATE dersler SET durum='iptal', notu=? WHERE ogrenci_id=? AND durum='planli'", durum === 'iptal' ? 'Kayıt iptal edildi' : 'Kayıt donduruldu', o.id);
      if (durum === 'iptal') c.run("DELETE FROM oturumlar WHERE tur='ogrenci' AND kimlik=?", o.id);
      const ad = { aktif: 'aktif', dondu: 'donduruldu', tamamlandi: 'tamamlandı', iptal: 'iptal edildi' }[durum];
      return { olay: [o.sube_id, 'kayit', `${adSoyad(o)} kaydı ${ad}`] };
    },
    ogrenci_nakil(c, k, g) {
      if (k.rol !== 'yonetici') fail('Şubeler arası nakli yalnız yönetici yapar.', 403);
      const o = c.ogrenciAl(k, g.id);
      const s = c.subeIzinli(k, g.subeId);
      if (s.id === o.sube_id) fail('Öğrenci zaten bu şubede.');
      const eski = c.q1('SELECT ad FROM subeler WHERE id=?', o.sube_id).ad;
      // Geçmiş ödeme, ders ve sınav kayıtları eski şubede kalır (o şubenin cirosu ve emeği bozulmaz).
      c.run('UPDATE ogrenciler SET sube_id=?, egitmen_id=NULL WHERE id=?', s.id, o.id);
      c.run("UPDATE dersler SET durum='iptal', notu='Şube nakli' WHERE ogrenci_id=? AND durum='planli'", o.id);
      return { olay: [s.id, 'kayit', `${adSoyad(o)} ${eski} şubesinden nakil geldi`], ekOlaylar: [[o.sube_id, 'kayit', `${adSoyad(o)} ${s.ad} şubesine nakledildi`]] };
    },
    // Kurs ilk şifreyi verir; öğrenci ilk girişte kendi şifresini belirlemek zorundadır (karar 17).
    ogrenci_portal(c, k, g) {
      c.hakGerek(k, 'kayit');
      const o = c.ogrenciAl(k, g.id);
      const s = g.sifre ? c.sifreOzet(c.sifreKontrol(g.sifre, 6)) : null;
      c.run('UPDATE ogrenciler SET portal_sifre=?, portal_sifre_gecici=? WHERE id=?', s, s ? 1 : 0, o.id);
      c.run("DELETE FROM oturumlar WHERE tur='ogrenci' AND kimlik=?", o.id);
      return { olay: [o.sube_id, 'kayit', `${adSoyad(o)} için öğrenci girişi ${s ? 'açıldı / şifre yenilendi' : 'kapatıldı'}`] };
    },
    ogrenci_ucret(c, k, g) {
      c.hakGerek(k, 'kasa');
      const o = c.ogrenciAl(k, g.id);
      const ucret = kurus(g.ucret, 'Kurs ücreti');
      const h = c.hesap(o);
      const ekler = h.ucret - o.ucret;
      const odenen = h.odenen;
      if (ucret + ekler < odenen) fail(`Ücret ödenmiş tutardan (${tlYaz(odenen)}) az olamaz.`);
      const paketOdenen = Math.min(ucret, Math.max(0, odenen - Math.max(0, ekler)));
      const sayi = ucret - paketOdenen > 0 ? tamSayi(g.taksitSayisi || 1, 1, 24, 'Taksit sayısı') : 0;
      const plan = taksitPlani(ucret, paketOdenen, sayi, gun(g.ilkVade || c.bugunStr(), 'İlk taksit tarihi'), o.kayit_tarihi);
      c.run('DELETE FROM taksitler WHERE ogrenci_id=?', o.id);
      for (const t of plan) c.run('INSERT INTO taksitler(id,ogrenci_id,vade,tutar) VALUES(?,?,?,?)', randomUUID(), o.id, t.vade, t.tutar);
      c.run('UPDATE ogrenciler SET ucret=? WHERE id=?', ucret, o.id);
      return { olay: [o.sube_id, 'kasa', `${adSoyad(o)} paket ücreti / taksit planı güncellendi: ${tlYaz(ucret)}`] };
    },
  },

  ogrenciIslemleri: {
    ogrenci_sifre(c, o, g) {
      const kayit = c.q1('SELECT * FROM ogrenciler WHERE id=?', o.id);
      if (!c.sifreDogru(g.eskiSifre, kayit.portal_sifre)) fail('Mevcut şifre yanlış.');
      const yeni = c.sifreKontrol(g.yeniSifre, 6);
      if (yeni === g.eskiSifre) fail('Yeni şifre kursun verdiği şifreden farklı olmalı.');
      c.run('UPDATE ogrenciler SET portal_sifre=?, portal_sifre_gecici=0 WHERE id=?', c.sifreOzet(yeni), o.id);
      return {};
    },
  },
};

// Makbuz numarası: yıl + sıra (firma içinde tekil).
export function makbuzNo(c) {
  const yil = c.bugunStr().slice(0, 4);
  const son = c.q1("SELECT makbuz_no FROM odemeler WHERE makbuz_no LIKE ? ORDER BY makbuz_no DESC LIMIT 1", yil + '-%')?.makbuz_no;
  const sira = son ? Number(son.split('-')[1]) + 1 : 1;
  return `${yil}-${String(sira).padStart(6, '0')}`;
}
