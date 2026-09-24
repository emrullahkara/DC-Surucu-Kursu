// Otomatik hatırlatmalar: yarınki direksiyon dersi, yaklaşan sınav, vadesi gelen taksit (ve istenirse haftalık
// gecikme hatırlatması). Her gün ayardaki saatte kendiliğinden hazırlanır:
//  - SMS açıksa SMS firması üzerinden gönderilir,
//  - değilse öğrencinin kendi ekranında "bildirim" olarak görünür ve personel ekranında WhatsApp ile tek tek
//    gönderilebilecek liste olarak durur.
// Aynı hatırlatma iki kez oluşmaz (tür + kayıt + gün tekildir).
//
// SMS firması: Netgsm (DİKKAT: gerçek hesapla denenmedi; ilk kullanımda "Deneme SMS'i" ile kontrol edilmeli)
// ve deneme sağlayıcısı (gerçek SMS gitmez; yalnız deneme kurumunda).
import { randomUUID } from 'node:crypto';
import { fail, metin, saat, secim, tamSayi, tlYaz, yerelZaman } from '../domain.mjs';

const simdi = () => new Date().toISOString();
const gunEkle = (g, n) => new Date(Date.parse(g + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const trTarih = (g) => g.split('-').reverse().join('.');

export const VARSAYILAN_SABLON = {
  ders: 'Sayın {AD}, {TARIH} {SAAT} direksiyon dersiniz var. {KURUM}',
  sinav: 'Sayın {AD}, {TARIH} {SAAT} {SINAV} tarihiniz. Kimliğinizi unutmayın. {KURUM}',
  taksit: 'Sayın {AD}, {TARIH} vadeli {TUTAR} taksidiniz bulunmaktadır. {KURUM}',
  geciken: 'Sayın {AD}, {TUTAR} gecikmiş ödemeniz bulunmaktadır. Bilgilerinize sunarız. {KURUM}',
};
const doldur = (sablon, d) => sablon.replace(/\{([A-Z]+)\}/g, (_, a) => (d[a] ?? ''));

// Türkiye cep numarası: 5XXXXXXXXX (10 hane). Değilse boş.
export function cepNo(t) {
  let n = String(t || '').replace(/\D/g, '');
  if (n.startsWith('90')) n = n.slice(2);
  if (n.startsWith('0')) n = n.slice(1);
  return /^5\d{9}$/.test(n) ? n : '';
}

// SMS gönderimi. Dönüş: {tamam, hata?}
async function smsGonder(c, sms, telefon, mesaj) {
  const no = cepNo(telefon);
  if (!no) return { tamam: false, hata: 'Cep telefonu numarası geçersiz' };
  if (sms.saglayici === 'deneme') {
    if (!c.smsDeneme) return { tamam: false, hata: 'Deneme sağlayıcısı bu kurumda kapalı' };
    return { tamam: true, not: 'deneme (gerçek SMS gitmedi)' };
  }
  if (sms.saglayici === 'netgsm') {
    const u = new URL('https://api.netgsm.com.tr/sms/send/get');
    u.search = new URLSearchParams({ usercode: sms.kullanici, password: c.sifre.metinCoz(sms.sifre), gsmno: no, message: mesaj, msgheader: sms.baslik, dil: 'TR' }).toString();
    try {
      const r = await c.disIstek(u.toString(), { signal: AbortSignal.timeout(15000) });
      const cevap = (await r.text()).trim();
      // Netgsm: "00 <görev no>" (ya da 01/02) başarılı; diğer kodlar hata.
      if (/^0[0-2]\b/.test(cevap)) return { tamam: true, not: cevap.slice(0, 40) };
      return { tamam: false, hata: `SMS firması hata kodu: ${cevap.slice(0, 40)}` };
    } catch { return { tamam: false, hata: 'SMS firmasına ulaşılamadı' }; }
  }
  return { tamam: false, hata: 'SMS firması seçilmemiş' };
}

// Bugün için hatırlatmaları hazırlar (tekrar çağrılırsa yeni olanlar eklenir). Dönüş: eklenen sayı.
export function hatirlatmaHazirla(c) {
  const a = c.ayar();
  const h = a.hatirlatma;
  const bugun = c.bugunStr();
  const kurum = c.q1('SELECT ad FROM kurum')?.ad || '';
  const sab = { ...VARSAYILAN_SABLON, ...(h.sablonlar || {}) };
  let n = 0;
  const ekle = (tur, ref, o, mesaj) => {
    const anahtar = `${tur}:${ref}:${bugun}`;
    if (c.q1('SELECT 1 FROM bildirimler WHERE anahtar=?', anahtar)) return;
    c.run("INSERT INTO bildirimler(id,anahtar,tur,ogrenci_id,sube_id,telefon,metin,durum,olusturma) VALUES(?,?,?,?,?,?,?,'bekliyor',?)",
      randomUUID(), anahtar, tur, o.id, o.sube_id, o.telefon || '', mesaj, simdi());
    n++;
  };
  const ogrMap = new Map(c.q("SELECT * FROM ogrenciler WHERE durum='aktif' AND anonim=0").map((o) => [o.id, o]));
  if (h.dersGunOnce >= 0) {
    const hedef = gunEkle(bugun, h.dersGunOnce);
    for (const d of c.q("SELECT * FROM dersler WHERE tarih=? AND durum='planli' AND tur='direksiyon'", hedef)) {
      const o = ogrMap.get(d.ogrenci_id);
      if (o) ekle('ders', d.id, o, doldur(sab.ders, { AD: o.ad, TARIH: trTarih(d.tarih), SAAT: d.saat, KURUM: kurum }));
    }
  }
  if (h.sinavGunOnce >= 0) {
    const hedef = gunEkle(bugun, h.sinavGunOnce);
    for (const s of c.q("SELECT * FROM sinavlar WHERE tarih=? AND sonuc='bekliyor'", hedef)) {
      const o = ogrMap.get(s.ogrenci_id);
      if (o) ekle('sinav', s.id, o, doldur(sab.sinav, { AD: o.ad, TARIH: trTarih(s.tarih), SAAT: s.saat, SINAV: s.tur === 'e_sinav' ? 'e-sınav' : 'direksiyon sınavı', KURUM: kurum }));
    }
  }
  if (h.taksitGunOnce >= 0 || h.gecikenHaftalik) {
    const hedef = gunEkle(bugun, Math.max(0, h.taksitGunOnce));
    const pazartesi = new Date(bugun + 'T12:00:00Z').getUTCDay() === 1;
    const hesaplar = c.hesapToplu([...ogrMap.values()]);
    for (const o of ogrMap.values()) {
      const hs = hesaplar.get(o.id);
      if (!hs) continue;
      if (h.taksitGunOnce >= 0) for (const t of hs.taksitler) if (t.vade === hedef && t.durum !== 'odendi')
        ekle('taksit', `${o.id}-${t.vade}`, o, doldur(sab.taksit, { AD: o.ad, TARIH: trTarih(t.vade), TUTAR: tlYaz(t.tutar - t.odenen), KURUM: kurum }));
      if (h.gecikenHaftalik && pazartesi && hs.geciken > 0) ekle('geciken', o.id, o, doldur(sab.geciken, { AD: o.ad, TUTAR: tlYaz(hs.geciken), KURUM: kurum }));
    }
  }
  return n;
}

// Bekleyen hatırlatmaları SMS ile gönderir (DB işlemi dışında; dış istek beklenir).
async function bekleyenleriGonder(c, idler = null) {
  const sms = c.ayar().sms;
  if (!sms.acik) return { gonderilen: 0, hata: 0 };
  const l = idler ? idler.map((id) => c.q1("SELECT * FROM bildirimler WHERE id=? AND durum IN ('bekliyor','hata')", String(id))).filter(Boolean)
    : c.q("SELECT * FROM bildirimler WHERE durum='bekliyor' ORDER BY olusturma LIMIT 500");
  let gonderilen = 0, hata = 0;
  for (const b of l) {
    const r = await smsGonder(c, sms, b.telefon, b.metin);
    c.run('UPDATE bildirimler SET durum=?, kanal=?, hata=?, gonderim=? WHERE id=?', r.tamam ? 'gonderildi' : 'hata', 'sms', r.tamam ? r.not || '' : r.hata, simdi(), b.id);
    if (r.tamam) gonderilen++; else hata++;
  }
  return { gonderilen, hata };
}

export default {
  ad: 'hatirlatma',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS bildirimler(id TEXT PRIMARY KEY, anahtar TEXT NOT NULL UNIQUE, tur TEXT NOT NULL, ogrenci_id TEXT REFERENCES ogrenciler(id),
  sube_id TEXT, telefon TEXT NOT NULL DEFAULT '', metin TEXT NOT NULL, kanal TEXT NOT NULL DEFAULT 'uygulama', durum TEXT NOT NULL DEFAULT 'bekliyor',
  hata TEXT NOT NULL DEFAULT '', olusturma TEXT NOT NULL, gonderim TEXT, gonderen TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS bildirim_ogr ON bildirimler(ogrenci_id);
CREATE INDEX IF NOT EXISTS bildirim_tarih ON bildirimler(olusturma);`);
  },

  veri(c, k, v) {
    const a = c.ayar();
    v.tanimlar.sms = { acik: a.sms.acik, saglayici: a.sms.saglayici };
    if (!c.hak(k, 'kayit') && !c.hak(k, 'tahsilat')) return;
    const kps = c.kapsam(k);
    const sinir = new Date(c.saatKaynagi().getTime() - 14 * 86400000).toISOString();
    // Ödeme hatırlatmalarının tutarı tahsilat yetkisi olmayana gönderilmez.
    v.bildirimler = c.q(`SELECT * FROM bildirimler WHERE olusturma>=? ${kps === null ? '' : 'AND sube_id=?'} ORDER BY olusturma DESC LIMIT 1000`, sinir, ...(kps === null ? [] : [kps]))
      .filter((b) => c.hak(k, 'tahsilat') || !['taksit', 'geciken'].includes(b.tur));
  },

  islemler: {
    // Bugünün listesini şimdi hazırla (saatini beklemeden).
    hatirlatma_hazirla(c, k) {
      if (!c.hak(k, 'kayit') && !c.hak(k, 'tahsilat')) fail('Yetkiniz yok.', 403);
      const n = hatirlatmaHazirla(c);
      return { sonuc: { eklenen: n }, olay: [k.sube_id, 'duyuru', `Bugünün hatırlatma listesi hazırlandı (${n} yeni)`] };
    },
    // WhatsApp ile elle gönderildi işareti.
    bildirim_isaretle(c, k, g) {
      if (!c.hak(k, 'kayit') && !c.hak(k, 'tahsilat')) fail('Yetkiniz yok.', 403);
      const b = c.q1('SELECT * FROM bildirimler WHERE id=?', metin(g.id, 60, true));
      if (!b || (k.rol !== 'yonetici' && b.sube_id !== k.sube_id)) fail('Bildirim bulunamadı.', 404);
      c.run("UPDATE bildirimler SET durum=?, kanal=?, gonderim=?, gonderen=? WHERE id=?", g.iptal ? 'iptal' : 'gonderildi', g.iptal ? b.kanal : 'whatsapp', simdi(), k.ad, b.id);
      return {};
    },
  },

  // SMS gönderimi dış istek beklediği için işlem (islem) değil ayrı yoldur.
  async yol(c, k, { yontem, yol, govde }) {
    if (yol === '/api/sms-gonder' && yontem === 'POST') {
      if (!c.hak(k, 'kayit') && !c.hak(k, 'tahsilat')) fail('Yetkiniz yok.', 403);
      if (!c.ayar().sms.acik) fail('SMS kapalı. Ayarlar > SMS bölümünden açın.');
      const idler = Array.isArray(govde.idler) ? govde.idler.slice(0, 500) : [];
      for (const id of idler) { const b = c.q1('SELECT sube_id FROM bildirimler WHERE id=?', String(id)); if (b && k.rol !== 'yonetici' && b.sube_id !== k.sube_id) fail('Yetkiniz yok.', 403); }
      const r = await bekleyenleriGonder(c, idler);
      c.olayYayinla(k, k.sube_id, 'duyuru', `${r.gonderilen} SMS gönderildi${r.hata ? `, ${r.hata} gönderilemedi` : ''}`);
      return { durum: 200, veri: r };
    }
    if (yol === '/api/sms-deneme' && yontem === 'POST') {
      if (k.rol !== 'yonetici') fail('Yalnız yönetici.', 403);
      const r = await smsGonder(c, c.ayar().sms, govde.telefon, `${c.q1('SELECT ad FROM kurum')?.ad || 'DC'} deneme mesajı`);
      if (!r.tamam) fail(r.hata);
      return { durum: 200, veri: { tamam: true, not: r.not || '' } };
    }
    return null;
  },

  // Zamanlanmış: her gün ayardaki saatten sonra bir kez hazırlar ve (SMS açıksa) gönderir.
  async zamanli(c) {
    const h = c.ayar().hatirlatma;
    if (!h.acik) return;
    const yz = yerelZaman(c.saatKaynagi());
    if (yz.saat < h.saat) return;
    const son = c.q1("SELECT deger FROM sistem_anahtarlari WHERE ad='hatirlatma_son'")?.deger;
    if (son === yz.tarih) return;
    c.islemde(() => {
      hatirlatmaHazirla(c);
      c.run("INSERT INTO sistem_anahtarlari(ad,deger) VALUES('hatirlatma_son',?) ON CONFLICT(ad) DO UPDATE SET deger=excluded.deger", yz.tarih);
    });
    await bekleyenleriGonder(c);
  },

  ogrenciVeri(c, o, v) {
    v.bildirimler = c.q("SELECT id,tur,metin,olusturma FROM bildirimler WHERE ogrenci_id=? AND durum!='iptal' ORDER BY olusturma DESC LIMIT 10", o.id);
  },
};

export const hatirlatmaAyarDogrula = (d, a) => ({
  acik: !!(d.acik ?? a.acik), saat: saat(d.saat ?? a.saat, true),
  dersGunOnce: tamSayi(d.dersGunOnce ?? a.dersGunOnce, -1, 7, 'Ders hatırlatması'), sinavGunOnce: tamSayi(d.sinavGunOnce ?? a.sinavGunOnce, -1, 14, 'Sınav hatırlatması'),
  taksitGunOnce: tamSayi(d.taksitGunOnce ?? a.taksitGunOnce, -1, 14, 'Taksit hatırlatması'), gecikenHaftalik: !!(d.gecikenHaftalik ?? a.gecikenHaftalik),
  sablonlar: Object.fromEntries(Object.keys(VARSAYILAN_SABLON).map((x) => [x, metin(d.sablonlar?.[x] ?? a.sablonlar?.[x] ?? VARSAYILAN_SABLON[x], 300) || VARSAYILAN_SABLON[x]])),
});
export const smsAyarDogrula = (c, d, a) => {
  const saglayici = d.saglayici ? secim(d.saglayici, ['netgsm', 'deneme'], 'SMS firması') : '';
  if (saglayici === 'deneme' && !c.smsDeneme) fail('Deneme sağlayıcısı yalnız deneme kurumunda kullanılabilir.');
  const sifre = d.sifre && d.sifre !== c.GIZLI ? c.sifre.metinSifrele(metin(d.sifre, 100)) : a.sifre;
  const baslik = metin(d.baslik, 11);
  if (d.acik && !saglayici) fail('SMS firması seçin.');
  if (d.acik && saglayici === 'netgsm' && (!d.kullanici || !sifre || !baslik)) fail('Netgsm için kullanıcı kodu, şifre ve gönderici adı gerekir.');
  return { acik: !!d.acik, saglayici, baslik, kullanici: metin(d.kullanici, 40), sifre };
};
