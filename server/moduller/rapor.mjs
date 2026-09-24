// Raporlar: şube karşılaştırması ve şubeler toplamı, eğitmen ders ve prim raporu, geciken alacak yaşları.
import { fail, gun } from '../domain.mjs';

function rapor(c, k, bas, bit) {
  c.hakGerek(k, 'rapor');
  bas = gun(bas, 'Başlangıç'); bit = gun(bit, 'Bitiş');
  if (bas > bit) fail('Başlangıç tarihi bitişten sonra olamaz.');
  const a = c.ayar();
  const kps = c.kapsam(k);
  const subeler = c.q(`SELECT id,ad FROM subeler WHERE ${kps === null ? '1=1' : 'id=?'} ORDER BY merkez DESC, ad`, ...(kps === null ? [] : [kps]));
  const bugun = c.bugunStr();
  const yas = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const satirlar = subeler.map((s) => {
    const t = (sql, ...p) => c.q1(sql, s.id, ...p);
    const ogr = c.q('SELECT * FROM ogrenciler WHERE sube_id=?', s.id);
    let alacak = 0, geciken = 0;
    for (const o of ogr) {
      if (o.durum === 'iptal') continue;
      const h = c.hesap(o);
      alacak += Math.max(0, h.kalan);
      geciken += h.geciken;
      // Geciken tutarın yaşı: ödenmemiş en eski gecikmiş taksidin vadesinden bugüne.
      const ilk = h.taksitler.find((x) => x.durum === 'gecikti');
      if (ilk && h.geciken > 0) {
        const g = Math.floor((Date.parse(bugun) - Date.parse(ilk.vade)) / 86400000);
        yas[g <= 30 ? '0-30' : g <= 60 ? '31-60' : g <= 90 ? '61-90' : '90+'] += h.geciken;
      }
    }
    const sinav = (tur) => t(`SELECT SUM(sonuc='gecti') g, SUM(sonuc IN ('gecti','kaldi')) n FROM sinavlar WHERE sube_id=? AND tur=? AND tarih BETWEEN ? AND ?`, tur, bas, bit);
    const es = sinav('e_sinav'), dr = sinav('direksiyon');
    const tahsilat = t("SELECT COALESCE(SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END),0) v FROM odemeler WHERE sube_id=? AND iptal=0 AND tarih BETWEEN ? AND ?", bas, bit).v;
    const gider = t('SELECT COALESCE(SUM(tutar),0) v FROM giderler WHERE sube_id=? AND iptal=0 AND tarih BETWEEN ? AND ?', bas, bit).v;
    const yontemler = {};
    for (const r of c.q("SELECT yontem, SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END) v FROM odemeler WHERE sube_id=? AND iptal=0 AND tarih BETWEEN ? AND ? GROUP BY yontem", s.id, bas, bit)) yontemler[r.yontem] = r.v;
    return {
      sube_id: s.id, sube: s.ad,
      yeniKayit: t('SELECT COUNT(*) v FROM ogrenciler WHERE sube_id=? AND kayit_tarihi BETWEEN ? AND ?', bas, bit).v,
      aktifOgrenci: ogr.filter((o) => o.durum === 'aktif').length,
      tamamlananDers: t("SELECT COUNT(*) v FROM dersler WHERE sube_id=? AND durum='tamamlandi' AND tarih BETWEEN ? AND ?", bas, bit).v,
      gelmeyen: t("SELECT COUNT(*) v FROM dersler WHERE sube_id=? AND durum='gelmedi' AND tarih BETWEEN ? AND ?", bas, bit).v,
      eSinav: { gecen: es.g || 0, giren: es.n || 0 }, direksiyonSinav: { gecen: dr.g || 0, giren: dr.n || 0 },
      tahsilat, gider, net: tahsilat - gider, alacak, geciken, yontemler,
      tedarikciBorcu: t('SELECT COALESCE(SUM(tutar),0) v FROM giderler WHERE sube_id=? AND veresiye=1 AND iptal=0').v - t('SELECT COALESCE(SUM(tutar),0) v FROM tedarikci_odemeleri WHERE sube_id=? AND iptal=0').v,
    };
  });
  const top = (f) => satirlar.reduce((x, r) => x + f(r), 0);
  const yontemTop = {};
  for (const r of satirlar) for (const [y, v] of Object.entries(r.yontemler)) yontemTop[y] = (yontemTop[y] || 0) + v;
  const toplam = {
    sube: 'Şubeler toplamı', yeniKayit: top((r) => r.yeniKayit), aktifOgrenci: top((r) => r.aktifOgrenci),
    tamamlananDers: top((r) => r.tamamlananDers), gelmeyen: top((r) => r.gelmeyen),
    eSinav: { gecen: top((r) => r.eSinav.gecen), giren: top((r) => r.eSinav.giren) },
    direksiyonSinav: { gecen: top((r) => r.direksiyonSinav.gecen), giren: top((r) => r.direksiyonSinav.giren) },
    tahsilat: top((r) => r.tahsilat), gider: top((r) => r.gider), net: top((r) => r.net), alacak: top((r) => r.alacak),
    geciken: top((r) => r.geciken), yontemler: yontemTop, tedarikciBorcu: top((r) => r.tedarikciBorcu),
  };
  // Eğitmen raporu ve ders başı prim (karar 10). Görevlendirmeyle başka şubede verilen dersler de eğitmene sayılır.
  const egitmenler = c.q(
    `SELECT k.id, k.ad, k.sube_id, SUM(d.tur='direksiyon' AND d.durum='tamamlandi') direksiyon, SUM(d.tur='teorik' AND d.durum='tamamlandi') teorik,
       SUM(d.durum='gelmedi') gelmeyen, COALESCE(SUM(CASE WHEN d.durum='tamamlandi' THEN d.sure_dk END),0) dakika
     FROM dersler d JOIN kullanicilar k ON k.id=d.egitmen_id WHERE d.tarih BETWEEN ? AND ? ${kps === null ? '' : 'AND (d.sube_id=? OR k.sube_id=?)'}
     GROUP BY k.id ORDER BY direksiyon DESC`, bas, bit, ...(kps === null ? [] : [kps, kps]))
    .map((e) => ({ ...e, direksiyon: e.direksiyon || 0, teorik: e.teorik || 0, gelmeyen: e.gelmeyen || 0,
      prim: (e.direksiyon || 0) * a.prim.direksiyon + (e.teorik || 0) * a.prim.teorik }));
  return { bas, bit, satirlar, toplam, egitmenler, alacakYaslari: yas, prim: a.prim };
}

export default {
  ad: 'rapor',
  yol(c, k, { yontem, yol, sorgu }) {
    if (yol === '/api/rapor' && yontem === 'GET') return { durum: 200, veri: rapor(c, k, sorgu.get('bas'), sorgu.get('bit')) };
    return null;
  },
};
