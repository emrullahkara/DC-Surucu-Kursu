// Kişisel verilerin korunması (KVKK):
//  - Aydınlatma metni ve açık rıza: kayıtta onay alınır, tarihi ve alan kişi saklanır; öğrenci metni kendi ekranında görür.
//  - Veri isteme hakkı: kurum bir öğrencinin bütün kaydını dökebilir; öğrenci kendi verisini kendi ekranından indirir.
//  - Saklama süresi: kursu biten ya da iptal olan kayıtlar süre dolunca ANONİM hale getirilir (ad, kimlik, telefon,
//    adres, evrak silinir; para ve ders sayıları isimsiz kalır, raporlar bozulmaz).
//  - Erişim kaydı: evrak açma, MEBBİS listesi, veri dökümü kim tarafından, ne zaman yapıldı.
// DİKKAT: Metin ve süreler örnektir; kurumun hukuk danışmanı tarafından kontrol edilmelidir.
import { fail, metin } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;

export const VARSAYILAN_AYDINLATMA = `KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ

{KURUM} olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla; kimlik (ad, soyad, T.C. kimlik no, doğum tarihi), iletişim (telefon, adres, e-posta), sağlık raporu, öğrenim belgesi, fotoğraf ve ödeme bilgilerinizi;
- sürücü kursu eğitiminizin planlanması ve yürütülmesi,
- Milli Eğitim Bakanlığı sistemlerine (MEBBİS) yapılması zorunlu bildirimler ve sınav başvuruları,
- ödeme ve muhasebe işlemleri, yasal saklama yükümlülükleri,
- ders, sınav ve ödeme hatırlatmaları
amaçlarıyla işlemekteyiz.

Verileriniz yalnız bu amaçlarla, yetkili kurum personeli tarafından görülür; kanunen yetkili kamu kurumları dışında üçüncü kişilerle paylaşılmaz. Eğitim sonrası yasal saklama süresi dolunca silinir ya da anonim hale getirilir.

Kanunun 11. maddesi uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini ya da silinmesini isteme haklarına sahipsiniz. Başvurularınızı kurumumuza yazılı olarak iletebilirsiniz.`;

// Anonimleştirme: kişiyi tanıtan her şey silinir, sayılar kalır. Geri alınamaz.
function anonimlestir(c, o) {
  c.run(`UPDATE ogrenciler SET ad='Anonim', soyad='Kişi', tc='', telefon='', dogum='', adres='', eposta='', notlar='', veli_ad='', veli_telefon='', veli_yakinlik='',
    portal_sifre=NULL, portal_sifre_gecici=0, anonim=1 WHERE id=?`, o.id);
  const ev = c.q('SELECT id FROM evraklar WHERE ogrenci_id=?', o.id);
  for (const e of ev) c.run('DELETE FROM evrak_dosyalari WHERE evrak_id=?', e.id);
  c.run('DELETE FROM evraklar WHERE ogrenci_id=?', o.id);
  c.run("DELETE FROM oturumlar WHERE tur='ogrenci' AND kimlik=?", o.id);
  c.run('UPDATE dersler SET konum=NULL WHERE ogrenci_id=?', o.id);
}

// Bir öğrencinin kurumdaki bütün kaydı (veri isteme hakkı). Evrakın kendisi değil listesi verilir.
function kisiselDokum(c, o) {
  const a = c.ayar();
  const sube = c.q1('SELECT ad FROM subeler WHERE id=?', o.sube_id)?.ad || '';
  const egitmen = o.egitmen_id ? c.q1('SELECT ad FROM kullanicilar WHERE id=?', o.egitmen_id)?.ad : '';
  return {
    olusturma: simdi(), kurum: c.q1('SELECT ad FROM kurum')?.ad || '',
    kimlik: { ad: o.ad, soyad: o.soyad, tc: o.tc, dogum: o.dogum, telefon: o.telefon, eposta: o.eposta, adres: o.adres,
      veli: o.veli_ad ? { ad: o.veli_ad, telefon: o.veli_telefon, yakinlik: o.veli_yakinlik } : null },
    kurs: { sube, sinif: a.siniflar[o.sinif]?.ad || o.sinif, kayitTarihi: o.kayit_tarihi, durum: o.durum, egitmen, elindekiEhliyet: o.mevcut_ehliyet, kaynak: o.kaynak },
    kisiselVeriOnayi: o.kvkk_onay ? JSON.parse(o.kvkk_onay) : null,
    dersler: c.q('SELECT tur,tarih,saat,sure_dk,durum FROM dersler WHERE ogrenci_id=? ORDER BY tarih', o.id),
    teorikYoklama: c.q('SELECT t.tarih, t.konu, y.durum FROM yoklamalar y JOIN teorik_oturumlar t ON t.id=y.oturum_id WHERE y.ogrenci_id=? ORDER BY t.tarih', o.id),
    sinavlar: c.q('SELECT tur,tarih,deneme,sonuc,puan,yer FROM sinavlar WHERE ogrenci_id=? ORDER BY tarih', o.id),
    odemeler: c.q('SELECT tarih,tutar,yontem,tur,makbuz_no,iptal FROM odemeler WHERE ogrenci_id=? ORDER BY tarih', o.id),
    ucretKalemleri: c.q('SELECT tarih,tur,aciklama,tutar,iptal FROM ucret_kalemleri WHERE ogrenci_id=? ORDER BY tarih', o.id),
    evraklar: c.q('SELECT tur,ad,olusturma FROM evraklar WHERE ogrenci_id=? ORDER BY olusturma', o.id),
    hesap: c.hesap(o),
    erisimKaydi: c.q('SELECT zaman,kullanici,tur,aciklama FROM kisisel_veri_erisim WHERE ogrenci_id=? ORDER BY id DESC LIMIT 200', o.id),
  };
}
const indir = (ad, veri) => ({ durum: 200, ham: { basliklar: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${ad}"` }, govde: JSON.stringify(veri, null, 2) } });

export default {
  ad: 'kvkk',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS kisisel_veri_erisim(id INTEGER PRIMARY KEY AUTOINCREMENT, zaman TEXT NOT NULL, kullanici TEXT NOT NULL,
  ogrenci_id TEXT, tur TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS kve_ogr ON kisisel_veri_erisim(ogrenci_id);`);
  },

  veri(c, k, v) {
    const a = c.ayar();
    v.tanimlar.kvkk = { metin: (a.kvkk.metin || VARSAYILAN_AYDINLATMA).replaceAll('{KURUM}', v.kurum.ad), saklamaYil: a.kvkk.saklamaYil };
    // Saklama süresi dolmuş, anonim yapılmayı bekleyen kayıt sayısı (yalnız yönetici).
    if (k.rol === 'yonetici') v.anonimBekleyen = suresiDolanlar(c).length;
  },

  islemler: {
    // Kayıt sırasında alınamamış onayın sonradan işlenmesi (imzalı onay formu teslim alındığında).
    kvkk_onay(c, k, g) {
      c.hakGerek(k, 'kayit');
      const o = c.ogrenciAl(k, g.ogrenciId);
      c.run('UPDATE ogrenciler SET kvkk_onay=? WHERE id=?', JSON.stringify({ tarih: simdi(), kaydeden: k.ad, surum: c.ayar().kvkk.surum || 1, yol: 'sonradan' }), o.id);
      return { olay: [o.sube_id, 'kayit', `${adSoyad(o)} kişisel veri onayı alındı`] };
    },
    ogrenci_anonimlestir(c, k, g) {
      if (k.rol !== 'yonetici') fail('Kişisel veriyi yalnız yönetici siler.', 403);
      const o = c.ogrenciAl(k, g.id);
      if (o.durum === 'aktif' || o.durum === 'dondu') fail('Devam eden kayıt anonim yapılamaz; önce kaydı tamamlayın ya da iptal edin.');
      if (o.anonim) fail('Bu kayıt zaten anonim.');
      if (metin(g.onay, 20) !== 'SİL') fail('Onay için büyük harflerle SİL yazın.');
      anonimlestir(c, o);
      c.erisimYaz(k, o.id, 'anonim', 'Kişisel veriler silindi (anonim)');
      return { olay: [o.sube_id, 'kayit', `Bir öğrencinin kişisel verileri silindi (anonim yapıldı) · ${o.kayit_tarihi} kayıtlı`] };
    },
    // Saklama süresi dolan bütün kayıtlar (kursu bitmiş/iptal, son hareketi süreden eski).
    toplu_anonimlestir(c, k, g) {
      if (k.rol !== 'yonetici') fail('Kişisel veriyi yalnız yönetici siler.', 403);
      if (metin(g.onay, 20) !== 'SİL') fail('Onay için büyük harflerle SİL yazın.');
      const l = suresiDolanlar(c);
      for (const o of l) anonimlestir(c, o);
      c.erisimYaz(k, null, 'anonim', `Saklama süresi dolan ${l.length} kayıt anonim yapıldı`);
      return { sonuc: { sayi: l.length }, olay: [null, 'kayit', `Saklama süresi dolan ${l.length} öğrenci kaydı anonim yapıldı`] };
    },
  },

  yol(c, k, { yontem, yol, sorgu }) {
    // Veri isteme hakkı: kurum bir öğrencinin bütün kaydını verir.
    if (yol === '/api/kisisel-veri' && yontem === 'GET') {
      c.hakGerek(k, 'kayit');
      c.hakGerek(k, 'hassas');
      const o = c.ogrenciAl(k, sorgu.get('id'));
      c.erisimYaz(k, o.id, 'dokum', 'Kişisel veri dökümü alındı');
      return indir(`kisisel-veri-${o.id.slice(0, 8)}.json`, kisiselDokum(c, o));
    }
    if (yol === '/api/erisim-kaydi' && yontem === 'GET') {
      if (!['yonetici', 'sube_muduru'].includes(k.rol)) fail('Erişim kaydını yönetici ve şube müdürü görür.', 403);
      const id = String(sorgu.get('id') || '');
      if (id) c.ogrenciAl(k, id);
      const kps = c.kapsam(k);
      const l = id ? c.q('SELECT * FROM kisisel_veri_erisim WHERE ogrenci_id=? ORDER BY id DESC LIMIT 300', id)
        : c.q(`SELECT e.* FROM kisisel_veri_erisim e LEFT JOIN ogrenciler o ON o.id=e.ogrenci_id ${kps === null ? '' : "WHERE o.sube_id=? OR (e.ogrenci_id IS NULL AND e.kullanici IN (SELECT ad FROM kullanicilar WHERE sube_id=?))"} ORDER BY e.id DESC LIMIT 300`, ...(kps === null ? [] : [kps, kps]));
      return { durum: 200, veri: { kayitlar: l } };
    }
    return null;
  },

  ogrenciVeri(c, o, v) {
    const a = c.ayar();
    v.kvkk = { metin: (a.kvkk.metin || VARSAYILAN_AYDINLATMA).replaceAll('{KURUM}', c.q1('SELECT ad FROM kurum')?.ad || ''), onay: o.kvkk_onay ? JSON.parse(o.kvkk_onay).tarih : null };
  },
  ogrenciYol(c, o, { yontem, yol }) {
    if (yol === '/api/verilerim' && yontem === 'GET') {
      const kayit = c.q1('SELECT * FROM ogrenciler WHERE id=?', o.id);
      c.erisimYaz({ ad: `${o.ad} ${o.soyad} (öğrenci)` }, o.id, 'dokum', 'Öğrenci kendi verisini indirdi');
      return indir('verilerim.json', kisiselDokum(c, kayit));
    }
    return null;
  },
};

// Saklama süresi: kurs bittikten (tamamlandı/iptal) ve son hareketten bu yana ayardaki yıl kadar geçmişse.
export function suresiDolanlar(c) {
  const yil = c.ayar().kvkk.saklamaYil;
  if (!yil) return [];
  const sinir = String(Number(c.bugunStr().slice(0, 4)) - yil) + c.bugunStr().slice(4);
  return c.q(`SELECT o.* FROM ogrenciler o WHERE o.anonim=0 AND o.durum IN ('tamamlandi','iptal') AND o.kayit_tarihi<?
    AND NOT EXISTS(SELECT 1 FROM odemeler x WHERE x.ogrenci_id=o.id AND x.tarih>=?)
    AND NOT EXISTS(SELECT 1 FROM dersler x WHERE x.ogrenci_id=o.id AND x.tarih>=?)
    AND NOT EXISTS(SELECT 1 FROM sinavlar x WHERE x.ogrenci_id=o.id AND x.tarih>=?)`, sinir, sinir, sinir, sinir);
}

