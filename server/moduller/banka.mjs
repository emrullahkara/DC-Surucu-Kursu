// Banka hesapları ve para aktarımı:
//  - Kurumun banka hesapları (bir şubeye ya da bütün kuruma ait). Kartla / havaleyle alınan tahsilat, giderler ve
//    firmalara ödemeler bir hesaba bağlanabilir; hesabın bakiyesi bunlardan hesaplanır.
//  - Aktarım: şube kasasından merkez kasasına, kasadan bankaya (nakit yatırma), bankadan kasaya (çekme) ya da
//    hesaplar arası. Kasa sayımı (gün sonu) aktarımları hesaba katar.
import { randomUUID } from 'node:crypto';
import { fail, metin, kurus, gun, secim, tlYaz } from '../domain.mjs';
import { sutunEkle } from '../db-ortak.mjs';
import { kasaGunuDenetle } from './para.mjs';

const simdi = () => new Date().toISOString();

export function hesapBakiye(c, id) {
  const h = c.q1('SELECT acilis FROM banka_hesaplari WHERE id=?', id);
  if (!h) return 0;
  const t = (sql) => c.q1(sql, id).t;
  return h.acilis
    + t("SELECT COALESCE(SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END),0) t FROM odemeler WHERE hesap_id=? AND iptal=0")
    - t('SELECT COALESCE(SUM(tutar),0) t FROM giderler WHERE hesap_id=? AND iptal=0 AND veresiye=0')
    - t('SELECT COALESCE(SUM(tutar),0) t FROM tedarikci_odemeleri WHERE hesap_id=? AND iptal=0')
    + t("SELECT COALESCE(SUM(tutar),0) t FROM para_transferleri WHERE hedef_tur='hesap' AND hedef_id=? AND iptal=0")
    - t("SELECT COALESCE(SUM(tutar),0) t FROM para_transferleri WHERE kaynak_tur='hesap' AND kaynak_id=? AND iptal=0");
}
// Hesap kapsamı: yönetici hepsini; diğerleri kendi şubesinin hesaplarını kullanır.
export function hesapAl(c, k, id, { yalnizGorebildigi = true } = {}) {
  if (!id) return null;
  const h = c.q1('SELECT * FROM banka_hesaplari WHERE id=? AND aktif=1', String(id));
  if (!h) fail('Banka hesabı bulunamadı.');
  if (yalnizGorebildigi && k.rol !== 'yonetici' && h.sube_id !== k.sube_id) fail('Bu banka hesabını kullanma yetkiniz yok.', 403);
  return h;
}
const uc = (c, tur, id) => (tur === 'kasa' ? `${c.q1('SELECT ad FROM subeler WHERE id=?', id)?.ad || '?'} kasası` : c.q1('SELECT ad FROM banka_hesaplari WHERE id=?', id)?.ad || 'hesap');

export default {
  ad: 'banka',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS banka_hesaplari(id TEXT PRIMARY KEY, ad TEXT NOT NULL, banka TEXT NOT NULL DEFAULT '', iban TEXT NOT NULL DEFAULT '',
  sube_id TEXT REFERENCES subeler(id), acilis INTEGER NOT NULL DEFAULT 0, aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS para_transferleri(id TEXT PRIMARY KEY, tarih TEXT NOT NULL, tutar INTEGER NOT NULL, kaynak_tur TEXT NOT NULL, kaynak_id TEXT NOT NULL,
  hedef_tur TEXT NOT NULL, hedef_id TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL, iptal INTEGER NOT NULL DEFAULT 0);`);
    for (const t of ['odemeler', 'giderler', 'tedarikci_odemeleri']) sutunEkle(db, t, 'hesap_id', 'TEXT');
  },

  veri(c, k, v) {
    if (!c.hak(k, 'tahsilat') && !c.hak(k, 'kasa')) return;
    const kps = c.kapsam(k);
    // Tahsilat alan personel hesap listesini (adıyla) görür; bakiye ve aktarımlar kasa yetkisiyle.
    const l = c.q(`SELECT * FROM banka_hesaplari WHERE ${kps === null ? '1=1' : 'sube_id=?'} ORDER BY aktif DESC, ad`, ...(kps === null ? [] : [kps]));
    v.bankaHesaplari = l.map((h) => (c.hak(k, 'kasa') ? { ...h, bakiye: hesapBakiye(c, h.id) } : { id: h.id, ad: h.ad, banka: h.banka, sube_id: h.sube_id, aktif: h.aktif }));
    if (c.hak(k, 'kasa')) {
      // Hedef seçimi için bütün kasalar ve hesaplar (adlarıyla) gönderilir: şube merkeze para gönderebilir.
      v.aktarimHedefleri = c.q('SELECT id, ad, sube_id FROM banka_hesaplari WHERE aktif=1 ORDER BY ad');
      const ids = new Set(l.map((h) => h.id));
      v.transferler = c.q('SELECT * FROM para_transferleri ORDER BY tarih DESC, olusturma DESC LIMIT 1000').filter((t) => kps === null
        || (t.kaynak_tur === 'kasa' && t.kaynak_id === kps) || (t.hedef_tur === 'kasa' && t.hedef_id === kps) || ids.has(t.kaynak_id) || ids.has(t.hedef_id));
    }
  },

  islemler: {
    banka_hesap_kaydet(c, k, g) {
      c.hakGerek(k, 'kasa');
      const subeId = g.subeId ? c.subeIzinli(k, g.subeId).id : null;
      if (!subeId && k.rol !== 'yonetici') fail('Kurum geneli hesabı yalnız yönetici açar.', 403);
      const ad = metin(g.ad, 80, true, 'Hesap adı');
      const iban = metin(g.iban, 34).replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
      if (iban && !/^TR\d{24}$/.test(iban)) fail('IBAN TR ile başlayan 26 karakter olmalı.');
      if (g.id) {
        const h = hesapAl(c, k, g.id);
        c.run('UPDATE banka_hesaplari SET ad=?, banka=?, iban=?, sube_id=?, acilis=?, aktif=? WHERE id=?', ad, metin(g.banka, 80), iban, subeId, kurus(g.acilis ?? h.acilis, 'Açılış bakiyesi'),
          g.aktif === undefined ? h.aktif : g.aktif ? 1 : 0, h.id);
        return { olay: [subeId, 'kasa', `Banka hesabı güncellendi: ${ad}`] };
      }
      const id = randomUUID();
      c.run('INSERT INTO banka_hesaplari(id,ad,banka,iban,sube_id,acilis,aktif,olusturma) VALUES(?,?,?,?,?,?,1,?)', id, ad, metin(g.banka, 80), iban, subeId, kurus(g.acilis ?? 0, 'Açılış bakiyesi'), simdi());
      return { sonuc: { id }, olay: [subeId, 'kasa', `Banka hesabı eklendi: ${ad}`] };
    },
    // Aktarım: kaynak kullanıcının kapsamında olmalı; hedef herhangi bir kasa ya da hesap olabilir (ör. merkez).
    para_aktar(c, k, g) {
      c.hakGerek(k, 'kasa');
      const kaynakTur = secim(g.kaynakTur, ['kasa', 'hesap'], 'Kaynak'), hedefTur = secim(g.hedefTur, ['kasa', 'hesap'], 'Hedef');
      const kaynakId = kaynakTur === 'kasa' ? c.subeIzinli(k, g.kaynakId).id : hesapAl(c, k, g.kaynakId).id;
      const hedefId = hedefTur === 'kasa' ? (c.q1('SELECT id FROM subeler WHERE id=? AND aktif=1', String(g.hedefId || ''))?.id || fail('Hedef şube bulunamadı.'))
        : hesapAl(c, k, g.hedefId, { yalnizGorebildigi: false }).id;
      if (kaynakTur === hedefTur && kaynakId === hedefId) fail('Kaynak ve hedef aynı olamaz.');
      const tutar = kurus(g.tutar, 'Tutar', false);
      const tarih = gun(g.tarih || c.bugunStr());
      let not = '';
      if (kaynakTur === 'kasa') not += kasaGunuDenetle(c, k, kaynakId, tarih, 'nakit', g);
      if (hedefTur === 'kasa') not += kasaGunuDenetle(c, k, hedefId, tarih, 'nakit', g);
      const id = randomUUID();
      c.run('INSERT INTO para_transferleri(id,tarih,tutar,kaynak_tur,kaynak_id,hedef_tur,hedef_id,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id, tarih, tutar, kaynakTur, kaynakId, hedefTur, hedefId, metin(g.aciklama, 200), k.ad, simdi());
      const yazi = `Para aktarımı: ${uc(c, kaynakTur, kaynakId)} → ${uc(c, hedefTur, hedefId)} ${tlYaz(tutar)}${not}`;
      const kaynakSube = kaynakTur === 'kasa' ? kaynakId : c.q1('SELECT sube_id FROM banka_hesaplari WHERE id=?', kaynakId)?.sube_id || null;
      const hedefSube = hedefTur === 'kasa' ? hedefId : c.q1('SELECT sube_id FROM banka_hesaplari WHERE id=?', hedefId)?.sube_id || null;
      return { sonuc: { id }, olay: [kaynakSube, 'kasa', yazi], ekOlaylar: hedefSube && hedefSube !== kaynakSube ? [[hedefSube, 'kasa', yazi]] : [] };
    },
    para_aktar_iptal(c, k, g) {
      c.hakGerek(k, 'kasa');
      const t = c.q1('SELECT * FROM para_transferleri WHERE id=? AND iptal=0', metin(g.id, 60, true));
      if (!t) fail('Aktarım bulunamadı.', 404);
      if (t.kaynak_tur === 'kasa') c.subeIzinli(k, t.kaynak_id); else hesapAl(c, k, t.kaynak_id);
      let not = '';
      if (t.kaynak_tur === 'kasa') not += kasaGunuDenetle(c, k, t.kaynak_id, t.tarih, 'nakit', g);
      if (t.hedef_tur === 'kasa') not += kasaGunuDenetle(c, k, t.hedef_id, t.tarih, 'nakit', g);
      c.run('UPDATE para_transferleri SET iptal=1 WHERE id=?', t.id);
      return { olay: [t.kaynak_tur === 'kasa' ? t.kaynak_id : null, 'kasa', `Para aktarımı iptal edildi: ${uc(c, t.kaynak_tur, t.kaynak_id)} → ${uc(c, t.hedef_tur, t.hedef_id)} ${tlYaz(t.tutar)}${not}`] };
    },
  },
};
