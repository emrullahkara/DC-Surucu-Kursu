// Aylık dönemler, teorik ders grupları (sınıflar), derslik, teorik ders oturumları ve yoklama (karar 21).
// Yoklamada "geldi" işaretlenen öğrencinin teorik ders sayacı, oturumun ders saati kadar artar.
import { randomUUID } from 'node:crypto';
import { fail, metin, gun, saat, secim, tamSayi } from '../domain.mjs';

const simdi = () => new Date().toISOString();
export const TEORIK_KONULAR = ['Trafik ve Çevre', 'İlk Yardım', 'Araç Tekniği', 'Trafik Adabı', 'Genel tekrar'];

function grupAl(c, k, id) {
  const g = c.q1('SELECT * FROM teorik_gruplar WHERE id=?', metin(id, 60, true, 'Grup'));
  if (!g) fail('Grup bulunamadı.', 404);
  if (k.rol !== 'yonetici' && g.sube_id !== k.sube_id && g.egitmen_id !== k.id) fail('Grup bulunamadı.', 404);
  return g;
}

export default {
  ad: 'donem',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS donemler(id TEXT PRIMARY KEY, ad TEXT NOT NULL, bas TEXT NOT NULL, bit TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS teorik_gruplar(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL REFERENCES subeler(id), donem_id TEXT REFERENCES donemler(id),
  ad TEXT NOT NULL, derslik TEXT NOT NULL DEFAULT '', egitmen_id TEXT REFERENCES kullanicilar(id), aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS grup_uyeleri(grup_id TEXT NOT NULL REFERENCES teorik_gruplar(id), ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id),
  PRIMARY KEY(grup_id, ogrenci_id));
CREATE TABLE IF NOT EXISTS teorik_oturumlar(id TEXT PRIMARY KEY, grup_id TEXT NOT NULL REFERENCES teorik_gruplar(id), sube_id TEXT NOT NULL,
  tarih TEXT NOT NULL, saat TEXT NOT NULL DEFAULT '', ders_saati INTEGER NOT NULL DEFAULT 1, konu TEXT NOT NULL DEFAULT '',
  egitmen_id TEXT REFERENCES kullanicilar(id), durum TEXT NOT NULL DEFAULT 'planli', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS yoklamalar(id TEXT PRIMARY KEY, oturum_id TEXT NOT NULL REFERENCES teorik_oturumlar(id),
  ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), durum TEXT NOT NULL, UNIQUE(oturum_id, ogrenci_id));
`);
  },

  veri(c, k, v) {
    v.tanimlar.teorikKonular = TEORIK_KONULAR;
    v.donemler = c.q('SELECT * FROM donemler ORDER BY bas DESC');
    const kps = c.kapsam(k);
    let gruplar;
    if (kps === null) gruplar = c.q('SELECT * FROM teorik_gruplar ORDER BY aktif DESC, ad');
    else if (c.egitmenKisitli(k)) gruplar = c.q('SELECT * FROM teorik_gruplar WHERE egitmen_id=? OR id IN (SELECT grup_id FROM teorik_oturumlar WHERE egitmen_id=?) ORDER BY aktif DESC, ad', k.id, k.id);
    else gruplar = c.q('SELECT * FROM teorik_gruplar WHERE sube_id=? OR egitmen_id=? ORDER BY aktif DESC, ad', kps, k.id);
    const ids = gruplar.map((g) => g.id);
    const yer = ids.map(() => '?').join(',');
    const uyeler = ids.length ? c.q(`SELECT * FROM grup_uyeleri WHERE grup_id IN (${yer})`, ...ids) : [];
    v.teorikGruplar = gruplar.map((g) => ({ ...g, uyeler: uyeler.filter((u) => u.grup_id === g.id).map((u) => u.ogrenci_id) }));
    const sinir = new Date(c.saatKaynagi().getTime() - 180 * 86400000).toISOString().slice(0, 10);
    v.teorikOturumlar = ids.length ? c.q(`SELECT * FROM teorik_oturumlar WHERE grup_id IN (${yer}) AND tarih>=? ORDER BY tarih, saat`, ...ids, sinir) : [];
    const oids = v.teorikOturumlar.map((o) => o.id);
    v.yoklamalar = oids.length ? c.q(`SELECT oturum_id, ogrenci_id, durum FROM yoklamalar WHERE oturum_id IN (${oids.map(() => '?').join(',')})`, ...oids) : [];
  },

  islemler: {
    donem_ekle(c, k, g) {
      if (!['yonetici', 'sube_muduru'].includes(k.rol)) fail('Dönemi yönetici veya şube müdürü açar.', 403);
      const bas = gun(g.bas, 'Başlangıç'), bit = gun(g.bit, 'Bitiş');
      if (bas > bit) fail('Başlangıç bitişten sonra olamaz.');
      const ad = metin(g.ad, 60, true, 'Dönem adı');
      if (c.q1('SELECT 1 FROM donemler WHERE ad=? COLLATE NOCASE', ad)) fail('Bu adla bir dönem var.');
      const id = randomUUID();
      c.run('INSERT INTO donemler(id,ad,bas,bit,olusturma) VALUES(?,?,?,?,?)', id, ad, bas, bit, simdi());
      return { sonuc: { id }, olay: [null, 'donem', `Dönem açıldı: ${ad}`] };
    },
    grup_ekle(c, k, g) {
      c.hakGerek(k, 'ders');
      const s = c.subeIzinli(k, g.subeId);
      const egitmen = c.egitmenAl(s.id, g.egitmenId);
      const donem = g.donemId ? c.q1('SELECT id FROM donemler WHERE id=?', String(g.donemId)) : null;
      const id = randomUUID();
      c.run('INSERT INTO teorik_gruplar(id,sube_id,donem_id,ad,derslik,egitmen_id,aktif,olusturma) VALUES(?,?,?,?,?,?,1,?)',
        id, s.id, donem?.id || null, metin(g.ad, 60, true, 'Grup adı'), metin(g.derslik, 60), egitmen?.id || null, simdi());
      return { sonuc: { id }, olay: [s.id, 'donem', `Teorik grup açıldı: ${g.ad}`] };
    },
    grup_duzenle(c, k, g) {
      c.hakGerek(k, 'ders');
      const gr = grupAl(c, k, g.id);
      c.subeIzinli(k, gr.sube_id);
      const egitmen = g.egitmenId !== undefined ? c.egitmenAl(gr.sube_id, g.egitmenId) : null;
      c.run('UPDATE teorik_gruplar SET ad=?, derslik=?, egitmen_id=?, donem_id=?, aktif=? WHERE id=?',
        metin(g.ad ?? gr.ad, 60, true, 'Grup adı'), metin(g.derslik ?? gr.derslik, 60), g.egitmenId !== undefined ? egitmen?.id || null : gr.egitmen_id,
        g.donemId !== undefined ? (g.donemId ? c.q1('SELECT id FROM donemler WHERE id=?', String(g.donemId))?.id || null : null) : gr.donem_id,
        g.aktif === undefined ? gr.aktif : g.aktif ? 1 : 0, gr.id);
      return { olay: [gr.sube_id, 'donem', `Teorik grup güncellendi: ${g.ad ?? gr.ad}`] };
    },
    grup_uyeleri(c, k, g) {
      c.hakGerek(k, 'kayit');
      const gr = grupAl(c, k, g.id);
      c.subeIzinli(k, gr.sube_id);
      if (!Array.isArray(g.ogrenciler)) fail('Öğrenci listesi geçersiz.');
      const liste = [...new Set(g.ogrenciler.map(String))];
      for (const id of liste) { const o = c.ogrenciAl(k, id); if (o.sube_id !== gr.sube_id) fail(`${o.ad} ${o.soyad} bu grubun şubesinde değil.`); }
      c.run('DELETE FROM grup_uyeleri WHERE grup_id=?', gr.id);
      for (const id of liste) c.run('INSERT INTO grup_uyeleri(grup_id,ogrenci_id) VALUES(?,?)', gr.id, id);
      return { olay: [gr.sube_id, 'donem', `${gr.ad} grubunun öğrenci listesi güncellendi (${liste.length} öğrenci)`] };
    },
    oturum_planla(c, k, g) {
      const gr = grupAl(c, k, g.grupId);
      if (!c.hak(k, 'ders') && gr.egitmen_id !== k.id) fail('Bu grubun dersini planlama yetkiniz yok.', 403);
      const tarih = gun(g.tarih);
      const egitmen = c.egitmenAl(gr.sube_id, g.egitmenId || gr.egitmen_id, tarih);
      const id = randomUUID();
      c.run('INSERT INTO teorik_oturumlar(id,grup_id,sube_id,tarih,saat,ders_saati,konu,egitmen_id,durum,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        id, gr.id, gr.sube_id, tarih, saat(g.saat), tamSayi(g.dersSaati || 1, 1, 8, 'Ders saati'), metin(g.konu, 80), egitmen?.id || null, 'planli', k.ad, simdi());
      return { sonuc: { id }, olay: [gr.sube_id, 'donem', `${gr.ad} teorik dersi planlandı: ${tarih} ${g.saat || ''} ${g.konu || ''}`.trim()] };
    },
    oturum_iptal(c, k, g) {
      const o = c.q1('SELECT * FROM teorik_oturumlar WHERE id=?', metin(g.id, 60, true));
      if (!o) fail('Ders bulunamadı.', 404);
      const gr = grupAl(c, k, o.grup_id);
      if (!c.hak(k, 'ders') && o.egitmen_id !== k.id) fail('Yetkiniz yok.', 403);
      if (o.durum === 'yapildi' && !c.hak(k, 'ders')) fail('Yoklaması alınmış ders yalnız ders yetkisi olan personelce iptal edilir.', 403);
      c.run("UPDATE teorik_oturumlar SET durum='iptal' WHERE id=?", o.id);
      c.run('DELETE FROM yoklamalar WHERE oturum_id=?', o.id);
      return { olay: [gr.sube_id, 'donem', `${gr.ad} teorik dersi iptal edildi: ${o.tarih}`] };
    },
    // Yoklama: dersi veren eğitmen ya da ders yetkisi olan personel. Tekrar kaydedilirse üzerine yazılır.
    yoklama_kaydet(c, k, g) {
      const o = c.q1('SELECT * FROM teorik_oturumlar WHERE id=?', metin(g.oturumId, 60, true, 'Ders'));
      if (!o || o.durum === 'iptal') fail('Ders bulunamadı.', 404);
      const gr = grupAl(c, k, o.grup_id);
      if (!c.hak(k, 'ders') && o.egitmen_id !== k.id) fail('Yalnız dersi veren eğitmen yoklama alabilir.', 403);
      if (!Array.isArray(g.liste)) fail('Yoklama listesi geçersiz.');
      const uyeler = new Set(c.q('SELECT ogrenci_id FROM grup_uyeleri WHERE grup_id=?', gr.id).map((x) => x.ogrenci_id));
      c.run('DELETE FROM yoklamalar WHERE oturum_id=?', o.id);
      let gelen = 0;
      for (const x of g.liste) {
        const oid = String(x.ogrenciId);
        if (!uyeler.has(oid)) continue;
        const durum = secim(x.durum, ['geldi', 'gelmedi', 'izinli'], 'Yoklama');
        if (durum === 'geldi') gelen++;
        c.run('INSERT INTO yoklamalar(id,oturum_id,ogrenci_id,durum) VALUES(?,?,?,?)', randomUUID(), o.id, oid, durum);
      }
      c.run("UPDATE teorik_oturumlar SET durum='yapildi' WHERE id=?", o.id);
      return { olay: [gr.sube_id, 'donem', `${gr.ad} yoklaması alındı (${o.tarih}): ${gelen}/${uyeler.size} geldi`, { egitmen: o.egitmen_id }] };
    },
  },

  ogrenciVeri(c, o, v) {
    v.teorikDersler = c.q(`SELECT t.tarih, t.saat, t.ders_saati, t.konu, t.durum, g.ad grup, g.derslik, y.durum yoklama FROM teorik_oturumlar t
      JOIN grup_uyeleri u ON u.grup_id=t.grup_id AND u.ogrenci_id=? JOIN teorik_gruplar g ON g.id=t.grup_id
      LEFT JOIN yoklamalar y ON y.oturum_id=t.id AND y.ogrenci_id=? WHERE t.durum!='iptal' ORDER BY t.tarih DESC, t.saat DESC`, o.id, o.id);
  },
};
