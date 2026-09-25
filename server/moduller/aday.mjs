// Aday (müşteri adayı) takibi ve internetten ön kayıt.
//  - Telefonla ya da yüz yüze bilgi alan kişi: verilen fiyat, tekrar aranacağı gün, "nereden duydu", görüşme notları.
//  - Kursun web sitesine konacak ön kayıt formu (giriş gerektirmez): gelen başvuru aday olarak düşer, merkeze
//    ve şubeye anında bildirilir. Form kötüye kullanıma karşı sınırlıdır (yer başına saatte 5, günde 200 başvuru).
//  - Aday kayıt olunca öğrenci kaydına bağlanır; kaynak bilgisi raporlarda "reklam geri dönüşü" için kullanılır.
import { randomUUID, createHash } from 'node:crypto';
import { fail, metin, kurus, gun, secim } from '../domain.mjs';
import { ogrenciKaydet } from './ogrenci.mjs';

const simdi = () => new Date().toISOString();
export const ADAY_DURUM = { yeni: 'Yeni', gorusuluyor: 'Görüşülüyor', kayit: 'Kayıt oldu', vazgecti: 'Vazgeçti' };

function adayAl(c, k, id) {
  const a = c.q1('SELECT * FROM adaylar WHERE id=?', metin(id, 60, true, 'Aday'));
  if (!a || (k.rol !== 'yonetici' && a.sube_id !== k.sube_id)) fail('Aday bulunamadı.', 404);
  return a;
}
const telefonTemiz = (t) => metin(t, 30).replace(/[^\d+]/g, '');

export default {
  ad: 'aday',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS adaylar(id TEXT PRIMARY KEY, sube_id TEXT REFERENCES subeler(id), ad TEXT NOT NULL, soyad TEXT NOT NULL DEFAULT '',
  telefon TEXT NOT NULL, eposta TEXT NOT NULL DEFAULT '', sinif TEXT NOT NULL DEFAULT '', kaynak TEXT NOT NULL DEFAULT '', fiyat INTEGER NOT NULL DEFAULT 0,
  durum TEXT NOT NULL DEFAULT 'yeni', sonraki_arama TEXT NOT NULL DEFAULT '', notlar TEXT NOT NULL DEFAULT '', ogrenci_id TEXT, on_kayit INTEGER NOT NULL DEFAULT 0,
  kvkk_onay TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL, guncelleme TEXT);
CREATE TABLE IF NOT EXISTS aday_notlari(id TEXT PRIMARY KEY, aday_id TEXT NOT NULL REFERENCES adaylar(id), metin TEXT NOT NULL, kaydeden TEXT NOT NULL, zaman TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS on_kayit_sayac(anahtar TEXT PRIMARY KEY, sayi INTEGER NOT NULL, bitis INTEGER NOT NULL);`);
  },

  veri(c, k, v) {
    v.tanimlar.kaynaklar = c.ayar().kaynaklar;
    if (!c.hak(k, 'kayit')) return;
    const kps = c.kapsam(k);
    const sinir = new Date(c.saatKaynagi().getTime() - 365 * 86400000).toISOString();
    v.adaylar = c.q(`SELECT * FROM adaylar WHERE ${kps === null ? '1=1' : '(sube_id=? OR sube_id IS NULL)'} AND (durum IN ('yeni','gorusuluyor') OR olusturma>=?) ORDER BY olusturma DESC`,
      ...(kps === null ? [] : [kps]), sinir);
    const ids = v.adaylar.map((a) => a.id);
    const notlar = ids.length ? c.q(`SELECT * FROM aday_notlari WHERE aday_id IN (${ids.map(() => '?').join(',')}) ORDER BY zaman DESC`, ...ids) : [];
    v.adaylar = v.adaylar.map((a) => ({ ...a, notlarListesi: notlar.filter((n) => n.aday_id === a.id) }));
  },

  islemler: {
    aday_kaydet(c, k, g) {
      c.hakGerek(k, 'kayit');
      const a = c.ayar();
      const subeId = g.subeId ? c.subeIzinli(k, g.subeId).id : k.rol === 'yonetici' ? null : k.sube_id;
      const alan = {
        ad: metin(g.ad, 60, true, 'Ad'), soyad: metin(g.soyad, 60), telefon: telefonTemiz(g.telefon), eposta: metin(g.eposta, 120),
        sinif: g.sinif ? secim(g.sinif, Object.keys(a.siniflar), 'Sınıf') : '', kaynak: metin(g.kaynak, 40), fiyat: kurus(g.fiyat ?? 0, 'Verilen fiyat'),
        sonraki: gun(g.sonrakiArama, 'Tekrar arama günü', false), notlar: metin(g.notlar, 1000),
      };
      if (!alan.telefon) fail('Telefon boş bırakılamaz.');
      if (g.id) {
        const x = adayAl(c, k, g.id);
        const durum = g.durum ? secim(g.durum, Object.keys(ADAY_DURUM), 'Durum') : x.durum;
        c.run('UPDATE adaylar SET sube_id=?, ad=?, soyad=?, telefon=?, eposta=?, sinif=?, kaynak=?, fiyat=?, durum=?, sonraki_arama=?, notlar=?, guncelleme=? WHERE id=?',
          subeId ?? x.sube_id, alan.ad, alan.soyad, alan.telefon, alan.eposta, alan.sinif, alan.kaynak, alan.fiyat, durum, alan.sonraki, alan.notlar, simdi(), x.id);
        return { olay: [subeId ?? x.sube_id, 'aday', `Aday güncellendi: ${alan.ad} ${alan.soyad} (${ADAY_DURUM[durum]})`] };
      }
      const id = randomUUID();
      c.run('INSERT INTO adaylar(id,sube_id,ad,soyad,telefon,eposta,sinif,kaynak,fiyat,durum,sonraki_arama,notlar,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id, subeId, alan.ad, alan.soyad, alan.telefon, alan.eposta, alan.sinif, alan.kaynak, alan.fiyat, 'yeni', alan.sonraki, alan.notlar, k.ad, simdi());
      return { sonuc: { id }, olay: [subeId, 'aday', `Yeni aday: ${alan.ad} ${alan.soyad}${alan.kaynak ? ` (${alan.kaynak})` : ''}`] };
    },
    // Görüşme notu; istenirse durum ve tekrar arama günü birlikte güncellenir.
    aday_not(c, k, g) {
      c.hakGerek(k, 'kayit');
      const x = adayAl(c, k, g.id);
      const yazi = metin(g.metin, 1000, true, 'Not');
      c.run('INSERT INTO aday_notlari(id,aday_id,metin,kaydeden,zaman) VALUES(?,?,?,?,?)', randomUUID(), x.id, yazi, k.ad, simdi());
      const durum = g.durum ? secim(g.durum, ['yeni', 'gorusuluyor', 'vazgecti'], 'Durum') : x.durum === 'yeni' ? 'gorusuluyor' : x.durum;
      c.run('UPDATE adaylar SET durum=?, sonraki_arama=?, guncelleme=? WHERE id=?', durum, g.sonrakiArama !== undefined ? gun(g.sonrakiArama, 'Tekrar arama günü', false) : x.sonraki_arama, simdi(), x.id);
      return { olay: [x.sube_id, 'aday', `${x.ad} ${x.soyad} ile görüşüldü: ${yazi.slice(0, 80)}`] };
    },
    // Adaydan öğrenci kaydı: kayıt formunun bütün kuralları geçerlidir; kaynak adaydan gelir.
    aday_kayit(c, k, g) {
      const x = adayAl(c, k, g.adayId);
      if (x.durum === 'kayit') fail('Bu aday zaten kayıt oldu.');
      const r = ogrenciKaydet(c, k, { ...g, kaynak: g.kaynak || x.kaynak, kvkkOnay: g.kvkkOnay || !!x.kvkk_onay, onKayit: !!x.on_kayit });
      c.run("UPDATE adaylar SET durum='kayit', ogrenci_id=?, guncelleme=? WHERE id=?", r.id, simdi(), x.id);
      return { sonuc: { id: r.id }, olay: r.olay };
    },
  },

  // İnternetten ön kayıt: giriş gerektirmez. Kurum ayarlardan açar; kapalıysa form görünmez.
  acikYol(c, { yontem, yol, govde, ip }) {
    if (yol === '/api/on-kayit-bilgi' && yontem === 'GET') {
      const a = c.ayar();
      if (!a.onKayit.acik) fail('Bu kurum internetten ön kayıt almıyor.', 404);
      return { durum: 200, veri: {
        kurum: c.q1('SELECT ad FROM kurum')?.ad || '', logo: a.kurum.logo, telefon: a.kurum.telefon, mesaj: a.onKayit.mesaj,
        subeler: c.q('SELECT id, ad FROM subeler WHERE aktif=1 ORDER BY merkez DESC, ad'),
        siniflar: Object.entries(a.siniflar).map(([kod, s]) => ({ kod, ad: s.ad })), kaynaklar: a.kaynaklar,
        kvkk: (a.kvkk.metin || '').replaceAll('{KURUM}', c.q1('SELECT ad FROM kurum')?.ad || '') || null,
      } };
    }
    if (yol !== '/api/on-kayit' || yontem !== 'POST') return null;
    const a = c.ayar();
    if (!a.onKayit.acik) fail('Bu kurum internetten ön kayıt almıyor.', 404);
    // Tuzak alan: insanlar görmez, otomatik doldurucular doldurur. Sessizce kabul edilmiş gibi yapılır.
    if (govde.web) return { durum: 200, veri: { tamam: true } };
    const simdiMs = c.saatKaynagi().getTime();
    const say = (anahtar, sinir, sureMs) => {
      const x = c.q1('SELECT * FROM on_kayit_sayac WHERE anahtar=?', anahtar);
      const sayi = x && x.bitis > simdiMs ? x.sayi : 0;
      if (sayi >= sinir) fail('Çok fazla başvuru yapıldı. Lütfen kursu telefonla arayın.', 429);
      c.run('INSERT INTO on_kayit_sayac(anahtar,sayi,bitis) VALUES(?,?,?) ON CONFLICT(anahtar) DO UPDATE SET sayi=excluded.sayi, bitis=excluded.bitis', anahtar, sayi + 1, x && x.bitis > simdiMs ? x.bitis : simdiMs + sureMs);
    };
    const ad = metin(govde.ad, 60, true, 'Ad'), soyad = metin(govde.soyad, 60, true, 'Soyad');
    const telefon = telefonTemiz(govde.telefon);
    if (telefon.replace(/\D/g, '').length < 10) fail('Telefon numarasını eksiksiz yazın.');
    if (!govde.kvkkOnay) fail('Devam etmek için kişisel verilerin işlenmesine onay verin.');
    const sube = govde.subeId ? c.q1('SELECT id, ad FROM subeler WHERE id=? AND aktif=1', String(govde.subeId)) : null;
    const sinif = govde.sinif && a.siniflar[govde.sinif] ? String(govde.sinif) : '';
    // Aynı telefondan son 24 saatte açık başvuru varsa yenisi açılmaz.
    if (c.q1("SELECT 1 FROM adaylar WHERE telefon=? AND on_kayit=1 AND olusturma>=? AND durum IN ('yeni','gorusuluyor')", telefon, new Date(simdiMs - 86400000).toISOString()))
      return { durum: 200, veri: { tamam: true, mesaj: 'Başvurunuz daha önce alındı. En kısa sürede sizi arayacağız.' } };
    say('ip:' + createHash('sha256').update(String(ip || '-')).digest('hex').slice(0, 16), 5, 3600000);
    say('gun', 200, 86400000);
    const id = randomUUID();
    c.run('INSERT INTO adaylar(id,sube_id,ad,soyad,telefon,eposta,sinif,kaynak,fiyat,durum,sonraki_arama,notlar,on_kayit,kvkk_onay,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,1,?,?,?)',
      id, sube?.id || null, ad, soyad, telefon, metin(govde.eposta, 120), sinif, metin(govde.kaynak, 40) || 'İnternet (ön kayıt)', 'yeni', c.bugunStr(), metin(govde.not, 500),
      JSON.stringify({ tarih: simdi(), yol: 'ön kayıt formu', surum: a.kvkk.surum || 1 }), 'İnternetten ön kayıt', simdi());
    c.olayYayinla({ ad: 'Ön kayıt formu' }, sube?.id || null, 'aday', `İnternetten ön kayıt: ${ad} ${soyad}${sinif ? ` (${sinif})` : ''}${sube ? ` · ${sube.ad}` : ''} · ${telefon}`);
    return { durum: 200, veri: { tamam: true, mesaj: 'Başvurunuz alındı. En kısa sürede sizi arayacağız.' } };
  },
};

