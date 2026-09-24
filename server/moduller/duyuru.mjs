// Duyurular: öğrencinin kendi ekranında, yayın tarihleri arasında görünür. Şubeye ya da bütün kuruma.
import { randomUUID } from 'node:crypto';
import { fail, metin, gun } from '../domain.mjs';

const simdi = () => new Date().toISOString();

export default {
  ad: 'duyuru',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS duyurular(id TEXT PRIMARY KEY, sube_id TEXT REFERENCES subeler(id), baslik TEXT NOT NULL, metin TEXT NOT NULL,
  bas TEXT NOT NULL, bit TEXT NOT NULL, kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL, silindi INTEGER NOT NULL DEFAULT 0);`);
  },
  veri(c, k, v) {
    if (!c.hak(k, 'kayit')) return;
    const kps = c.kapsam(k);
    v.duyurular = c.q(`SELECT * FROM duyurular WHERE silindi=0 AND ${kps === null ? '1=1' : '(sube_id IS NULL OR sube_id=?)'} ORDER BY bas DESC LIMIT 100`, ...(kps === null ? [] : [kps]));
  },
  islemler: {
    duyuru_ekle(c, k, g) {
      c.hakGerek(k, 'kayit');
      // Yönetici bütün kuruma (şubesiz) duyuru verebilir; diğerleri yalnız kendi şubesine.
      const subeId = k.rol === 'yonetici' ? (g.subeId || null) : k.sube_id;
      if (subeId) c.subeIzinli(k, subeId);
      const bas = gun(g.bas || c.bugunStr(), 'Başlangıç'), bit = gun(g.bit || bas, 'Bitiş');
      if (bas > bit) fail('Başlangıç bitişten sonra olamaz.');
      const baslik = metin(g.baslik, 120, true, 'Başlık');
      c.run('INSERT INTO duyurular(id,sube_id,baslik,metin,bas,bit,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?)',
        randomUUID(), subeId, baslik, metin(g.metin, 2000, true, 'Metin'), bas, bit, k.ad, simdi());
      return { olay: [subeId, 'duyuru', `Duyuru yayınlandı: ${baslik}`] };
    },
    duyuru_sil(c, k, g) {
      c.hakGerek(k, 'kayit');
      const d = c.q1('SELECT * FROM duyurular WHERE id=? AND silindi=0', metin(g.id, 60, true));
      if (!d) fail('Duyuru bulunamadı.', 404);
      if (k.rol !== 'yonetici' && d.sube_id !== k.sube_id) fail('Bu duyuruyu yalnız merkez kaldırabilir.', 403);
      c.run('UPDATE duyurular SET silindi=1 WHERE id=?', d.id);
      return { olay: [d.sube_id, 'duyuru', `Duyuru kaldırıldı: ${d.baslik}`] };
    },
  },
  ogrenciVeri(c, o, v) {
    const b = c.bugunStr();
    v.duyurular = c.q('SELECT id,baslik,metin,bas FROM duyurular WHERE silindi=0 AND bas<=? AND bit>=? AND (sube_id IS NULL OR sube_id=?) ORDER BY bas DESC', b, b, o.sube_id);
  },
};
