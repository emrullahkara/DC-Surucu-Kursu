// Direksiyon ve teorik dersler: planlama, sahadan sonuç girişi, öğrencinin kendi saatini seçmesi.
import { randomUUID } from 'node:crypto';
import { fail, metin, gun, saat, secim, tamSayi, yerelZaman } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const adSoyad = (o) => `${o.ad} ${o.soyad}`;
const dk = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
const saatYaz = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Aynı eğitmen/araç/öğrenci için zaman aralığı çakışması (yalnız saati aynı olanı değil, üst üste binenleri de yakalar).
function cakisma(c, alan, deger, tarih, bas, sure, haric = '') {
  if (!deger) return null;
  const l = c.q(`SELECT id, saat, sure_dk FROM dersler WHERE ${alan}=? AND tarih=? AND durum='planli' AND id!=?`, deger, tarih, haric);
  return l.find((d) => d.saat && dk(d.saat) < bas + sure && bas < dk(d.saat) + d.sure_dk) || null;
}
function konumOku(c, g) {
  if (!c.ayar().konumKaydi || !g.konum) return null;
  const e = Number(g.konum.enlem), b = Number(g.konum.boylam), h = Number(g.konum.hassasiyet || 0);
  if (!Number.isFinite(e) || !Number.isFinite(b) || Math.abs(e) > 90 || Math.abs(b) > 180) return null;
  return JSON.stringify({ enlem: Math.round(e * 1e5) / 1e5, boylam: Math.round(b * 1e5) / 1e5, hassasiyet: Math.round(h) });
}

// Eğitmenin bir günde verebileceği en fazla direksiyon dersi (ayardan; 0 = sınır yok). Mevzuata göre doğrulanmalı.
function gunlukSinir(c, egitmenId, tarih, haric = '') {
  const sinir = c.ayar().egitmenGunlukDers;
  if (!sinir || !egitmenId) return;
  const n = c.q1("SELECT COUNT(*) n FROM dersler WHERE egitmen_id=? AND tarih=? AND tur='direksiyon' AND durum IN ('planli','tamamlandi') AND id!=?", egitmenId, tarih, haric).n;
  if (n >= sinir) fail(`Eğitmenin ${tarih.split('-').reverse().join('.')} günü için direksiyon dersi sınırı (${sinir}) dolu.`);
}

export function dersPlanlaIc(c, { o, egitmen, arac, tur, tarih, sa, sure, kaydeden }) {
  const bas = dk(sa);
  if (egitmen && tur === 'direksiyon') gunlukSinir(c, egitmen.id, tarih);
  if (egitmen && cakisma(c, 'egitmen_id', egitmen.id, tarih, bas, sure)) fail(`${egitmen.ad} bu saatte başka derste.`);
  if (arac && cakisma(c, 'arac_id', arac.id, tarih, bas, sure)) fail(`${arac.plaka} bu saatte başka derste.`);
  if (cakisma(c, 'ogrenci_id', o.id, tarih, bas, sure)) fail('Öğrencinin bu saatte başka dersi var.');
  const id = randomUUID();
  c.run('INSERT INTO dersler(id,ogrenci_id,sube_id,egitmen_id,arac_id,tur,tarih,saat,sure_dk,durum,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    id, o.id, o.sube_id, egitmen?.id || null, arac?.id || null, tur, tarih, sa, sure, 'planli', kaydeden, simdi());
  return id;
}

// Öğrencinin seçebileceği boş saatler: eğitmeninin (ve aracın) boş olduğu ders dilimleri.
export function bosSaatler(c, o, tarih) {
  const a = c.ayar();
  const sure = a.dersSuresi;
  const sonuc = [];
  if (!o.egitmen_id) return sonuc;
  if (c.q1('SELECT 1 FROM izinler WHERE kullanici_id=? AND bas<=? AND bit>=?', o.egitmen_id, tarih, tarih)) return sonuc;
  const bas = dk(a.ogrenciDersSecimi.bas), bit = dk(a.ogrenciDersSecimi.bit);
  const sinir = a.egitmenGunlukDers;
  if (sinir && c.q1("SELECT COUNT(*) n FROM dersler WHERE egitmen_id=? AND tarih=? AND tur='direksiyon' AND durum IN ('planli','tamamlandi')", o.egitmen_id, tarih).n >= sinir) return sonuc;
  const simdiDk = tarih === c.bugunStr() ? yerelZaman(c.saatKaynagi()).dakika + 60 : 0;
  for (let m = bas; m + sure <= bit; m += 60) {
    if (m < simdiDk) continue;
    if (cakisma(c, 'egitmen_id', o.egitmen_id, tarih, m, sure) || cakisma(c, 'ogrenci_id', o.id, tarih, m, sure)) continue;
    sonuc.push(saatYaz(m));
  }
  return sonuc;
}

// Paketteki direksiyon ders sayısını aşan her tamamlanan ders için kurumun ek ders ücreti borca eklenir (karar 9).
function ekDersUcreti(c, k, o, dersId) {
  const a = c.ayar();
  const gerekli = a.siniflar[o.sinif]?.direksiyon || 0;
  if (!a.ucretler.ekDers || !gerekli) return null;
  const n = c.q1("SELECT COUNT(*) n FROM dersler WHERE ogrenci_id=? AND tur='direksiyon' AND durum='tamamlandi'", o.id).n;
  if (n <= gerekli) return null;
  if (c.q1("SELECT 1 FROM ucret_kalemleri WHERE ogrenci_id=? AND tur='ek_ders' AND aciklama LIKE ? AND iptal=0", o.id, `%#${dersId.slice(0, 8)}`)) return null;
  c.run('INSERT INTO ucret_kalemleri(id,ogrenci_id,sube_id,tur,aciklama,tutar,tarih,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?)',
    randomUUID(), o.id, o.sube_id, 'ek_ders', `${n}. direksiyon dersi (paket ${gerekli}) #${dersId.slice(0, 8)}`, a.ucretler.ekDers, c.bugunStr(), k.ad, simdi());
  return n - gerekli;
}

export default {
  ad: 'ders',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS dersler(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sube_id TEXT NOT NULL,
  egitmen_id TEXT REFERENCES kullanicilar(id), arac_id TEXT, tur TEXT NOT NULL, tarih TEXT NOT NULL, saat TEXT NOT NULL DEFAULT '',
  sure_dk INTEGER NOT NULL DEFAULT 50, durum TEXT NOT NULL DEFAULT 'planli', notu TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL,
  tamamlanma TEXT, olusturma TEXT NOT NULL, konum TEXT);
CREATE INDEX IF NOT EXISTS ders_ogr ON dersler(ogrenci_id);
CREATE INDEX IF NOT EXISTS ders_tarih ON dersler(tarih);
CREATE INDEX IF NOT EXISTS ders_egitmen ON dersler(egitmen_id, tarih);
`);
  },

  veri(c, k, v) {
    const kps = c.kapsam(k);
    const sinir = new Date(c.saatKaynagi().getTime() - 180 * 86400000).toISOString().slice(0, 10);
    const gorunen = new Set(v.ogrenciler.map((o) => o.id));
    let l;
    if (c.egitmenKisitli(k)) l = c.q('SELECT * FROM dersler WHERE egitmen_id=? AND tarih>=? ORDER BY tarih, saat', k.id, sinir);
    else if (kps === null) l = c.q('SELECT * FROM dersler WHERE tarih>=? ORDER BY tarih, saat', sinir);
    // Şubenin kendi dersleri + şubenin eğitmeninin görevlendirmeyle başka şubede verdiği dersler.
    else l = c.q('SELECT * FROM dersler WHERE (sube_id=? OR egitmen_id=?) AND tarih>=? ORDER BY tarih, saat', kps, k.id, sinir);
    // Konum yalnız yöneticiye ve şube müdürüne gönderilir.
    const konumGor = k.rol === 'yonetici' || k.rol === 'sube_muduru';
    v.dersler = l.filter((d) => gorunen.has(d.ogrenci_id) || d.egitmen_id === k.id).map((d) => (konumGor ? d : { ...d, konum: undefined }));
  },

  islemler: {
    ders_planla(c, k, g) {
      const o = c.ogrenciAl(k, g.ogrenciId);
      if (o.durum !== 'aktif') fail('Yalnız aktif öğrenciye ders planlanır.');
      const tarih = gun(g.tarih), sa = saat(g.saat, true);
      const egitmen = c.egitmenAl(o.sube_id, g.egitmenId || (k.rol === 'egitmen' ? k.id : null), tarih);
      if (!c.hak(k, 'ders') && egitmen?.id !== k.id) fail('Yalnız kendi dersinizi planlayabilirsiniz.', 403);
      if (!c.hak(k, 'ders') && o.egitmen_id !== k.id) fail('Bu öğrenci size bağlı değil.', 403);
      const tur = secim(g.dersTuru, ['teorik', 'direksiyon'], 'Ders türü');
      if (tur === 'direksiyon' && !egitmen) fail('Direksiyon dersi için eğitmen seçin.');
      const arac = tur === 'direksiyon' ? c.aracAl(o.sube_id, g.aracId, { tarih }) : null;
      const sure = tamSayi(g.sureDk || c.ayar().dersSuresi, 10, 240, 'Süre');
      const id = dersPlanlaIc(c, { o, egitmen, arac, tur, tarih, sa, sure, kaydeden: k.ad });
      return { sonuc: { id }, olay: [o.sube_id, 'ders', `${adSoyad(o)} için ${tur} dersi planlandı: ${tarih} ${sa}`, { egitmen: egitmen?.id }] };
    },
    ders_sonuc(c, k, g) {
      const d = c.q1('SELECT * FROM dersler WHERE id=?', metin(g.id, 60, true));
      if (!d) fail('Ders bulunamadı.', 404);
      const o = c.ogrenciAl(k, d.ogrenci_id);
      if (d.egitmen_id !== k.id && !c.hak(k, 'ders')) fail('Yalnız kendi dersinizin sonucunu girebilirsiniz.', 403);
      if (d.egitmen_id !== k.id && k.rol !== 'yonetici' && d.sube_id !== k.sube_id) fail('Bu ders başka şubeye ait.', 403);
      const durum = secim(g.durum, ['tamamlandi', 'gelmedi', 'iptal', 'planli'], 'Ders durumu');
      if (d.durum === durum) return { sonuc: { ayni: true } };
      if (d.durum !== 'planli' && !c.hak(k, 'ders')) fail('Sonuçlanmış ders yalnız ders yetkisi olan personel tarafından değiştirilir.', 403);
      c.run('UPDATE dersler SET durum=?, notu=?, tamamlanma=?, konum=COALESCE(?, konum) WHERE id=?',
        durum, metin(g.notu ?? d.notu, 500), durum === 'planli' ? null : simdi(), durum === 'tamamlandi' ? konumOku(c, g) : null, d.id);
      const yazi = { tamamlandi: 'tamamlandı', gelmedi: 'öğrenci gelmedi', iptal: 'iptal edildi', planli: 'yeniden plana alındı' }[durum];
      const ek = durum === 'tamamlandi' && d.tur === 'direksiyon' ? ekDersUcreti(c, k, o, d.id) : null;
      return { olay: [d.sube_id, 'ders', `${adSoyad(o)} ${d.tur} dersi ${yazi} (${k.ad})${ek ? ` · ${ek}. ek ders, ücret borca eklendi` : ''}`, { egitmen: d.egitmen_id }] };
    },
    // Planlı dersin gününü, saatini, eğitmenini ya da aracını değiştirme.
    ders_tasi(c, k, g) {
      const d = c.q1('SELECT * FROM dersler WHERE id=?', metin(g.id, 60, true));
      if (!d) fail('Ders bulunamadı.', 404);
      const o = c.ogrenciAl(k, d.ogrenci_id);
      if (d.durum !== 'planli') fail('Yalnız planlı ders değiştirilebilir.');
      if (!c.hak(k, 'ders') && d.egitmen_id !== k.id) fail('Yalnız kendi dersinizi değiştirebilirsiniz.', 403);
      if (k.rol !== 'yonetici' && d.sube_id !== k.sube_id && d.egitmen_id !== k.id) fail('Bu ders başka şubeye ait.', 403);
      const tarih = gun(g.tarih ?? d.tarih), sa = saat(g.saat ?? d.saat, true);
      const egitmen = c.hak(k, 'ders') && g.egitmenId !== undefined ? c.egitmenAl(d.sube_id, g.egitmenId, tarih) : c.egitmenAl(d.sube_id, d.egitmen_id, tarih);
      if (d.tur === 'direksiyon' && !egitmen) fail('Direksiyon dersi için eğitmen seçin.');
      const arac = d.tur === 'direksiyon' ? c.aracAl(d.sube_id, g.aracId !== undefined ? g.aracId : d.arac_id, { tarih }) : null;
      const bas = dk(sa);
      if (egitmen && d.tur === 'direksiyon') gunlukSinir(c, egitmen.id, tarih, d.id);
      if (egitmen && cakisma(c, 'egitmen_id', egitmen.id, tarih, bas, d.sure_dk, d.id)) fail(`${egitmen.ad} bu saatte başka derste.`);
      if (arac && cakisma(c, 'arac_id', arac.id, tarih, bas, d.sure_dk, d.id)) fail(`${arac.plaka} bu saatte başka derste.`);
      if (cakisma(c, 'ogrenci_id', o.id, tarih, bas, d.sure_dk, d.id)) fail('Öğrencinin bu saatte başka dersi var.');
      c.run('UPDATE dersler SET tarih=?, saat=?, egitmen_id=?, arac_id=? WHERE id=?', tarih, sa, egitmen?.id || null, arac?.id || null, d.id);
      return { olay: [d.sube_id, 'ders', `${adSoyad(o)} dersi taşındı: ${d.tarih} ${d.saat} → ${tarih} ${sa}${egitmen && egitmen.id !== d.egitmen_id ? ` (${egitmen.ad})` : ''}`, { egitmen: egitmen?.id || d.egitmen_id }] };
    },
    // Eğitmen hastalandığında ya da araç arızalandığında: tarih aralığındaki planlı dersler tek hamlede
    // başka eğitmene ve/veya araca aktarılır. Çakışan ders atlanır ve nedeni bildirilir.
    ders_toplu_aktar(c, k, g) {
      c.hakGerek(k, 'ders');
      const bas = gun(g.bas, 'Başlangıç'), bit = gun(g.bit || g.bas, 'Bitiş');
      if (bas > bit) fail('Başlangıç bitişten sonra olamaz.');
      if (!g.kaynakEgitmenId && !g.kaynakAracId) fail('Aktarılacak eğitmeni ya da aracı seçin.');
      if (!g.hedefEgitmenId && !g.hedefAracId) fail('Derslerin aktarılacağı eğitmeni ya da aracı seçin.');
      const sartlar = ["durum='planli'", 'tarih>=?', 'tarih<=?'], p = [bas, bit];
      if (g.kaynakEgitmenId) { sartlar.push('egitmen_id=?'); p.push(String(g.kaynakEgitmenId)); }
      if (g.kaynakAracId) { sartlar.push('arac_id=?'); p.push(String(g.kaynakAracId)); }
      const kps = c.kapsam(k);
      if (kps !== null) { sartlar.push('sube_id=?'); p.push(kps); }
      const liste = c.q(`SELECT * FROM dersler WHERE ${sartlar.join(' AND ')} ORDER BY tarih, saat`, ...p);
      let aktarilan = 0;
      const atlanan = [];
      const subeler = new Set();
      for (const d of liste) {
        try {
          const egitmen = g.hedefEgitmenId ? c.egitmenAl(d.sube_id, g.hedefEgitmenId, d.tarih) : null;
          const arac = g.hedefAracId ? c.aracAl(d.sube_id, g.hedefAracId, { tarih: d.tarih }) : null;
          const bas2 = dk(d.saat || '00:00');
          if (egitmen && d.tur === 'direksiyon') gunlukSinir(c, egitmen.id, d.tarih, d.id);
          if (egitmen && cakisma(c, 'egitmen_id', egitmen.id, d.tarih, bas2, d.sure_dk, d.id)) fail(`${egitmen.ad} bu saatte başka derste`);
          if (arac && cakisma(c, 'arac_id', arac.id, d.tarih, bas2, d.sure_dk, d.id)) fail(`${arac.plaka} bu saatte başka derste`);
          c.run('UPDATE dersler SET egitmen_id=COALESCE(?, egitmen_id), arac_id=COALESCE(?, arac_id) WHERE id=?', egitmen?.id || null, arac?.id || null, d.id);
          aktarilan++;
          subeler.add(d.sube_id);
        } catch (e) {
          if (!(e instanceof Error) || !('durum' in e)) throw e;
          const o = c.q1('SELECT ad, soyad FROM ogrenciler WHERE id=?', d.ogrenci_id);
          atlanan.push({ id: d.id, tarih: d.tarih, saat: d.saat, ogrenci: o ? adSoyad(o) : '', neden: e.message });
        }
      }
      const hedef = [g.hedefEgitmenId && c.q1('SELECT ad FROM kullanicilar WHERE id=?', String(g.hedefEgitmenId))?.ad, g.hedefAracId && c.q1('SELECT plaka FROM araclar WHERE id=?', String(g.hedefAracId))?.plaka].filter(Boolean).join(', ');
      const sube = [...subeler][0] || k.sube_id;
      return { sonuc: { aktarilan, atlanan }, olay: [sube, 'ders', `${aktarilan} planlı ders aktarıldı → ${hedef}${atlanan.length ? ` · ${atlanan.length} ders çakıştığı için aktarılamadı` : ''}`, { egitmen: g.hedefEgitmenId || null }] };
    },
    // Sahada eğitmenin önceden planlanmamış bir dersi "şimdi tamamlandı" diye girmesi.
    ders_saha(c, k, g) {
      const o = c.ogrenciAl(k, g.ogrenciId);
      if (o.durum !== 'aktif') fail('Yalnız aktif öğrenciye ders girilir.');
      if (!c.hak(k, 'ders') && o.egitmen_id !== k.id) fail('Bu öğrenci size bağlı değil.', 403);
      if (k.rol !== 'yonetici' && o.sube_id !== k.sube_id && !c.gorevli(k.id, o.sube_id, c.bugunStr())) fail('Bu öğrencinin şubesinde görevli değilsiniz.', 403);
      const tur = secim(g.dersTuru || 'direksiyon', ['teorik', 'direksiyon'], 'Ders türü');
      const yz = yerelZaman(c.saatKaynagi());
      if (tur === 'direksiyon') gunlukSinir(c, k.id, yz.tarih);
      const id = randomUUID();
      c.run("INSERT INTO dersler(id,ogrenci_id,sube_id,egitmen_id,arac_id,tur,tarih,saat,sure_dk,durum,notu,kaydeden,tamamlanma,olusturma,konum) VALUES(?,?,?,?,?,?,?,?,?,'tamamlandi',?,?,?,?,?)",
        id, o.id, o.sube_id, k.id, tur === 'direksiyon' ? c.aracAl(o.sube_id, g.aracId, { tarih: yz.tarih })?.id || null : null, tur,
        yz.tarih, yz.saat, tamSayi(g.sureDk || c.ayar().dersSuresi, 10, 240, 'Süre'), metin(g.notu, 500), k.ad, simdi(), simdi(), konumOku(c, g));
      const ek = tur === 'direksiyon' ? ekDersUcreti(c, k, o, id) : null;
      return { sonuc: { id }, olay: [o.sube_id, 'ders', `Sahadan: ${adSoyad(o)} ${tur} dersi tamamlandı (${k.ad})${ek ? ` · ${ek}. ek ders, ücret borca eklendi` : ''}`, { egitmen: k.id }] };
    },
  },

  // Öğrenci, eğitmeninin boş saatlerinden kendisi seçer; ders doğrudan planlanır (karar 20).
  ogrenciIslemleri: {
    ders_sec(c, o, g) {
      const a = c.ayar();
      if (!a.ogrenciDersSecimi.acik) fail('Kursunuz öğrencinin ders seçmesini kapatmış.');
      const kayit = c.q1('SELECT * FROM ogrenciler WHERE id=?', o.id);
      if (kayit.durum !== 'aktif') fail('Kaydınız aktif değil.');
      if (!kayit.egitmen_id) fail('Henüz eğitmeniniz atanmadı. Kursla görüşün.');
      const tarih = gun(g.tarih), sa = saat(g.saat, true);
      const fark = Math.round((Date.parse(tarih) - Date.parse(c.bugunStr())) / 86400000);
      if (fark < a.ogrenciDersSecimi.enErkenGun || fark > a.ogrenciDersSecimi.enGecGun) fail(`Ders en erken ${a.ogrenciDersSecimi.enErkenGun}, en geç ${a.ogrenciDersSecimi.enGecGun} gün sonrası için seçilebilir.`);
      if (!bosSaatler(c, kayit, tarih).includes(sa)) fail('Bu saat artık boş değil. Başka bir saat seçin.');
      const gerekli = a.siniflar[kayit.sinif]?.direksiyon || 0;
      const yapilan = c.q1("SELECT COUNT(*) n FROM dersler WHERE ogrenci_id=? AND tur='direksiyon' AND durum IN ('tamamlandi','planli')", o.id).n;
      if (gerekli && yapilan >= gerekli) fail('Direksiyon ders hakkınız doldu. Ek ders için kursla görüşün.');
      const gunluk = a.ogrenciGunlukDers || 2;
      if (c.q1("SELECT COUNT(*) n FROM dersler WHERE ogrenci_id=? AND tarih=? AND durum='planli'", o.id, tarih).n >= gunluk) fail(`Bir güne en fazla ${gunluk} ders seçebilirsiniz.`);
      const egitmen = c.q1('SELECT * FROM kullanicilar WHERE id=? AND aktif=1', kayit.egitmen_id);
      if (!egitmen) fail('Eğitmeniniz şu an ders veremiyor. Kursla görüşün.');
      // Uygun araç: eğitmenin o saatte boş olan, öğrencinin sınıfına uygun ilk aracı.
      const araclar = c.q('SELECT * FROM araclar WHERE sube_id=? AND aktif=1 AND sinif=?', kayit.sube_id, kayit.sinif);
      const arac = araclar.find((x) => !c.aracArizali(x, tarih) && !cakisma(c, 'arac_id', x.id, tarih, dk(sa), a.dersSuresi)) || null;
      const id = dersPlanlaIc(c, { o: kayit, egitmen, arac, tur: 'direksiyon', tarih, sa, sure: a.dersSuresi, kaydeden: `${kayit.ad} ${kayit.soyad} (öğrenci)` });
      return { sonuc: { id }, olay: [kayit.sube_id, 'ders', `${adSoyad(kayit)} kendi dersini seçti: ${tarih} ${sa} (${egitmen.ad})`, { egitmen: egitmen.id }] };
    },
    ders_birak(c, o, g) {
      const d = c.q1("SELECT * FROM dersler WHERE id=? AND ogrenci_id=? AND durum='planli'", metin(g.id, 60, true), o.id);
      if (!d) fail('Ders bulunamadı.');
      // Son 24 saatte bırakılamaz; eğitmenin günü boşa gitmesin.
      const fark = Date.parse(`${d.tarih}T${d.saat || '00:00'}:00+03:00`) - c.saatKaynagi().getTime();
      if (fark < 24 * 3600 * 1000) fail('Derse 24 saatten az kaldı. İptal için kursu arayın.');
      c.run("UPDATE dersler SET durum='iptal', notu='Öğrenci bıraktı' WHERE id=?", d.id);
      return { olay: [d.sube_id, 'ders', `${adSoyad(o)} ${d.tarih} ${d.saat} dersini bıraktı`, { egitmen: d.egitmen_id }] };
    },
  },

  ogrenciVeri(c, o, v) {
    v.dersler = c.q("SELECT id,tur,tarih,saat,sure_dk,durum FROM dersler WHERE ogrenci_id=? AND durum!='iptal' ORDER BY tarih DESC, saat DESC", o.id);
    v.dersSecimi = c.ayar().ogrenciDersSecimi;
    v.egitmenVar = !!o.egitmen_id;
  },
  ogrenciYol(c, o, { yontem, yol, sorgu }) {
    if (yol === '/api/bos-saatler' && yontem === 'GET') {
      const a = c.ayar();
      if (!a.ogrenciDersSecimi.acik) return { durum: 200, veri: { saatler: [] } };
      const tarih = gun(sorgu.get('tarih'));
      return { durum: 200, veri: { saatler: bosSaatler(c, c.q1('SELECT * FROM ogrenciler WHERE id=?', o.id), tarih) } };
    }
    return null;
  },
};
