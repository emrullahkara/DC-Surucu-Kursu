// Öğrenci kaydı, düzenleme, durum, nakil, öğrenci girişi.
import { randomUUID } from 'node:crypto';
import { fail, metin, kurus, tamSayi, gun, secim, tcGecerli, taksitPlani, tlYaz } from '../domain.mjs';
import { kasaGunuDenetle } from './para.mjs';
import { sutunEkle } from '../db-ortak.mjs';

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
CREATE INDEX IF NOT EXISTS taksit_ogr ON taksitler(ogrenci_id);
`);
    // Sonradan eklenen sütunlar (eski kayıtlarda boş kalır):
    //  veli (18 yaş altı), kayıt kaynağı (reklam geri dönüşü), kişisel veri onayı, sınava hazır işareti, anonimleştirme.
    for (const [ad, t] of [['veli_ad', "TEXT NOT NULL DEFAULT ''"], ['veli_telefon', "TEXT NOT NULL DEFAULT ''"], ['veli_yakinlik', "TEXT NOT NULL DEFAULT ''"],
      ['kaynak', "TEXT NOT NULL DEFAULT ''"], ['kvkk_onay', "TEXT NOT NULL DEFAULT ''"], ['sinava_hazir', "TEXT NOT NULL DEFAULT ''"], ['anonim', 'INTEGER NOT NULL DEFAULT 0']])
      sutunEkle(db, 'ogrenciler', ad, t);
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
    const sayac = c.dersSayaciToplu();
    const hesaplar = h.includes('tahsilat') ? c.hesapToplu(satirlar) : null;
    v.ogrenciler = satirlar.map((o) => {
      const x = {
        id: o.id, sube_id: o.sube_id, ad: o.ad, soyad: o.soyad, telefon: o.telefon, sinif: o.sinif, mevcut_ehliyet: o.mevcut_ehliyet,
        kayit_tarihi: o.kayit_tarihi, durum: o.durum, egitmen_id: o.egitmen_id, notlar: o.notlar, donem_id: o.donem_id, eposta: o.eposta,
        veli_ad: o.veli_ad, veli_telefon: o.veli_telefon, veli_yakinlik: o.veli_yakinlik, kaynak: o.kaynak, kvkk: !!o.kvkk_onay,
        sinava_hazir: o.sinava_hazir ? JSON.parse(o.sinava_hazir) : null, anonim: !!o.anonim,
        portal_acik: !!o.portal_sifre, dersler: sayac.get(o.id) || { teorik: 0, direksiyon: 0 },
        tc: h.includes('hassas') ? o.tc : c.tcMaskele(o.tc),
      };
      if (h.includes('hassas')) { x.dogum = o.dogum; x.adres = o.adres; }
      if (hesaplar) x.hesap = hesaplar.get(o.id);
      return x;
    });
  },

  islemler: {
    ogrenci_ekle(c, k, g) {
      const r = ogrenciKaydet(c, k, g);
      return { sonuc: { id: r.id }, olay: r.olay };
    },
    // Excel'den toplu aktarım (başka programdan geçen kurs). Her satır tek tek denetlenir; hatalı satır
    // atlanır, nedeni bildirilir, doğru satırlar kaydedilir. Satır başına kural, tek kayıttakiyle aynıdır.
    ogrenci_toplu_ekle(c, k, g) {
      c.hakGerek(k, 'kayit');
      if (!Array.isArray(g.satirlar) || !g.satirlar.length) fail('Aktarılacak satır yok.');
      if (g.satirlar.length > 500) fail('Bir seferde en fazla 500 öğrenci aktarılabilir.');
      const s = c.subeIzinli(k, g.subeId);
      let eklenen = 0;
      const hatalar = [];
      g.satirlar.forEach((x, i) => {
        try {
          if (!x || typeof x !== 'object') fail('Satır okunamadı.');
          // Toplu aktarımda peşinat alınmaz (geçmiş ödemeler "ödenen" olarak tek kalemde girilir).
          ogrenciKaydet(c, k, { ...x, subeId: s.id, pesinat: 0, portalSifre: '', aktarim: true });
          eklenen++;
        } catch (e) {
          if (!(e instanceof Error) || !('durum' in e)) throw e;
          hatalar.push({ satir: Number(x?.satirNo) || i + 2, ad: `${x?.ad || ''} ${x?.soyad || ''}`.trim(), hata: e.message });
        }
      });
      return { sonuc: { eklenen, hatalar }, olay: [s.id, 'kayit', `Excel'den ${eklenen} öğrenci aktarıldı · ${s.ad}${hatalar.length ? ` (${hatalar.length} satır hatalı, atlandı)` : ''}`] };
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
      const yeni = {
        ad: metin(g.ad ?? o.ad, 60, true, 'Ad'), soyad: metin(g.soyad ?? o.soyad, 60, true, 'Soyad'), tc, telefon: metin(g.telefon ?? o.telefon, 30),
        dogum: hassas && g.dogum !== undefined ? gun(g.dogum, 'Doğum tarihi', false) : o.dogum,
        adres: hassas && g.adres !== undefined ? metin(g.adres, 300) : o.adres, sinif, egitmen_id: egitmenId, notlar: metin(g.notlar ?? o.notlar, 1000),
        mevcut_ehliyet: metin(g.mevcutEhliyet ?? o.mevcut_ehliyet, 20), donem_id: donemId, eposta: metin(g.eposta ?? o.eposta, 120),
        veli_ad: metin(g.veliAd ?? o.veli_ad, 80), veli_telefon: metin(g.veliTelefon ?? o.veli_telefon, 30), veli_yakinlik: metin(g.veliYakinlik ?? o.veli_yakinlik, 30),
      };
      if (!yeni.veli_ad && resitDegil(yeni.dogum, o.kayit_tarihi)) fail('18 yaşından küçük aday için veli adı ve telefonu gerekir.');
      c.run('UPDATE ogrenciler SET ad=?,soyad=?,tc=?,telefon=?,dogum=?,adres=?,sinif=?,egitmen_id=?,notlar=?,mevcut_ehliyet=?,donem_id=?,eposta=?,veli_ad=?,veli_telefon=?,veli_yakinlik=? WHERE id=?',
        yeni.ad, yeni.soyad, yeni.tc, yeni.telefon, yeni.dogum, yeni.adres, yeni.sinif, yeni.egitmen_id, yeni.notlar, yeni.mevcut_ehliyet, yeni.donem_id, yeni.eposta,
        yeni.veli_ad, yeni.veli_telefon, yeni.veli_yakinlik, o.id);
      // Kayıt defteri için: hangi bilgiler değişti (eski ve yeni değer; kimlik ve adres gibi hassas bilgilerin değeri yazılmaz).
      const AD = { ad: 'ad', soyad: 'soyad', tc: 'kimlik no', telefon: 'telefon', dogum: 'doğum tarihi', adres: 'adres', sinif: 'sınıf', egitmen_id: 'eğitmen', notlar: 'not',
        mevcut_ehliyet: 'elindeki ehliyet', donem_id: 'dönem', eposta: 'e-posta', veli_ad: 'veli', veli_telefon: 'veli telefonu', veli_yakinlik: 'veli yakınlığı' };
      const kisiAd = (id) => (id ? c.q1('SELECT ad FROM kullanicilar WHERE id=?', id)?.ad || '' : 'yok');
      const degisen = Object.keys(AD).filter((x) => (yeni[x] ?? '') !== (o[x] ?? '')).map((x) => {
        if (['tc', 'adres', 'dogum', 'notlar'].includes(x)) return AD[x];
        if (x === 'egitmen_id') return `eğitmen: ${kisiAd(o.egitmen_id)} → ${kisiAd(yeni.egitmen_id)}`;
        if (x === 'donem_id') return 'dönem';
        return `${AD[x]}: ${o[x] || '-'} → ${yeni[x] || '-'}`;
      });
      return { olay: [o.sube_id, 'kayit', `Öğrenci bilgisi güncellendi: ${adSoyad(o)}${degisen.length ? ` (${degisen.join('; ')})` : ' (değişiklik yok)'}`] };
    },
    ogrenci_durum(c, k, g) {
      c.hakGerek(k, 'kayit');
      const o = c.ogrenciAl(k, g.id);
      const durum = secim(g.durum, ['aktif', 'dondu', 'tamamlandi', 'iptal'], 'Durum');
      c.run('UPDATE ogrenciler SET durum=? WHERE id=?', durum, o.id);
      if (durum !== 'aktif')
        c.run("UPDATE dersler SET durum='iptal', notu=? WHERE ogrenci_id=? AND durum='planli'", { iptal: 'Kayıt iptal edildi', dondu: 'Kayıt donduruldu', tamamlandi: 'Kayıt tamamlandı' }[durum], o.id);
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

// 18 yaşından küçük mü (kayıt tarihine göre)? Doğum tarihi yoksa bilinmez, false döner.
export function resitDegil(dogum, gunStr) {
  if (!dogum) return false;
  const [y, a, g] = dogum.split('-').map(Number);
  const on8 = `${String(y + 18).padStart(4, '0')}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  return on8 > gunStr;
}

// Yeni öğrenci kaydı (tek kayıt, Excel'den aktarım ve aday kaydı ortak kullanır).
export function ogrenciKaydet(c, k, g) {
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
  const dogum = gun(g.dogum, 'Doğum tarihi', false);
  if (dogum && dogum >= kayitTarihi) fail('Doğum tarihi geçersiz.');
  // 18 yaşından küçük aday (ör. motosiklet sınıfları): veli bilgisi zorunlu.
  const veliAd = metin(g.veliAd, 80), veliTelefon = metin(g.veliTelefon, 30);
  if (resitDegil(dogum, kayitTarihi) && (!veliAd || !veliTelefon)) fail('18 yaşından küçük aday için veli adı ve telefonu gerekir.');
  const egitmen = g.aktarim && !g.egitmenId ? null : c.egitmenAl(s.id, g.egitmenId, g.aktarim ? c.bugunStr() : kayitTarihi);
  const ucret = kurus(g.ucret ?? 0, 'Kurs ücreti');
  const pesinat = kurus(g.pesinat ?? 0, 'Peşinat');
  if (pesinat > 0) c.hakGerek(k, 'tahsilat');
  // Aktarımda daha önce ödenmiş tutar (eski programdan) tek "devir" ödemesi olarak girilir.
  const devir = g.aktarim ? kurus(g.odenen ?? 0, 'Ödenen') : 0;
  if (devir > ucret) fail('Ödenen tutar kurs ücretinden büyük olamaz.');
  if (devir > 0) c.hakGerek(k, 'tahsilat');
  const kalanPlan = ucret - pesinat - devir;
  const taksitSayisi = kalanPlan > 0 ? tamSayi(g.taksitSayisi || 1, 1, 24, 'Taksit sayısı') : 0;
  const plan = taksitPlani(ucret - devir, pesinat, taksitSayisi, gun(g.ilkVade || (g.aktarim ? c.bugunStr() : kayitTarihi), 'İlk taksit tarihi'), kayitTarihi);
  if (devir > 0) plan.unshift({ vade: kayitTarihi, tutar: devir });
  const pesinatYontem = secim(g.pesinatYontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli');
  const kasaNotu = pesinat > 0 ? kasaGunuDenetle(c, k, s.id, kayitTarihi, pesinatYontem, g) : '';
  const donem = g.donemId ? c.q1('SELECT id FROM donemler WHERE id=?', String(g.donemId)) : null;
  const kaynak = metin(g.kaynak, 40);
  // Kişisel verilerin işlenmesi: aydınlatma metni okundu / açık rıza (karar KVKK). Tarih ve kaydeden saklanır.
  const kvkk = g.kvkkOnay ? JSON.stringify({ tarih: simdi(), kaydeden: k.ad, surum: a.kvkk?.surum || 1, yol: g.aktarim ? 'aktarım' : g.onKayit ? 'ön kayıt' : 'kayıt' }) : '';
  const id = randomUUID();
  c.run(`INSERT INTO ogrenciler(id,sube_id,ad,soyad,tc,telefon,dogum,adres,sinif,kayit_tarihi,durum,ucret,egitmen_id,portal_sifre,portal_sifre_gecici,notlar,olusturma,mevcut_ehliyet,donem_id,eposta,
       veli_ad,veli_telefon,veli_yakinlik,kaynak,kvkk_onay)
       VALUES(?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, s.id, ad, soyad, tc, metin(g.telefon, 30), dogum, metin(g.adres, 300), sinif, kayitTarihi,
    ucret, egitmen?.id || null, g.portalSifre ? c.sifreOzet(c.sifreKontrol(g.portalSifre, 6)) : null, g.portalSifre ? 1 : 0,
    metin(g.notlar, 1000), simdi(), metin(g.mevcutEhliyet, 20), donem?.id || null, metin(g.eposta, 120),
    veliAd, veliTelefon, metin(g.veliYakinlik, 30), kaynak, kvkk);
  for (const t of plan) c.run('INSERT INTO taksitler(id,ogrenci_id,vade,tutar) VALUES(?,?,?,?)', randomUUID(), id, t.vade, t.tutar);
  if (pesinat > 0)
    c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,?,?,?,?,'odeme',?)",
      randomUUID(), id, s.id, pesinat, kayitTarihi, pesinatYontem, 'Peşinat', k.ad, simdi(), makbuzNo(c, s.id));
  if (devir > 0)
    c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,'devir',?,?,?,'odeme','')",
      randomUUID(), id, s.id, devir, kayitTarihi, 'Önceki programdan devreden ödeme', k.ad, simdi());
  return { id, olay: [s.id, 'kayit', `Yeni kayıt: ${ad} ${soyad} (${sinif}) · ${s.ad}${kasaNotu}`] };
}

// Makbuz numarası: yıl + sıra (firma içinde tekil). Ayardan "şube serisi" seçilmişse her şubenin kendi
// sırası olur ve numaranın başında şubenin kısa kodu yazar (ör. CNK-2026-000001).
export function makbuzNo(c, subeId = null) {
  const yil = c.bugunStr().slice(0, 4);
  const kod = c.ayar().makbuzSerisi === 'sube' && subeId ? c.q1('SELECT kod FROM subeler WHERE id=?', subeId)?.kod || '' : '';
  const on = kod ? `${kod}-${yil}-` : `${yil}-`;
  const son = c.q1('SELECT makbuz_no FROM odemeler WHERE makbuz_no LIKE ? ORDER BY makbuz_no DESC LIMIT 1', on.replace(/[%_]/g, '') + '%')?.makbuz_no;
  const sira = son ? Number(son.slice(on.length)) + 1 : 1;
  return `${on}${String(sira).padStart(6, '0')}`;
}
