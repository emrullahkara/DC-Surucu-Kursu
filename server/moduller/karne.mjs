// Direksiyon eğitim karnesi: eğitmen her dersten sonra çalışılan konuları 1-5 arasında puanlar ve not düşer.
// Öğrencinin hangi konuda eksik olduğu görünür; "sınava hazır" işareti eğitmen tarafından konur.
// Hem sınav başarısını artırır hem de "ders verilmedi" şikâyetinde kayıt olur.
import { fail, metin, tamSayi } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;

export const KARNE_KONULARI = ['Araç kontrolü ve hazırlık', 'Kalkış ve duruş', 'Vites ve debriyaj', 'Direksiyon hakimiyeti', 'Şerit takibi ve ayna kullanımı',
  'Kavşak ve dönüşler', 'Trafik işaret ve kurallarına uyum', 'Rampa kalkışı', 'Paralel park', 'Geri manevra', 'Şehir içi trafikte sürüş', 'Şehir dışı yolda sürüş'];

// Konu başına son puan ve ortalama.
export function karneOzeti(c, ogrenciId) {
  const l = c.q('SELECT k.*, d.tarih FROM ders_karneleri k JOIN dersler d ON d.id=k.ders_id WHERE k.ogrenci_id=? ORDER BY d.tarih, d.saat', ogrenciId);
  const konular = {};
  for (const x of l) {
    let p = {};
    try { p = JSON.parse(x.puanlar || '{}'); } catch { p = {}; }
    for (const [konu, puan] of Object.entries(p)) {
      const y = (konular[konu] ||= { son: 0, toplam: 0, sayi: 0 });
      y.son = puan; y.toplam += puan; y.sayi++;
    }
  }
  return {
    dersler: l.map((x) => ({ ders_id: x.ders_id, tarih: x.tarih, puanlar: JSON.parse(x.puanlar || '{}'), notu: x.notu, kaydeden: x.kaydeden })),
    konular: Object.fromEntries(Object.entries(konular).map(([k, y]) => [k, { son: y.son, ortalama: Math.round((y.toplam / y.sayi) * 10) / 10, sayi: y.sayi }])),
  };
}

export default {
  ad: 'karne',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS ders_karneleri(ders_id TEXT PRIMARY KEY REFERENCES dersler(id), ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id),
  puanlar TEXT NOT NULL, notu TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, zaman TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS karne_ogr ON ders_karneleri(ogrenci_id);`);
  },

  veri(c, k, v) {
    v.tanimlar.karneKonulari = c.ayar().karneKonulari;
    const gorunen = new Set(v.ogrenciler.map((o) => o.id));
    v.karneler = c.q('SELECT ders_id, ogrenci_id, puanlar, notu, kaydeden, zaman FROM ders_karneleri ORDER BY zaman DESC LIMIT 5000')
      .filter((x) => gorunen.has(x.ogrenci_id)).map((x) => ({ ...x, puanlar: JSON.parse(x.puanlar || '{}') }));
  },

  islemler: {
    // Dersin eğitmeni ya da ders yetkisi olan personel; ders tamamlanmış olmalı. Tekrar kaydedilirse üzerine yazar.
    karne_kaydet(c, k, g) {
      const d = c.q1('SELECT * FROM dersler WHERE id=?', metin(g.dersId, 60, true, 'Ders'));
      if (!d) fail('Ders bulunamadı.', 404);
      const o = c.ogrenciAl(k, d.ogrenci_id);
      if (d.egitmen_id !== k.id && !c.hak(k, 'ders')) fail('Yalnız dersi veren eğitmen karne doldurur.', 403);
      if (d.durum !== 'tamamlandi') fail('Karne yalnız tamamlanan ders için doldurulur.');
      if (!g.puanlar || typeof g.puanlar !== 'object') fail('Puanlar geçersiz.');
      const konular = c.ayar().karneKonulari;
      const puanlar = {};
      for (const [konu, p] of Object.entries(g.puanlar)) {
        if (!konular.includes(konu) || p === '' || p === null || p === undefined || p === 0) continue;
        puanlar[konu] = tamSayi(p, 1, 5, `${konu} puanı`);
      }
      if (!Object.keys(puanlar).length && !g.notu) fail('En az bir konu puanlayın ya da not yazın.');
      c.run('INSERT INTO ders_karneleri(ders_id,ogrenci_id,puanlar,notu,kaydeden,zaman) VALUES(?,?,?,?,?,?) ON CONFLICT(ders_id) DO UPDATE SET puanlar=excluded.puanlar, notu=excluded.notu, kaydeden=excluded.kaydeden, zaman=excluded.zaman',
        d.id, o.id, JSON.stringify(puanlar), metin(g.notu, 500), k.ad, simdi());
      return { olay: [d.sube_id, 'ders', `${adSoyad(o)} ders karnesi dolduruldu (${Object.keys(puanlar).length} konu)`, { egitmen: d.egitmen_id }] };
    },
    // "Sınava hazır" işareti (ya da kaldırma). Öğrencinin eğitmeni ya da ders yetkisi olan personel.
    sinava_hazir(c, k, g) {
      const o = c.ogrenciAl(k, g.ogrenciId);
      if (o.egitmen_id !== k.id && !c.hak(k, 'ders')) fail('Yalnız öğrencinin eğitmeni işaretler.', 403);
      const deger = g.hazir ? JSON.stringify({ tarih: c.bugunStr(), kim: k.ad, notu: metin(g.notu, 200) }) : '';
      c.run('UPDATE ogrenciler SET sinava_hazir=? WHERE id=?', deger, o.id);
      return { olay: [o.sube_id, 'ders', `${adSoyad(o)} ${g.hazir ? 'direksiyon sınavına HAZIR olarak işaretlendi' : 'sınava hazır işareti kaldırıldı'} (${k.ad})`, { egitmen: o.egitmen_id }] };
    },
  },

  ogrenciVeri(c, o, v) {
    v.karne = { ...karneOzeti(c, o.id), konuListesi: c.ayar().karneKonulari, hazir: o.sinava_hazir ? JSON.parse(o.sinava_hazir) : null };
  },
};
