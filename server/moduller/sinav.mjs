// Sınavlar: e-sınav ve direksiyon sınavı, hak takibi, sınav tekrar ücreti, sınav günü listesi.
import { randomUUID } from 'node:crypto';
import { fail, metin, gun, saat, secim, tamSayi, kurus, tlYaz } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;

export default {
  ad: 'sinav',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS sinavlar(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tur TEXT NOT NULL, tarih TEXT NOT NULL, saat TEXT NOT NULL DEFAULT '', deneme INTEGER NOT NULL, sonuc TEXT NOT NULL DEFAULT 'bekliyor',
  puan INTEGER, notu TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL, yer TEXT NOT NULL DEFAULT '', harc INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS sinav_ogr ON sinavlar(ogrenci_id);
`);
  },

  veri(c, k, v) {
    const gorunen = new Set(v.ogrenciler.map((o) => o.id));
    const kps = c.kapsam(k);
    v.sinavlar = c.q(`SELECT * FROM sinavlar WHERE ${kps === null || c.egitmenKisitli(k) ? '1=1' : 'sube_id=?'} ORDER BY tarih DESC, saat`, ...(kps === null || c.egitmenKisitli(k) ? [] : [kps]))
      .filter((s) => gorunen.has(s.ogrenci_id));
    if (!c.hak(k, 'tahsilat')) v.sinavlar = v.sinavlar.map((s) => ({ ...s, harc: undefined }));
  },

  islemler: {
    sinav_ekle(c, k, g) {
      c.hakGerek(k, 'sinav');
      const a = c.ayar();
      const o = c.ogrenciAl(k, g.ogrenciId);
      if (o.durum !== 'aktif') fail('Yalnız aktif öğrenci sınava yazılır.');
      const tur = secim(g.sinavTuru, ['e_sinav', 'direksiyon'], 'Sınav türü');
      const onceki = c.q('SELECT * FROM sinavlar WHERE ogrenci_id=? AND tur=?', o.id, tur);
      if (onceki.some((s) => s.sonuc === 'gecti')) fail('Öğrenci bu sınavı zaten geçti.');
      if (onceki.some((s) => s.sonuc === 'bekliyor')) fail('Öğrencinin sonucu girilmemiş bir sınavı var.');
      // Sınava girmeyen adayın hakkı da yanar (ayardan kapatılabilir; mevzuata göre doğrulanmalı).
      const yanan = onceki.filter((s) => s.sonuc === 'kaldi' || (a.girmediHakYakar && s.sonuc === 'girmedi')).length;
      if (yanan >= a.sinavHakki) fail(`Sınav hakkı dolmuş (${a.sinavHakki}).`);
      if (tur === 'direksiyon' && !c.q1("SELECT 1 FROM sinavlar WHERE ogrenci_id=? AND tur='e_sinav' AND sonuc='gecti'", o.id)) fail('Önce e-sınavı geçmesi gerekir.');
      const tarih = gun(g.tarih);
      const harc = kurus(g.harc ?? 0, 'Sınav harcı');
      const id = randomUUID();
      const deneme = onceki.filter((s) => a.girmediHakYakar || s.sonuc !== 'girmedi').length + 1;
      c.run('INSERT INTO sinavlar(id,ogrenci_id,sube_id,tur,tarih,saat,deneme,sonuc,kaydeden,olusturma,yer,harc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        id, o.id, o.sube_id, tur, tarih, saat(g.saat), deneme, 'bekliyor', k.ad, simdi(), metin(g.yer, 120), harc);
      const turAd = tur === 'e_sinav' ? 'E-sınav' : 'Direksiyon sınavı';
      // Tekrar sınavında (ilk hak değilse) kurumun belirlediği tekrar ücreti ve varsa harç öğrencinin borcuna eklenir (karar 9).
      const kalemEkle = (kalemTur, tutar, aciklama) => c.run('INSERT INTO ucret_kalemleri(id,ogrenci_id,sube_id,tur,aciklama,tutar,tarih,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?)',
        randomUUID(), o.id, o.sube_id, kalemTur, aciklama, tutar, c.bugunStr(), k.ad, simdi());
      if (deneme > 1 && a.ucretler.sinavTekrar > 0) kalemEkle('sinav_tekrar', a.ucretler.sinavTekrar, `${turAd} ${deneme}. hak tekrar ücreti`);
      if (harc > 0 && g.harcBorca) kalemEkle('diger', harc, `${turAd} harcı (${tarih})`);
      return { sonuc: { id }, olay: [o.sube_id, 'sinav', `${adSoyad(o)} ${tur === 'e_sinav' ? 'e-sınava' : 'direksiyon sınavına'} yazıldı: ${tarih} (${deneme}. hak)`] };
    },
    sinav_duzenle(c, k, g) {
      c.hakGerek(k, 'sinav');
      const s = c.q1('SELECT * FROM sinavlar WHERE id=?', metin(g.id, 60, true));
      if (!s) fail('Sınav bulunamadı.', 404);
      c.ogrenciAl(k, s.ogrenci_id);
      if (s.sonuc !== 'bekliyor') fail('Sonuçlanmış sınavın tarihi değiştirilemez.');
      c.run('UPDATE sinavlar SET tarih=?, saat=?, yer=? WHERE id=?', gun(g.tarih ?? s.tarih), saat(g.saat ?? s.saat), metin(g.yer ?? s.yer, 120), s.id);
      return { olay: [s.sube_id, 'sinav', `Sınav tarihi güncellendi: ${g.tarih ?? s.tarih}`] };
    },
    sinav_sonuc(c, k, g) {
      c.hakGerek(k, 'sinav');
      const a = c.ayar();
      const s = c.q1('SELECT * FROM sinavlar WHERE id=?', metin(g.id, 60, true));
      if (!s) fail('Sınav bulunamadı.', 404);
      const o = c.ogrenciAl(k, s.ogrenci_id);
      let puan = null, sonuc = secim(g.sonuc, ['gecti', 'kaldi', 'girmedi', 'bekliyor'], 'Sonuç');
      if (s.tur === 'e_sinav' && g.puan !== undefined && g.puan !== null && g.puan !== '') {
        puan = tamSayi(g.puan, 0, 100, 'Puan');
        if (sonuc !== 'girmedi') sonuc = puan >= a.eSinavGecme ? 'gecti' : 'kaldi';
      }
      if (s.tur === 'e_sinav' && s.sonuc === 'gecti' && sonuc !== 'gecti'
        && c.q1("SELECT 1 FROM sinavlar WHERE ogrenci_id=? AND tur='direksiyon'", o.id)) fail('Öğrencinin direksiyon sınavı kaydı var; e-sınav sonucu değiştirilemez.');
      c.run('UPDATE sinavlar SET sonuc=?, puan=?, notu=? WHERE id=?', sonuc, puan, metin(g.notu ?? s.notu, 300), s.id);
      if (s.tur === 'direksiyon' && sonuc === 'gecti' && o.durum === 'aktif') {
        c.run("UPDATE ogrenciler SET durum='tamamlandi' WHERE id=?", o.id);
        c.run("UPDATE dersler SET durum='iptal', notu='Sınavı geçti' WHERE ogrenci_id=? AND durum='planli'", o.id);
      }
      // Yanlışlıkla "geçti" girilip düzeltilirse öğrenci yeniden aktif olur (başka geçen direksiyon sınavı yoksa).
      if (s.tur === 'direksiyon' && s.sonuc === 'gecti' && sonuc !== 'gecti' && o.durum === 'tamamlandi'
        && !c.q1("SELECT 1 FROM sinavlar WHERE ogrenci_id=? AND tur='direksiyon' AND sonuc='gecti' AND id!=?", o.id, s.id))
        c.run("UPDATE ogrenciler SET durum='aktif' WHERE id=?", o.id);
      const ad = s.tur === 'e_sinav' ? 'e-sınav' : 'direksiyon sınavı';
      const yazi = { gecti: 'GEÇTİ', kaldi: 'kaldı', girmedi: 'girmedi', bekliyor: 'sonuç bekleniyor' }[sonuc];
      const kalanHak = a.sinavHakki - c.q1(`SELECT COUNT(*) n FROM sinavlar WHERE ogrenci_id=? AND tur=? AND (sonuc='kaldi'${a.girmediHakYakar ? " OR sonuc='girmedi'" : ''})`, o.id, s.tur).n;
      return { olay: [s.sube_id, 'sinav', `${adSoyad(o)} ${ad}: ${yazi}${puan !== null ? ` (${puan} puan)` : ''}${sonuc === 'kaldi' || (sonuc === 'girmedi' && a.girmediHakYakar) ? ` · kalan hak ${Math.max(0, kalanHak)}` : ''}`] };
    },
  },

  ogrenciVeri(c, o, v) {
    v.sinavlar = c.q('SELECT tur,tarih,saat,deneme,sonuc,puan,yer FROM sinavlar WHERE ogrenci_id=? ORDER BY tarih DESC', o.id);
    v.eSinavGecme = c.ayar().eSinavGecme;
  },
};

export { tlYaz };
