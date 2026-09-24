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
    const hesaplar = c.hesapToplu(ogr.filter((o) => o.durum !== 'iptal'));
    let alacak = 0, geciken = 0;
    for (const o of ogr) {
      if (o.durum === 'iptal') continue;
      const h = hesaplar.get(o.id);
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
    // "devir": başka programdan aktarılan eski ödemeler; bu dönemin tahsilatı sayılmaz.
    const tahsilat = t("SELECT COALESCE(SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END),0) v FROM odemeler WHERE sube_id=? AND iptal=0 AND yontem!='devir' AND tarih BETWEEN ? AND ?", bas, bit).v;
    const gider = t('SELECT COALESCE(SUM(tutar),0) v FROM giderler WHERE sube_id=? AND iptal=0 AND tarih BETWEEN ? AND ?', bas, bit).v;
    const yontemler = {};
    for (const r of c.q("SELECT yontem, SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END) v FROM odemeler WHERE sube_id=? AND iptal=0 AND yontem!='devir' AND tarih BETWEEN ? AND ? GROUP BY yontem", s.id, bas, bit)) yontemler[r.yontem] = r.v;
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
    .map((e) => ({ ...e, direksiyon: e.direksiyon || 0, teorik: e.teorik || 0, gelmeyen: e.gelmeyen || 0 }));
  // Grup teorik dersleri (yoklaması alınmış oturumlar) ders saati kadar eğitmene sayılır.
  const grupTeorik = c.q(`SELECT k.id, k.ad, k.sube_id, SUM(t.ders_saati) saat FROM teorik_oturumlar t JOIN kullanicilar k ON k.id=t.egitmen_id
      WHERE t.durum='yapildi' AND t.tarih BETWEEN ? AND ? ${kps === null ? '' : 'AND (t.sube_id=? OR k.sube_id=?)'} GROUP BY k.id`, bas, bit, ...(kps === null ? [] : [kps, kps]));
  for (const g of grupTeorik) {
    let e = egitmenler.find((x) => x.id === g.id);
    if (!e) egitmenler.push((e = { id: g.id, ad: g.ad, sube_id: g.sube_id, direksiyon: 0, teorik: 0, gelmeyen: 0, dakika: 0 }));
    e.grupTeorik = g.saat || 0;
  }
  for (const e of egitmenler) { e.grupTeorik = e.grupTeorik || 0; e.prim = e.direksiyon * a.prim.direksiyon + (e.teorik + e.grupTeorik) * a.prim.teorik; }
  return { bas, bit, satirlar, toplam, egitmenler, alacakYaslari: yas, prim: a.prim };
}

// MEBBİS'e elle girilecek kursiyer bilgileri (karar 16). Otomatik aktarım yoktur; liste Excel'e alınır.
// Kimlik ve adres içerdiği için hem rapor hem hassas bilgi yetkisi gerekir.
function mebbisListesi(c, k, bas, bit) {
  c.hakGerek(k, 'rapor');
  c.hakGerek(k, 'hassas');
  bas = gun(bas, 'Başlangıç'); bit = gun(bit, 'Bitiş');
  const kps = c.kapsam(k);
  const a = c.ayar();
  return c.q(`SELECT o.*, s.ad sube, d.ad donem FROM ogrenciler o JOIN subeler s ON s.id=o.sube_id LEFT JOIN donemler d ON d.id=o.donem_id
      WHERE o.kayit_tarihi BETWEEN ? AND ? AND o.durum!='iptal' ${kps === null ? '' : 'AND o.sube_id=?'} ORDER BY o.kayit_tarihi, o.soyad`, bas, bit, ...(kps === null ? [] : [kps]))
    .map((o) => ({ tc: o.tc, ad: o.ad, soyad: o.soyad, dogum: o.dogum, telefon: o.telefon, adres: o.adres, sinif: o.sinif, sinifAd: a.siniflar[o.sinif]?.ad || o.sinif,
      mevcutEhliyet: o.mevcut_ehliyet, kayitTarihi: o.kayit_tarihi, donem: o.donem || '', sube: o.sube, egitmen: o.egitmen_id ? c.q1('SELECT ad FROM kullanicilar WHERE id=?', o.egitmen_id)?.ad : '',
      ders: c.dersSayaci(o.id) }));
}

// Aylık seriler (grafikler için): son N ay, şube şube ve toplam. Kayıt kaynaklarına göre dağılım ve
// reklam gideri (gider türü "Reklam") ile kayıt başına reklam maliyeti.
function aylikRapor(c, k, aySayisi) {
  c.hakGerek(k, 'rapor');
  const n = Math.min(24, Math.max(3, Number(aySayisi) || 12));
  const kps = c.kapsam(k);
  const subeler = c.q(`SELECT id,ad FROM subeler WHERE ${kps === null ? '1=1' : 'id=?'} ORDER BY merkez DESC, ad`, ...(kps === null ? [] : [kps]));
  const bugun = c.bugunStr();
  const [y0, a0] = bugun.split('-').map(Number);
  const aylar = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y0, a0 - 1 - i, 1));
    const bas = d.toISOString().slice(0, 10);
    const bit = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    aylar.push({ ay: bas.slice(0, 7), bas, bit });
  }
  const sart = kps === null ? '' : ' AND sube_id=?';
  const p = kps === null ? [] : [kps];
  const seri = aylar.map(({ ay, bas, bit }) => {
    const t = (sql, ...x) => c.q1(sql, bas, bit, ...x, ...p);
    const sinav = (tur) => t(`SELECT SUM(sonuc='gecti') g, SUM(sonuc IN ('gecti','kaldi')) n FROM sinavlar WHERE tarih BETWEEN ? AND ? AND tur=?${sart}`, tur);
    const es = sinav('e_sinav'), dr = sinav('direksiyon');
    const subeDagilim = {};
    for (const s of subeler) {
      subeDagilim[s.id] = {
        yeniKayit: c.q1('SELECT COUNT(*) v FROM ogrenciler WHERE kayit_tarihi BETWEEN ? AND ? AND sube_id=?', bas, bit, s.id).v,
        tahsilat: c.q1("SELECT COALESCE(SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END),0) v FROM odemeler WHERE iptal=0 AND yontem!='devir' AND tarih BETWEEN ? AND ? AND sube_id=?", bas, bit, s.id).v,
      };
    }
    return {
      ay,
      yeniKayit: t(`SELECT COUNT(*) v FROM ogrenciler WHERE kayit_tarihi BETWEEN ? AND ?${sart}`).v,
      tahsilat: t(`SELECT COALESCE(SUM(CASE WHEN tur='iade' THEN -tutar ELSE tutar END),0) v FROM odemeler WHERE iptal=0 AND yontem!='devir' AND tarih BETWEEN ? AND ?${sart}`).v,
      gider: t(`SELECT COALESCE(SUM(tutar),0) v FROM giderler WHERE iptal=0 AND tarih BETWEEN ? AND ?${sart}`).v,
      reklam: t(`SELECT COALESCE(SUM(tutar),0) v FROM giderler WHERE iptal=0 AND kategori='Reklam' AND tarih BETWEEN ? AND ?${sart}`).v,
      ders: t(`SELECT COUNT(*) v FROM dersler WHERE durum='tamamlandi' AND tarih BETWEEN ? AND ?${sart}`).v,
      eSinav: { gecen: es.g || 0, giren: es.n || 0 }, direksiyonSinav: { gecen: dr.g || 0, giren: dr.n || 0 },
      subeler: subeDagilim,
    };
  });
  const bas = aylar[0].bas, bit = aylar[aylar.length - 1].bit;
  const kaynaklar = c.q(`SELECT COALESCE(NULLIF(kaynak,''),'Belirtilmemiş') kaynak, COUNT(*) sayi, COALESCE(SUM(ucret),0) ciro FROM ogrenciler
    WHERE kayit_tarihi BETWEEN ? AND ?${sart} GROUP BY 1 ORDER BY sayi DESC`, bas, bit, ...p);
  const adaylar = c.q(`SELECT COALESCE(NULLIF(kaynak,''),'Belirtilmemiş') kaynak, COUNT(*) sayi, SUM(durum='kayit') kayit FROM adaylar
    WHERE substr(olusturma,1,10) BETWEEN ? AND ? ${kps === null ? '' : 'AND (sube_id=? OR sube_id IS NULL)'} GROUP BY 1 ORDER BY sayi DESC`, bas, bit, ...p);
  const reklam = seri.reduce((a, x) => a + x.reklam, 0), kayit = seri.reduce((a, x) => a + x.yeniKayit, 0);
  return { aylar: seri, subeler, kaynaklar, adaylar, reklam, kayitBasiReklam: kayit ? Math.round(reklam / kayit) : 0 };
}

export default {
  ad: 'rapor',
  yol(c, k, { yontem, yol, sorgu }) {
    if (yol === '/api/rapor' && yontem === 'GET') return { durum: 200, veri: rapor(c, k, sorgu.get('bas'), sorgu.get('bit')) };
    if (yol === '/api/rapor-aylik' && yontem === 'GET') return { durum: 200, veri: aylikRapor(c, k, sorgu.get('ay')) };
    if (yol === '/api/mebbis' && yontem === 'GET') {
      const liste = mebbisListesi(c, k, sorgu.get('bas'), sorgu.get('bit'));
      c.erisimYaz(k, null, 'mebbis', `MEBBİS kursiyer listesi: ${liste.length} kişi (${sorgu.get('bas')} - ${sorgu.get('bit')})`);
      return { durum: 200, veri: { liste } };
    }
    return null;
  },
};
