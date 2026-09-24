// Fatura: uygulamanın verdiği makbuz yasal fatura yerine geçmez. Kurum faturayı kendi e-arşiv / e-fatura
// sisteminden (ya da muhasebecisi) keser. Bu bölüm:
//  - muhasebeciye verilecek "fatura kesilecek tahsilatlar" listesini (Excel) hazırlar: kişi, kimlik, adres, matrah, KDV;
//  - kesilen faturanın numarasını tahsilata işler, böylece hangi tahsilatın faturasının kesilmediği görünür.
// E-arşiv sağlayıcısına doğrudan bağlantı yoktur (sağlayıcı seçilince eklenebilir).
// DİKKAT: KDV oranı ayardan değişir; kurumun muhasebecisiyle doğrulanmalıdır.
import { fail, metin, gun, tamSayi } from '../domain.mjs';
import { sutunEkle } from '../db-ortak.mjs';

const adSoyad = (o) => `${o.ad} ${o.soyad}`;

export default {
  ad: 'fatura',
  sema(db) {
    sutunEkle(db, 'odemeler', 'fatura_no', "TEXT NOT NULL DEFAULT ''");
    sutunEkle(db, 'odemeler', 'fatura_tarih', "TEXT NOT NULL DEFAULT ''");
  },

  veri(c, k, v) {
    if (c.hak(k, 'tahsilat')) v.tanimlar.fatura = c.ayar().fatura;
  },

  islemler: {
    fatura_isaretle(c, k, g) {
      c.hakGerek(k, 'tahsilat');
      if (!Array.isArray(g.idler) || !g.idler.length) fail('Tahsilat seçin.');
      if (g.idler.length > 500) fail('Bir seferde en fazla 500 tahsilat işaretlenir.');
      const no = metin(g.faturaNo, 40);
      const tarih = no ? gun(g.tarih || c.bugunStr(), 'Fatura tarihi') : '';
      let n = 0, sube = null;
      for (const id of g.idler) {
        const od = c.q1('SELECT * FROM odemeler WHERE id=?', String(id));
        if (!od || od.iptal) continue;
        c.ogrenciAl(k, od.ogrenci_id);
        c.run('UPDATE odemeler SET fatura_no=?, fatura_tarih=? WHERE id=?', no, tarih, od.id);
        n++; sube = od.sube_id;
      }
      return { sonuc: { sayi: n }, olay: [sube, 'odeme', no ? `${n} tahsilat için fatura işlendi: ${no}` : `${n} tahsilatın fatura işareti kaldırıldı`] };
    },
  },

  yol(c, k, { yontem, yol, sorgu }) {
    if (yol !== '/api/fatura-listesi' || yontem !== 'GET') return null;
    c.hakGerek(k, 'tahsilat');
    const bas = gun(sorgu.get('bas'), 'Başlangıç'), bit = gun(sorgu.get('bit'), 'Bitiş');
    const durum = String(sorgu.get('durum') || '');
    const kps = c.kapsam(k);
    const hassas = c.hak(k, 'hassas');
    const kdv = tamSayi(c.ayar().fatura.kdvOrani, 0, 100, 'KDV oranı');
    const l = c.q(`SELECT x.*, o.ad, o.soyad, o.tc, o.adres, o.telefon, o.eposta, s.ad sube FROM odemeler x JOIN ogrenciler o ON o.id=x.ogrenci_id JOIN subeler s ON s.id=x.sube_id
      WHERE x.iptal=0 AND x.yontem!='devir' AND x.tarih BETWEEN ? AND ? ${kps === null ? '' : 'AND x.sube_id=?'}
      ${durum === 'kesilmemis' ? "AND x.fatura_no=''" : durum === 'kesilmis' ? "AND x.fatura_no!=''" : ''} ORDER BY x.tarih, x.makbuz_no`, bas, bit, ...(kps === null ? [] : [kps]));
    if (hassas) c.erisimYaz(k, null, 'fatura', `Fatura listesi (kimlik ve adresli): ${l.length} satır`);
    return {
      durum: 200,
      veri: {
        kdvOrani: kdv,
        liste: l.map((x) => {
          const brut = x.tur === 'iade' ? -x.tutar : x.tutar;
          // KDV dahil tutardan matrah: tutar / (1 + oran). Kuruş yuvarlaması matraha yansır.
          const matrah = Math.round(brut / (1 + kdv / 100));
          return {
            id: x.id, tarih: x.tarih, makbuz: x.makbuz_no, sube: x.sube, ad: adSoyad(x), tc: hassas ? x.tc : c.tcMaskele(x.tc), adres: hassas ? x.adres : '',
            telefon: x.telefon, eposta: x.eposta, tur: x.tur, yontem: x.yontem, tutar: brut, matrah, kdv: brut - matrah, faturaNo: x.fatura_no, faturaTarih: x.fatura_tarih,
          };
        }),
      },
    };
  },
};
