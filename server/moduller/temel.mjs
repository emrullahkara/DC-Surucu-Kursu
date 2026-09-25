// Şubeler, personel, görevlendirme, araçlar ve kurum ayarları.
import { randomUUID } from 'node:crypto';
import { fail, metin, gun, tamSayi, secim } from '../domain.mjs';
import { sutunEkle } from '../db-ortak.mjs';
import { smsAyarDogrula, hatirlatmaAyarDogrula } from './hatirlatma.mjs';

const simdi = () => new Date().toISOString();
const saatDogru = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export default {
  ad: 'temel',
  sema(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS araclar(id TEXT PRIMARY KEY, sube_id TEXT NOT NULL REFERENCES subeler(id), plaka TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '', sinif TEXT NOT NULL DEFAULT 'B', aktif INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS gorevlendirmeler(id TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL REFERENCES kullanicilar(id),
  sube_id TEXT NOT NULL REFERENCES subeler(id), bas TEXT NOT NULL, bit TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS personel_belgeleri(id TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL REFERENCES kullanicilar(id), tur TEXT NOT NULL,
  no TEXT NOT NULL DEFAULT '', bitis TEXT NOT NULL DEFAULT '', notlar TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS izinler(id TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL REFERENCES kullanicilar(id), bas TEXT NOT NULL, bit TEXT NOT NULL,
  tur TEXT NOT NULL, aciklama TEXT NOT NULL DEFAULT '', kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);
`);
    // Araç takibi (karar 22): sonradan eklenen sütunlar. Eski kayıtlar olduğu gibi açılır.
    // Şubenin kısa kodu (makbuz serisi için, ör. CNK).
    sutunEkle(db, 'subeler', 'kod', "TEXT NOT NULL DEFAULT ''");
    for (const [s, t] of [['km', 'INTEGER'], ['muayene', "TEXT NOT NULL DEFAULT ''"], ['sigorta', "TEXT NOT NULL DEFAULT ''"], ['kasko', "TEXT NOT NULL DEFAULT ''"],
      ['bakim', "TEXT NOT NULL DEFAULT ''"], ['bakim_km', 'INTEGER'], ['notlar', "TEXT NOT NULL DEFAULT ''"],
      // Arıza / kullanım dışı: açıklama, başlangıç ve (boşsa belirsiz) bitiş.
      ['ariza', "TEXT NOT NULL DEFAULT ''"], ['ariza_bas', "TEXT NOT NULL DEFAULT ''"], ['ariza_bit', "TEXT NOT NULL DEFAULT ''"]]) sutunEkle(db, 'araclar', s, t);
    db.exec(`CREATE TABLE IF NOT EXISTS arac_km(id TEXT PRIMARY KEY, arac_id TEXT NOT NULL REFERENCES araclar(id), km INTEGER NOT NULL, tarih TEXT NOT NULL,
  kaydeden TEXT NOT NULL, olusturma TEXT NOT NULL);`);
  },

  veri(c, k, v) {
    const kps = c.kapsam(k);
    const sp = kps === null ? [] : [kps];
    const subeSart = kps === null ? '1=1' : 'sube_id=?';
    v.subeler = c.q(`SELECT id,ad,adres,telefon,merkez,aktif,kod FROM subeler WHERE ${kps === null ? '1=1' : 'id=?'} ORDER BY merkez DESC, ad`, ...sp);
    // Görevlendirme ile başka şubede ders veren eğitmen, o şubenin listesinde de görünür.
    const gorevliler = kps === null ? [] : c.q('SELECT DISTINCT kullanici_id FROM gorevlendirmeler WHERE sube_id=? AND bit>=?', kps, c.bugunStr()).map((x) => x.kullanici_id);
    const gorevliSart = gorevliler.length ? ` OR id IN (${gorevliler.map(() => '?').join(',')})` : '';
    if (c.hak(k, 'personel')) {
      v.personel = c.q(`SELECT id,kullanici_adi,ad,rol,sube_id,yetkiler,telefon,aktif FROM kullanicilar WHERE ${kps === null ? '1=1' : `(sube_id=? AND rol IN ('buro','muhasebe','egitmen')) OR id=?${gorevliSart}`} ORDER BY ad`, ...(kps === null ? [] : [kps, k.id, ...gorevliler]))
        .map((p) => { const x = { ...p, haklar: c.etkinHaklar(p) }; delete x.yetkiler; return x; });
    } else {
      v.personel = c.q(`SELECT id,ad,rol,sube_id,aktif FROM kullanicilar WHERE aktif=1 AND (${kps === null ? '1=1' : "sube_id=? OR rol='yonetici'" + gorevliSart}) ORDER BY ad`, ...sp, ...gorevliler);
    }
    v.araclar = c.q(`SELECT * FROM araclar WHERE ${subeSart} ORDER BY plaka`, ...sp);
    if (c.hak(k, 'personel')) {
      const ids = new Set(v.personel.map((p) => p.id));
      v.personelBelgeleri = c.q('SELECT * FROM personel_belgeleri ORDER BY bitis').filter((b) => ids.has(b.kullanici_id));
      v.izinler = c.q('SELECT * FROM izinler WHERE bit>=? ORDER BY bas', gunOnce(c.bugunStr(), 60)).filter((b) => ids.has(b.kullanici_id));
    }
    v.gorevlendirmeler = c.q(`SELECT * FROM gorevlendirmeler WHERE ${subeSart} AND bit>=? ORDER BY bas`, ...sp, c.bugunStr());
    if (k.rol === 'egitmen') v.gorevlendirmeler = v.gorevlendirmeler.filter((g) => g.kullanici_id === k.id)
      .concat(c.q('SELECT * FROM gorevlendirmeler WHERE kullanici_id=? AND bit>=?', k.id, c.bugunStr()).filter((g) => g.sube_id !== k.sube_id));
    if (!c.egitmenKisitli(k))
      v.olaylar = c.q(`SELECT * FROM olaylar WHERE ${kps === null ? '1=1' : 'sube_id=?'} ORDER BY id DESC LIMIT 200`, ...sp)
        .filter((o) => c.olayGorebilir(k, o)).slice(0, 80);
  },

  islemler: {
    sube_ekle(c, k, g) {
      if (k.rol !== 'yonetici') fail('Şube yalnız yönetici tarafından açılır.', 403);
      const ad = metin(g.ad, 80, true, 'Şube adı');
      if (c.q1('SELECT 1 FROM subeler WHERE ad=? COLLATE NOCASE', ad)) fail('Bu adla bir şube zaten var.');
      const sinir = c.limit().maxSube;
      if (c.q1('SELECT COUNT(*) n FROM subeler WHERE aktif=1').n >= sinir) fail(`Lisansınız en fazla ${sinir} şube içindir. Yeni şube için DC ile görüşün.`, 402);
      const id = randomUUID();
      c.run('INSERT INTO subeler(id,ad,adres,telefon,merkez,aktif,olusturma,kod) VALUES(?,?,?,?,0,1,?,?)', id, ad, metin(g.adres, 300), metin(g.telefon, 30), simdi(), subeKodu(c, g.kod, null));
      return { sonuc: { id }, olay: [id, 'sube', `Yeni şube açıldı: ${ad}`] };
    },
    sube_duzenle(c, k, g) {
      if (k.rol !== 'yonetici') fail('Şube bilgisi yalnız yönetici tarafından değiştirilir.', 403);
      const s = c.subeIzinli(k, g.id);
      const aktif = g.aktif === undefined ? s.aktif : g.aktif ? 1 : 0;
      if (s.merkez && !aktif) fail('Merkez şube kapatılamaz.');
      if (!s.aktif && aktif && c.q1('SELECT COUNT(*) n FROM subeler WHERE aktif=1').n >= c.limit().maxSube) fail(`Lisansınız en fazla ${c.limit().maxSube} açık şube içindir.`, 402);
      const ad = metin(g.ad ?? s.ad, 80, true, 'Şube adı');
      c.run('UPDATE subeler SET ad=?,adres=?,telefon=?,aktif=?,kod=? WHERE id=?', ad, metin(g.adres ?? s.adres, 300), metin(g.telefon ?? s.telefon, 30), aktif,
        g.kod !== undefined ? subeKodu(c, g.kod, s.id) : s.kod, s.id);
      if (!aktif) c.run("DELETE FROM oturumlar WHERE tur='personel' AND kimlik IN (SELECT id FROM kullanicilar WHERE sube_id=?)", s.id);
      return { olay: [s.id, 'sube', `Şube bilgisi güncellendi: ${ad}${aktif ? '' : ' (kapatıldı)'}`] };
    },

    personel_ekle(c, k, g) {
      const subeId = personelYetkiDenetle(c, k, g.rol, g.subeId);
      kullaniciSiniri(c);
      const kad = metin(g.kullaniciAdi, 40, true, 'Kullanıcı adı').toLocaleLowerCase('tr-TR');
      if (!/^[a-z0-9._-]{3,40}$/.test(kad)) fail('Kullanıcı adı en az 3 karakter olmalı; harf, rakam, nokta ve tire kullanılabilir.');
      if (c.q1('SELECT 1 FROM kullanicilar WHERE kullanici_adi=?', kad)) fail('Bu kullanıcı adı alınmış.');
      const id = randomUUID();
      const ad = metin(g.ad, 80, true, 'Ad soyad');
      c.run('INSERT INTO kullanicilar(id,kullanici_adi,ad,sifre,rol,sube_id,yetkiler,telefon,aktif,olusturma) VALUES(?,?,?,?,?,?,?,?,1,?)',
        id, kad, ad, c.sifreOzet(c.sifreKontrol(g.sifre)), g.rol, subeId, hakListesi(c, g.yetkiler), metin(g.telefon, 30), simdi());
      return { sonuc: { id }, olay: [subeId, 'personel', `Personel eklendi: ${ad} (${c.ROLLER[g.rol]})`] };
    },
    personel_duzenle(c, k, g) {
      c.hakGerek(k, 'personel');
      const p = c.q1('SELECT * FROM kullanicilar WHERE id=?', metin(g.id, 60, true));
      if (!p) fail('Personel bulunamadı.', 404);
      if (k.rol !== 'yonetici' && p.id !== k.id && (!['buro', 'muhasebe', 'egitmen'].includes(p.rol) || p.sube_id !== k.sube_id)) fail('Bu personeli düzenleme yetkiniz yok.', 403);
      const rol = g.rol ?? p.rol;
      const subeId = g.subeId !== undefined ? g.subeId : p.sube_id;
      if (p.id === k.id) {
        if (g.yeniSifre) fail('Kendi şifrenizi "Hesabım" bölümünden, eski şifrenizle değiştirin.');
        if (rol !== p.rol || (rol !== 'yonetici' && subeId !== p.sube_id) || g.aktif === false) fail('Kendi görevinizi, şubenizi veya girişinizi değiştiremezsiniz.');
      } else personelYetkiDenetle(c, k, rol, subeId);
      const yeniSube = rol === 'yonetici' ? null : subeId;
      const aktif = g.aktif === undefined ? p.aktif : g.aktif ? 1 : 0;
      if (aktif && !p.aktif) kullaniciSiniri(c);
      if (p.rol === 'yonetici' && (!aktif || rol !== 'yonetici') && c.q1("SELECT COUNT(*) n FROM kullanicilar WHERE rol='yonetici' AND aktif=1").n <= 1) fail('Son yönetici kapatılamaz.');
      const ad = metin(g.ad ?? p.ad, 80, true, 'Ad soyad');
      c.run('UPDATE kullanicilar SET ad=?,rol=?,sube_id=?,yetkiler=?,telefon=?,aktif=? WHERE id=?',
        ad, rol, yeniSube, g.yetkiler !== undefined ? hakListesi(c, g.yetkiler) : p.yetkiler, metin(g.telefon ?? p.telefon, 30), aktif, p.id);
      if (g.yeniSifre) c.run('UPDATE kullanicilar SET sifre=? WHERE id=?', c.sifreOzet(c.sifreKontrol(g.yeniSifre)), p.id);
      // Şifresi, görevi, şubesi değişen ya da girişi kapatılan personelin açık oturumları kapanır (kendisi hariç).
      if (p.id !== k.id && (g.yeniSifre || !aktif || rol !== p.rol || yeniSube !== p.sube_id)) c.run("DELETE FROM oturumlar WHERE tur='personel' AND kimlik=?", p.id);
      return { olay: [yeniSube, 'personel', `Personel bilgisi güncellendi: ${ad}${aktif ? '' : ' (girişi kapatıldı)'}`] };
    },

    // Merkez, eğitmeni belli tarihler arasında başka şubede ders vermeye görevlendirir (karar 7).
    gorevlendir(c, k, g) {
      if (k.rol !== 'yonetici') fail('Başka şubeye görevlendirmeyi yalnız merkez yapar.', 403);
      const p = c.q1("SELECT * FROM kullanicilar WHERE id=? AND rol IN ('egitmen','sube_muduru') AND aktif=1", metin(g.kullaniciId, 60, true, 'Eğitmen'));
      if (!p) fail('Eğitmen bulunamadı.');
      const s = c.subeIzinli(k, g.subeId);
      if (s.id === p.sube_id) fail('Eğitmen zaten bu şubede.');
      const bas = gun(g.bas, 'Başlangıç'), bit = gun(g.bit, 'Bitiş');
      if (bas > bit) fail('Başlangıç bitişten sonra olamaz.');
      c.run('INSERT INTO gorevlendirmeler(id,kullanici_id,sube_id,bas,bit,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?)',
        randomUUID(), p.id, s.id, bas, bit, metin(g.aciklama, 200), k.ad, simdi());
      return { olay: [s.id, 'personel', `${p.ad} ${bas} ile ${bit} arasında ${s.ad} şubesine görevlendirildi`], ekOlaylar: [[p.sube_id, 'personel', `${p.ad} geçici olarak ${s.ad} şubesine görevlendirildi`]] };
    },
    gorevlendirme_bitir(c, k, g) {
      if (k.rol !== 'yonetici') fail('Görevlendirmeyi yalnız merkez değiştirir.', 403);
      const x = c.q1('SELECT * FROM gorevlendirmeler WHERE id=?', metin(g.id, 60, true));
      if (!x) fail('Görevlendirme bulunamadı.', 404);
      const dun = new Date(Date.parse(c.bugunStr() + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
      c.run('UPDATE gorevlendirmeler SET bit=? WHERE id=?', x.bas > dun ? x.bas : dun, x.id);
      if (x.bas > dun) c.run('DELETE FROM gorevlendirmeler WHERE id=?', x.id);
      return { olay: [x.sube_id, 'personel', 'Görevlendirme sona erdirildi'] };
    },

    arac_ekle(c, k, g) {
      c.hakGerek(k, 'personel');
      c.subeIzinli(k, g.subeId);
      const plaka = metin(g.plaka, 15, true, 'Plaka').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
      if (c.q1('SELECT 1 FROM araclar WHERE plaka=?', plaka)) fail('Bu plaka zaten kayıtlı.');
      const id = randomUUID();
      c.run('INSERT INTO araclar(id,sube_id,plaka,model,sinif,aktif) VALUES(?,?,?,?,?,1)', id, g.subeId, plaka, metin(g.model, 60), secim(g.sinif || 'B', Object.keys(c.ayar().siniflar), 'Sınıf'));
      aracTakip(c, id, g, {});
      return { sonuc: { id }, olay: [g.subeId, 'arac', `Araç eklendi: ${plaka}`] };
    },
    arac_duzenle(c, k, g) {
      c.hakGerek(k, 'personel');
      const a = c.q1('SELECT * FROM araclar WHERE id=?', metin(g.id, 60, true));
      if (!a) fail('Araç bulunamadı.', 404);
      c.subeIzinli(k, a.sube_id);
      const subeId = g.subeId || a.sube_id;
      c.subeIzinli(k, subeId);
      c.run('UPDATE araclar SET model=?,sinif=?,aktif=?,sube_id=? WHERE id=?', metin(g.model ?? a.model, 60), secim(g.sinif ?? a.sinif, Object.keys(c.ayar().siniflar), 'Sınıf'), g.aktif === undefined ? a.aktif : g.aktif ? 1 : 0, subeId, a.id);
      aracTakip(c, a.id, g, a);
      return { olay: [subeId, 'arac', `Araç güncellendi: ${a.plaka}`] };
    },

    // Kilometre: araç yetkisi olan ya da o aracı derste kullanan eğitmen girer (sahadan).
    arac_km(c, k, g) {
      const a = c.q1('SELECT * FROM araclar WHERE id=?', metin(g.id, 60, true, 'Araç'));
      if (!a) fail('Araç bulunamadı.', 404);
      if (c.hak(k, 'personel')) c.subeIzinli(k, a.sube_id);
      else if (!(a.sube_id === k.sube_id || c.q1('SELECT 1 FROM dersler WHERE arac_id=? AND egitmen_id=? AND tarih>=? LIMIT 1', a.id, k.id, gunOnce(c.bugunStr(), 30))))
        fail('Bu aracın kilometresini giremezsiniz.', 403);
      const km = tamSayi(g.km, 0, 5_000_000, 'Kilometre');
      if (a.km && km < a.km && !c.hak(k, 'personel')) fail(`Girilen kilometre kayıtlı olandan (${a.km.toLocaleString('tr-TR')}) küçük olamaz.`);
      c.run('UPDATE araclar SET km=? WHERE id=?', km, a.id);
      c.run('INSERT INTO arac_km(id,arac_id,km,tarih,kaydeden,olusturma) VALUES(?,?,?,?,?,?)', randomUUID(), a.id, km, c.bugunStr(), k.ad, simdi());
      const bakimUyari = a.bakim_km && a.bakim_km - km <= 1000 ? ` · bakıma ${Math.max(0, a.bakim_km - km).toLocaleString('tr-TR')} km kaldı` : '';
      return { olay: [a.sube_id, 'arac', `${a.plaka} kilometresi: ${km.toLocaleString('tr-TR')}${bakimUyari}`, { egitmen: k.id }] };
    },
    // Arıza / kullanım dışı: o günlerdeki planlı dersler listelenir, "toplu aktarım" ile başka araca geçirilir.
    arac_ariza(c, k, g) {
      const a = c.q1('SELECT * FROM araclar WHERE id=?', metin(g.id, 60, true, 'Araç'));
      if (!a) fail('Araç bulunamadı.', 404);
      if (c.hak(k, 'personel') || c.hak(k, 'ders')) c.subeIzinli(k, a.sube_id);
      else if (a.sube_id !== k.sube_id) fail('Bu araç için yetkiniz yok.', 403);
      if (g.bitir) {
        c.run("UPDATE araclar SET ariza='', ariza_bas='', ariza_bit='' WHERE id=?", a.id);
        return { olay: [a.sube_id, 'arac', `${a.plaka} yeniden kullanımda`, { egitmen: k.id }] };
      }
      const aciklama = metin(g.aciklama, 200, true, 'Arıza açıklaması');
      const bas = gun(g.bas || c.bugunStr(), 'Başlangıç'), bit = gun(g.bit, 'Bitiş', false);
      if (bit && bit < bas) fail('Bitiş başlangıçtan önce olamaz.');
      c.run('UPDATE araclar SET ariza=?, ariza_bas=?, ariza_bit=? WHERE id=?', aciklama, bas, bit, a.id);
      const etkilenen = c.q(`SELECT id FROM dersler WHERE arac_id=? AND durum='planli' AND tarih>=?${bit ? ' AND tarih<=?' : ''}`, a.id, bas, ...(bit ? [bit] : [])).length;
      return { sonuc: { etkilenen }, olay: [a.sube_id, 'arac', `${a.plaka} arızalı / kullanım dışı: ${aciklama}${etkilenen ? ` · ${etkilenen} planlı ders başka araca aktarılmalı` : ''}`, { egitmen: k.id }] };
    },

    personel_belge_ekle(c, k, g) {
      const p = personelAl(c, k, g.kullaniciId);
      c.run('INSERT INTO personel_belgeleri(id,kullanici_id,tur,no,bitis,notlar,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?)',
        randomUUID(), p.id, metin(g.tur, 60, true, 'Belge'), metin(g.no, 40), gun(g.bitis, 'Bitiş', false), metin(g.notlar, 200), k.ad, simdi());
      return { olay: [p.sube_id, 'personel', `${p.ad} için belge kaydedildi: ${g.tur}`] };
    },
    personel_belge_sil(c, k, g) {
      const b = c.q1('SELECT * FROM personel_belgeleri WHERE id=?', metin(g.id, 60, true));
      if (!b) fail('Belge bulunamadı.', 404);
      const p = personelAl(c, k, b.kullanici_id);
      c.run('DELETE FROM personel_belgeleri WHERE id=?', b.id);
      return { olay: [p.sube_id, 'personel', `${p.ad} belge kaydı silindi: ${b.tur}`] };
    },
    // İzinli eğitmene o günlerde ders planlanamaz.
    izin_ekle(c, k, g) {
      const p = personelAl(c, k, g.kullaniciId);
      const bas = gun(g.bas, 'Başlangıç'), bit = gun(g.bit, 'Bitiş');
      if (bas > bit) fail('Başlangıç bitişten sonra olamaz.');
      const planli = c.q1("SELECT COUNT(*) n FROM dersler WHERE egitmen_id=? AND durum='planli' AND tarih BETWEEN ? AND ?", p.id, bas, bit).n;
      c.run('INSERT INTO izinler(id,kullanici_id,bas,bit,tur,aciklama,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?)',
        randomUUID(), p.id, bas, bit, metin(g.tur, 40, true, 'İzin türü'), metin(g.aciklama, 200), k.ad, simdi());
      return { sonuc: { planli }, olay: [p.sube_id, 'personel', `${p.ad} izinli: ${bas} - ${bit} (${g.tur})${planli ? ` · bu günlerde ${planli} planlı dersi var, başka eğitmene aktarılmalı` : ''}`] };
    },
    izin_sil(c, k, g) {
      const x = c.q1('SELECT * FROM izinler WHERE id=?', metin(g.id, 60, true));
      if (!x) fail('İzin bulunamadı.', 404);
      const p = personelAl(c, k, x.kullanici_id);
      c.run('DELETE FROM izinler WHERE id=?', x.id);
      return { olay: [p.sube_id, 'personel', `${p.ad} izin kaydı silindi`] };
    },

    // Kurum ayarları: yalnız yönetici. Her bölüm ayrı doğrulanır.
    ayar_kaydet(c, k, g) {
      if (k.rol !== 'yonetici') fail('Ayarları yalnız yönetici değiştirir.', 403);
      const bolum = secim(g.bolum, ['kurum', 'kurallar', 'siniflar', 'ogrenciDersSecimi', 'prim', 'ucretler', 'evrakTurleri', 'sozlesme', 'sms', 'pos', 'konum', 'makbuz', 'kvkk', 'fatura', 'onKayit', 'hatirlatma', 'karne', 'denemeTest'], 'Ayar bölümü');
      const d = g.deger || {};
      const a = c.ayar();
      if (bolum === 'kurum') {
        if (d.ad !== undefined) c.run('UPDATE kurum SET ad=?', metin(d.ad, 120, true, 'Kurum adı'));
        const logo = d.logo === undefined ? a.kurum.logo : d.logo ? gorselDogrula(d.logo) : '';
        c.ayarYaz('kurum', { adres: metin(d.adres ?? a.kurum.adres, 300), telefon: metin(d.telefon ?? a.kurum.telefon, 30),
          vergiDairesi: metin(d.vergiDairesi ?? a.kurum.vergiDairesi, 80), vergiNo: metin(d.vergiNo ?? a.kurum.vergiNo, 20), logo });
      } else if (bolum === 'kurallar') {
        c.ayarYaz('sinavHakki', tamSayi(d.sinavHakki ?? a.sinavHakki, 1, 20, 'Sınav hakkı'));
        c.ayarYaz('eSinavGecme', tamSayi(d.eSinavGecme ?? a.eSinavGecme, 1, 100, 'E-sınav geçme puanı'));
        c.ayarYaz('dersSuresi', tamSayi(d.dersSuresi ?? a.dersSuresi, 10, 240, 'Ders süresi'));
        if (d.girmediHakYakar !== undefined) c.ayarYaz('girmediHakYakar', !!d.girmediHakYakar);
        c.ayarYaz('egitmenGunlukDers', tamSayi(d.egitmenGunlukDers ?? a.egitmenGunlukDers, 0, 24, 'Eğitmen günlük ders sınırı'));
        c.ayarYaz('ogrenciGunlukDers', tamSayi(d.ogrenciGunlukDers ?? a.ogrenciGunlukDers, 1, 6, 'Öğrenci günlük ders sınırı'));
        c.ayarYaz('eSinavGecerlilikGun', tamSayi(d.eSinavGecerlilikGun ?? a.eSinavGecerlilikGun, 0, 3650, 'E-sınav geçerlilik süresi'));
      } else if (bolum === 'siniflar') {
        if (!d || typeof d !== 'object') fail('Sınıf listesi geçersiz.');
        const yeni = {};
        for (const [kod, x] of Object.entries(d)) {
          const kd = metin(kod, 20, true, 'Sınıf kodu');
          yeni[kd] = { ad: metin(x.ad || kd, 60, true, 'Sınıf adı'), teorik: tamSayi(x.teorik, 0, 200, 'Teorik saat'), direksiyon: tamSayi(x.direksiyon, 0, 200, 'Direksiyon saati') };
        }
        if (!Object.keys(yeni).length) fail('En az bir ehliyet sınıfı olmalı.');
        const kullanilan = c.q("SELECT DISTINCT sinif FROM ogrenciler WHERE durum IN ('aktif','dondu')").map((x) => x.sinif).filter((s) => !yeni[s]);
        if (kullanilan.length) fail(`Aktif öğrencisi olan sınıf silinemez: ${kullanilan.join(', ')}`);
        c.ayarYaz('siniflar', yeni);
      } else if (bolum === 'ogrenciDersSecimi') {
        const bas = metin(d.bas ?? a.ogrenciDersSecimi.bas, 5), bit = metin(d.bit ?? a.ogrenciDersSecimi.bit, 5);
        if (!saatDogru(bas) || !saatDogru(bit) || bas >= bit) fail('Saat aralığı geçersiz.');
        c.ayarYaz('ogrenciDersSecimi', { acik: !!(d.acik ?? a.ogrenciDersSecimi.acik), bas, bit,
          enErkenGun: tamSayi(d.enErkenGun ?? a.ogrenciDersSecimi.enErkenGun, 0, 30, 'En erken gün'),
          enGecGun: tamSayi(d.enGecGun ?? a.ogrenciDersSecimi.enGecGun, 1, 90, 'En geç gün') });
      } else if (bolum === 'prim') {
        c.ayarYaz('prim', { direksiyon: tamSayi(d.direksiyon ?? 0, 0, 100_000_00, 'Direksiyon primi'), teorik: tamSayi(d.teorik ?? 0, 0, 100_000_00, 'Teorik primi') });
      } else if (bolum === 'ucretler') {
        c.ayarYaz('ucretler', { ekDers: tamSayi(d.ekDers ?? 0, 0, 100_000_00, 'Ek ders ücreti'), sinavTekrar: tamSayi(d.sinavTekrar ?? 0, 0, 100_000_00, 'Sınav tekrar ücreti') });
      } else if (bolum === 'evrakTurleri') {
        if (!Array.isArray(d.liste)) fail('Evrak listesi geçersiz.');
        c.ayarYaz('evrakTurleri', [...new Set(d.liste.map((x) => metin(x, 60)).filter(Boolean))].slice(0, 20));
      } else if (bolum === 'sozlesme') {
        c.ayarYaz('sozlesmeMetni', metin(d.metin, 20000));
      } else if (bolum === 'kvkk') {
        const yeniMetin = metin(d.metin ?? a.kvkk.metin, 20000);
        c.ayarYaz('kvkk', { metin: yeniMetin, surum: (a.kvkk.surum || 1) + (yeniMetin !== a.kvkk.metin ? 1 : 0), saklamaYil: tamSayi(d.saklamaYil ?? a.kvkk.saklamaYil, 0, 30, 'Saklama süresi') });
      } else if (bolum === 'fatura') {
        c.ayarYaz('fatura', { kdvOrani: tamSayi(d.kdvOrani ?? a.fatura.kdvOrani, 0, 100, 'KDV oranı') });
      } else if (bolum === 'onKayit') {
        c.ayarYaz('onKayit', { acik: !!d.acik, mesaj: metin(d.mesaj, 500) });
        if (Array.isArray(d.kaynaklar)) c.ayarYaz('kaynaklar', [...new Set(d.kaynaklar.map((x) => metin(x, 40)).filter(Boolean))].slice(0, 30));
      } else if (bolum === 'karne') {
        if (!Array.isArray(d.konular)) fail('Konu listesi geçersiz.');
        const l = [...new Set(d.konular.map((x) => metin(x, 60)).filter(Boolean))].slice(0, 40);
        if (!l.length) fail('En az bir konu olmalı.');
        c.ayarYaz('karneKonulari', l);
      } else if (bolum === 'denemeTest') {
        c.ayarYaz('denemeTest', { acik: !!d.acik, soruSayisi: tamSayi(d.soruSayisi ?? a.denemeTest.soruSayisi, 5, 100, 'Soru sayısı'), sureDk: tamSayi(d.sureDk ?? a.denemeTest.sureDk, 5, 180, 'Süre') });
      } else if (bolum === 'makbuz') {
        const seri = secim(d.seri, ['kurum', 'sube'], 'Makbuz serisi');
        if (seri === 'sube') {
          const eksik = c.q("SELECT ad FROM subeler WHERE aktif=1 AND kod=''").map((x) => x.ad);
          if (eksik.length) fail(`Şube serisi için her şubeye kısa kod verin (Şubeler > Düzenle). Kodu olmayan: ${eksik.join(', ')}`);
        }
        c.ayarYaz('makbuzSerisi', seri);
      } else if (bolum === 'konum') {
        c.ayarYaz('konumKaydi', !!d.acik);
      } else if (bolum === 'sms') {
        c.ayarYaz('sms', smsAyarDogrula(c, d, a.sms));
      } else if (bolum === 'hatirlatma') {
        c.ayarYaz('hatirlatma', hatirlatmaAyarDogrula(d, a.hatirlatma));
      } else if (bolum === 'pos') {
        const saglayici = d.saglayici ? secim(d.saglayici, ['deneme', 'paytr'], 'Sanal POS sağlayıcısı') : '';
        if (d.acik && !saglayici) fail('Sanal POS sağlayıcısı seçin.');
        if (saglayici === 'deneme' && !c.posDeneme) fail('Deneme sağlayıcısı yalnız deneme kurumunda kullanılabilir.');
        // Anahtarlar ekrana geri gönderilmez (yıldız gider); yıldız ya da boş gelirse eskisi korunur. Şifreli saklanır.
        const yeniMi = (x) => x && x !== c.GIZLI;
        const gizli = yeniMi(d.gizli) ? c.sifre.metinSifrele(metin(d.gizli, 200)) : a.pos.gizli;
        const anahtar = yeniMi(d.anahtar) ? c.sifre.metinSifrele(metin(d.anahtar, 200)) : a.pos.anahtar;
        if (d.acik && saglayici === 'paytr' && (!d.magazaNo || !anahtar || !gizli)) fail('PayTR için mağaza no, anahtar ve gizli anahtar gerekir.');
        c.ayarYaz('pos', { acik: !!d.acik, saglayici, magazaNo: metin(d.magazaNo, 40), anahtar, gizli, deneme: d.deneme !== false });
      }
      return { olay: [null, 'ayar', `Kurum ayarı değiştirildi: ${{ kurum: 'kurum bilgileri', kurallar: 'sınav ve ders kuralları', siniflar: 'ehliyet sınıfları', ogrenciDersSecimi: 'öğrencinin ders seçmesi', prim: 'eğitmen primi', ucretler: 'ek ücretler', evrakTurleri: 'evrak listesi', sozlesme: 'sözleşme metni', sms: 'SMS', pos: 'internetten ödeme', konum: 'konum kaydı', makbuz: 'makbuz serisi', kvkk: 'kişisel veri', fatura: 'fatura', onKayit: 'ön kayıt ve kaynaklar', hatirlatma: 'otomatik hatırlatma', karne: 'karne konuları', denemeTest: 'deneme testi' }[bolum]}`] };
    },
  },
};

// Lisanstaki kullanıcı (açık personel hesabı) sınırı. 0 = sınırsız.
function kullaniciSiniri(c) {
  const sinir = c.limit().maxKullanici || 0;
  if (sinir && c.q1('SELECT COUNT(*) n FROM kullanicilar WHERE aktif=1').n >= sinir) fail(`Lisansınız en fazla ${sinir} açık personel hesabı içindir. Kullanılmayan bir hesabı kapatın ya da DC ile görüşün.`, 402);
}
function subeKodu(c, v, haricId) {
  const kod = metin(v, 6).toLocaleUpperCase('tr-TR');
  if (!kod) return '';
  if (!/^[A-Z0-9]{2,6}$/.test(kod)) fail('Şube kısa kodu 2-6 harf veya rakam olmalı (Türkçe harf yok). Örnek: CNK');
  if (c.q1('SELECT 1 FROM subeler WHERE kod=? AND id!=?', kod, haricId || '')) fail('Bu kısa kod başka bir şubede kullanılıyor.');
  return kod;
}
function personelYetkiDenetle(c, k, rol, subeId) {
  c.hakGerek(k, 'personel');
  secim(rol, Object.keys(c.ROLLER), 'Görev');
  if (k.rol !== 'yonetici') {
    if (!['buro', 'muhasebe', 'egitmen'].includes(rol)) fail('Şube müdürü yalnız büro, muhasebe personeli ve eğitmen ekleyebilir.', 403);
    if (subeId !== k.sube_id) fail('Yalnız kendi şubenize personel ekleyebilirsiniz.', 403);
  }
  if (rol === 'yonetici') return null;
  c.subeIzinli(k, subeId);
  return subeId;
}
function personelAl(c, k, id) {
  c.hakGerek(k, 'personel');
  const p = c.q1('SELECT * FROM kullanicilar WHERE id=?', metin(id, 60, true, 'Personel'));
  if (!p || (k.rol !== 'yonetici' && p.sube_id !== k.sube_id)) fail('Personel bulunamadı.', 404);
  return p;
}
function gunOnce(g, n) { return new Date(Date.parse(g + 'T12:00:00Z') - n * 86400000).toISOString().slice(0, 10); }
function aracTakip(c, id, g, a) {
  const say = (v, ad) => (v === '' || v === null || v === undefined ? null : tamSayi(v, 0, 5_000_000, ad));
  c.run('UPDATE araclar SET km=?, muayene=?, sigorta=?, kasko=?, bakim=?, bakim_km=?, notlar=? WHERE id=?',
    g.km !== undefined ? say(g.km, 'Kilometre') : a.km ?? null,
    g.muayene !== undefined ? gun(g.muayene, 'Muayene', false) : a.muayene ?? '',
    g.sigorta !== undefined ? gun(g.sigorta, 'Sigorta', false) : a.sigorta ?? '',
    g.kasko !== undefined ? gun(g.kasko, 'Kasko', false) : a.kasko ?? '',
    g.bakim !== undefined ? gun(g.bakim, 'Bakım', false) : a.bakim ?? '',
    g.bakimKm !== undefined ? say(g.bakimKm, 'Bakım km') : a.bakim_km ?? null,
    g.notlar !== undefined ? metin(g.notlar, 300) : a.notlar ?? '', id);
}
function hakListesi(c, v) {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) fail('Yetki listesi geçersiz.');
  return JSON.stringify([...new Set(v.filter((x) => c.VERILEBILIR.includes(x)))]);
}
export function gorselDogrula(v, enFazla = 700_000) {
  if (typeof v !== 'string' || v.length > enFazla || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) fail('Logo JPG, PNG veya WebP olmalı (en fazla 500 KB).');
  const b = Buffer.from(v.split(',')[1], 'base64');
  const png = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const jpg = b.subarray(0, 3).toString('hex') === 'ffd8ff';
  const webp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpg && !webp) fail('Görsel dosyası okunamadı.');
  return v;
}
