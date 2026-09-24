// Senet ve çek takibi: kurs taksit karşılığında öğrenciden senet (bono) ya da çek alır.
//  - Senet/çek borcu DEĞİŞTİRMEZ; yalnız borcun güvencesidir. Tahsil edilince normal ödeme (makbuzlu) yazılır.
//  - Durumlar: portföyde (elde), tahsil edildi, karşılıksız / protestolu, iade edildi.
//  - Vadesi yaklaşan ve geçen senetler Özet'te ve Kasa > Senetler'de görünür.
import { randomUUID } from 'node:crypto';
import { fail, metin, kurus, gun, secim, tlYaz } from '../domain.mjs';
import { makbuzNo } from './ogrenci.mjs';
import { kasaGunuDenetle } from './para.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;
export const SENET_DURUM = { portfoy: 'Portföyde', tahsil: 'Tahsil edildi', karsiliksiz: 'Karşılıksız / protestolu', iade: 'İade edildi' };

function senetAl(c, k, id) {
  const x = c.q1('SELECT * FROM senetler WHERE id=?', metin(id, 60, true, 'Senet'));
  if (!x) fail('Senet bulunamadı.', 404);
  const o = c.ogrenciAl(k, x.ogrenci_id);
  return { x, o };
}

export default {
  ad: 'senet',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS senetler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  tur TEXT NOT NULL, no TEXT NOT NULL DEFAULT '', banka TEXT NOT NULL DEFAULT '', borclu TEXT NOT NULL DEFAULT '', vade TEXT NOT NULL, tutar INTEGER NOT NULL,
  durum TEXT NOT NULL DEFAULT 'portfoy', odeme_id TEXT, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL, guncelleme TEXT);
CREATE INDEX IF NOT EXISTS senet_ogr ON senetler(ogrenci_id);
CREATE INDEX IF NOT EXISTS senet_vade ON senetler(vade);`);
  },

  veri(c, k, v) {
    if (!c.hak(k, 'tahsilat')) return;
    const gorunen = new Set(v.ogrenciler.map((o) => o.id));
    v.senetler = c.q('SELECT * FROM senetler ORDER BY vade').filter((x) => gorunen.has(x.ogrenci_id));
  },

  islemler: {
    // Tek senet ya da öğrencinin ödenmemiş taksitleri için birer senet.
    senet_ekle(c, k, g) {
      c.hakGerek(k, 'tahsilat');
      const o = c.ogrenciAl(k, g.ogrenciId);
      const tur = secim(g.tur || 'senet', ['senet', 'cek'], 'Tür');
      const borclu = metin(g.borclu || adSoyad(o), 120);
      const satirlar = [];
      if (g.taksitlerden) {
        const h = c.hesap(o);
        for (const t of h.taksitler) if (t.durum !== 'odendi' && !t.ek) satirlar.push({ vade: t.vade, tutar: t.tutar - t.odenen });
        if (!satirlar.length) fail('Ödenmemiş taksit yok.');
      } else satirlar.push({ vade: gun(g.vade, 'Vade'), tutar: kurus(g.tutar, 'Tutar', false) });
      const acik = c.q1("SELECT COALESCE(SUM(tutar),0) t FROM senetler WHERE ogrenci_id=? AND durum='portfoy'", o.id).t;
      const kalan = c.hesap(o).kalan;
      const toplam = satirlar.reduce((a, x) => a + x.tutar, 0);
      if (acik + toplam > kalan) fail(`Senetlerin toplamı (${tlYaz(acik + toplam)}) kalan borçtan (${tlYaz(kalan)}) fazla olamaz.`);
      const ilkNo = metin(g.no, 40);
      satirlar.forEach((x, i) => {
        c.run('INSERT INTO senetler(id,ogrenci_id,sube_id,tur,no,banka,borclu,vade,tutar,durum,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          randomUUID(), o.id, o.sube_id, tur, ilkNo && satirlar.length > 1 ? `${ilkNo}-${i + 1}` : ilkNo, metin(g.banka, 80), borclu, x.vade, x.tutar, 'portfoy', metin(g.aciklama, 200), k.ad, simdi());
      });
      return { sonuc: { sayi: satirlar.length }, olay: [o.sube_id, 'odeme', `${adSoyad(o)} için ${satirlar.length} ${tur === 'cek' ? 'çek' : 'senet'} alındı: ${tlYaz(toplam)}`] };
    },
    // Tahsil: ödeme yazılır (makbuzlu), senet kapanır.
    senet_tahsil(c, k, g) {
      c.hakGerek(k, 'tahsilat');
      const { x, o } = senetAl(c, k, g.id);
      if (x.durum !== 'portfoy' && x.durum !== 'karsiliksiz') fail('Bu senet tahsil edilemez.');
      const kalan = c.hesap(o).kalan;
      if (x.tutar > kalan) fail(`Senet tutarı kalan borçtan (${tlYaz(kalan)}) büyük; önce borcu kontrol edin.`);
      const tarih = gun(g.tarih || c.bugunStr()), yontem = secim(g.yontem || 'nakit', ['nakit', 'kart', 'havale'], 'Ödeme şekli');
      const not = kasaGunuDenetle(c, k, o.sube_id, tarih, yontem, g);
      const odemeId = randomUUID(), no = makbuzNo(c, o.sube_id);
      c.run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,?,?,?,?,'odeme',?)",
        odemeId, o.id, o.sube_id, x.tutar, tarih, yontem, `${x.tur === 'cek' ? 'Çek' : 'Senet'} tahsili${x.no ? ` (${x.no})` : ''}`, k.ad, simdi(), no);
      c.run("UPDATE senetler SET durum='tahsil', odeme_id=?, guncelleme=? WHERE id=?", odemeId, simdi(), x.id);
      return { sonuc: { odemeId, makbuzNo: no }, olay: [o.sube_id, 'odeme', `${adSoyad(o)} ${x.tur === 'cek' ? 'çeki' : 'senedi'} tahsil edildi: ${tlYaz(x.tutar)} (makbuz ${no})${not}`] };
    },
    // Karşılıksız / protesto, iade ya da yeniden portföye alma. Tahsil edilmiş senet buradan geri alınmaz
    // (önce ödemesi iptal edilir).
    senet_durum(c, k, g) {
      c.hakGerek(k, 'kasa');
      const { x, o } = senetAl(c, k, g.id);
      const durum = secim(g.durum, ['portfoy', 'karsiliksiz', 'iade'], 'Durum');
      if (x.durum === 'tahsil') {
        const od = x.odeme_id ? c.q1('SELECT iptal FROM odemeler WHERE id=?', x.odeme_id) : null;
        if (od && !od.iptal) fail('Tahsil edilmiş senedin durumu değişmez; önce tahsilat ödemesini iptal edin.');
      }
      c.run('UPDATE senetler SET durum=?, aciklama=?, guncelleme=? WHERE id=?', durum, metin(g.aciklama ?? x.aciklama, 200), simdi(), x.id);
      return { olay: [o.sube_id, 'kasa', `${adSoyad(o)} ${x.tur === 'cek' ? 'çeki' : 'senedi'} (${tlYaz(x.tutar)}, vade ${x.vade}): ${SENET_DURUM[durum]}`] };
    },
  },
};
