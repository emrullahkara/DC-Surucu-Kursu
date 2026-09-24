// Sunucu testleri: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { platformAc } from '../server/platform.mjs';
import { etkinHaklar } from '../server/firma.mjs';
import { tcUret, ORNEK } from '../server/ornek.mjs';
import { taksitPlani, hesapDurumu, tcGecerli } from '../server/domain.mjs';

let platform, sunucu, adres;
before(async () => {
  platform = platformAc({ bellekte: true, demo: true });
  sunucu = createServer(platform.handler);
  await new Promise((r) => sunucu.listen(0, r));
  adres = 'http://localhost:' + sunucu.address().port;
});
after(() => { sunucu.closeAllConnections?.(); sunucu.close(); platform.kapat(); });

const gunEkle = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

async function istek(yol, { govde, cerez = '', firma = 'ornek', basliksiz = false } = {}) {
  const h = { cookie: cerez };
  if (firma) h['x-firma'] = firma;
  if (govde !== undefined) { h['content-type'] = 'application/json'; if (!basliksiz) h['x-dc'] = '1'; }
  const r = await fetch(adres + yol, { method: govde === undefined ? 'GET' : 'POST', headers: h, body: govde === undefined ? undefined : JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  return { durum: r.status, j, cerez: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const cerezler = {};
async function gir(kullaniciAdi, kapi, firma = 'ornek', sifre = ORNEK.sifre) {
  const anahtar = `${firma}:${kullaniciAdi}`;
  if (cerezler[anahtar]) return cerezler[anahtar];
  const r = await istek('/api/giris', { govde: { kullaniciAdi, sifre, kapi }, firma });
  assert.equal(r.durum, 200, JSON.stringify(r.j));
  return (cerezler[anahtar] = r.cerez);
}
const islem = (cerez, govde, firma = 'ornek') => istek('/api/islem', { govde, cerez, firma });
const veri = async (cerez, firma = 'ornek') => (await istek('/api/veri', { cerez, firma })).j;
const tamam = (r) => assert.equal(r.durum, 200, JSON.stringify(r.j));

// ---------------------------------------------------------------------------
test('hesaplar: taksit planı kuruş artığını son taksite ekler', () => {
  const p = taksitPlani(100000, 10000, 3, '2026-01-31', '2026-01-01');
  assert.deepEqual(p.map((x) => x.tutar), [10000, 30000, 30000, 30000]);
  assert.deepEqual(p.map((x) => x.vade), ['2026-01-01', '2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(taksitPlani(1000, 0, 3, '2026-01-10', '2026-01-01').reduce((a, x) => a + x.tutar, 0), 1000);
});
test('hesaplar: geciken tutar ve taksit durumu', () => {
  const t = [{ vade: '2026-01-01', tutar: 500 }, { vade: '2026-02-01', tutar: 500 }, { vade: '2026-03-01', tutar: 500 }];
  const h = hesapDurumu(1500, t, 600, '2026-02-15');
  assert.equal(h.kalan, 900);
  assert.equal(h.geciken, 400);
  assert.deepEqual(h.taksitler.map((x) => x.durum), ['odendi', 'gecikti', 'bekliyor']);
});
test('T.C. kimlik doğrulama', () => {
  assert.ok(tcGecerli(tcUret('123456789')));
  assert.ok(!tcGecerli('12345678901'));
  assert.ok(!tcGecerli('01234567890'));
});
test('yetki: rol varsayılanları, personel hakkı verilemez', () => {
  assert.equal(etkinHaklar({ rol: 'yonetici' }).length, 9);
  assert.deepEqual(etkinHaklar({ rol: 'egitmen', yetkiler: null }), []);
  assert.ok(!etkinHaklar({ rol: 'buro', yetkiler: '["personel","kayit"]' }).includes('personel'));
  assert.deepEqual(etkinHaklar({ rol: 'muhasebe' }), ['tahsilat', 'kasa', 'rapor']);
});

// ---------------------------------------------------------------------------
test('platform: firma açılır, firmalar birbirinin bilgisini göremez, lisans biterse giriş kapanır', async () => {
  let r = await istek('/api/platform/giris', { govde: { kullaniciAdi: 'dc', sifre: ORNEK.sifre }, firma: '' });
  tamam(r);
  const pc = r.cerez;
  r = await istek('/api/platform/firma-ac', { cerez: pc, firma: '', govde: { kod: 'Kötü Kod', ad: 'X', lisansBitis: '2099-01-01', yonetici: { ad: 'A', kullaniciAdi: 'aaa', sifre: 'GucluSifre9' } } });
  assert.equal(r.durum, 400, 'Türkçe harf ve boşluklu kod kabul edilmez');
  r = await istek('/api/platform/firma-ac', { cerez: pc, firma: '', govde: { kod: 'ikinci', ad: 'İkinci Kurs', lisansBitis: '2099-01-01', maxSube: 1, yonetici: { ad: 'Zeki Yönetici', kullaniciAdi: 'patron', sifre: 'GucluSifre9' } } });
  tamam(r);
  // Aynı kullanıcı adı iki firmada bağımsızdır; biri diğerinin çerezini kullanamaz.
  const ikinci = await gir('patron', 'yonetici', 'ikinci', 'GucluSifre9');
  const ornek = await gir('patron', 'yonetici');
  assert.equal((await veri(ikinci, 'ikinci')).ogrenciler.length, 0);
  assert.equal((await istek('/api/veri', { cerez: ikinci, firma: 'ornek' })).durum, 401, 'ikinci firmanın çerezi örnek firmada geçmez');
  assert.equal((await istek('/api/veri', { cerez: ornek, firma: 'ikinci' })).durum, 401);
  // Şube sınırı (lisans 1 şube)
  r = await islem(ikinci, { islem: 'sube_ekle', ad: 'Yeni Şube' }, 'ikinci');
  assert.equal(r.durum, 402);
  // Lisans bitince
  tamam(await istek('/api/platform/firma-duzenle', { cerez: pc, firma: '', govde: { kod: 'ikinci', lisansBitis: '2020-01-01' } }));
  r = await istek('/api/veri', { cerez: ikinci, firma: 'ikinci' });
  assert.equal(r.durum, 402);
  assert.match(r.j.hata, /süresi dolmuştur/);
  const f = await istek('/api/firma?firma=ikinci', { firma: '' });
  assert.equal(f.j.lisans, 'bitti');
  // Platform yöneticisi olmayan platform listesini alamaz
  assert.equal((await istek('/api/platform/firmalar', { cerez: ornek, firma: '' })).durum, 401);
});

test('giriş: yanlış kapı, yanlış şifre ve kilit', async () => {
  let r = await istek('/api/giris', { govde: { kullaniciAdi: 'egitmen1', sifre: ORNEK.sifre, kapi: 'yonetici' } });
  assert.equal(r.durum, 403);
  r = await istek('/api/giris', { govde: { kullaniciAdi: 'patron', sifre: ORNEK.sifre, kapi: 'personel' } });
  assert.equal(r.durum, 403);
  for (let i = 0; i < 5; i++) assert.equal((await istek('/api/giris', { govde: { kullaniciAdi: 'buro2', sifre: 'yanlis-sifre', kapi: 'personel' } })).durum, 401);
  r = await istek('/api/giris', { govde: { kullaniciAdi: 'buro2', sifre: ORNEK.sifre, kapi: 'personel' } });
  assert.equal(r.durum, 429, 'beş hatadan sonra doğru şifre de kilitli olmalı');
});

test('güvenlik: X-DC başlığı olmayan yazma isteği reddedilir, oturumsuz veri verilmez', async () => {
  const c = await gir('patron', 'yonetici');
  assert.equal((await istek('/api/islem', { govde: { islem: 'sube_ekle', ad: 'X' }, cerez: c, basliksiz: true })).durum, 403);
  assert.equal((await istek('/api/veri')).durum, 401);
  assert.equal((await istek('/api/veri', { firma: 'olmayan' })).durum, 404);
});

test('şube kapsamı: müdür, büro ve muhasebe yalnız kendi şubesini görür', async () => {
  const yon = await veri(await gir('patron', 'yonetici'));
  assert.equal(yon.subeler.length, 3);
  assert.equal(yon.ogrenciler.length, 18);
  assert.ok(yon.ayarlar, 'yönetici ayarları görür');
  const mud = await veri(await gir('mudur', 'yonetici'));
  assert.deepEqual(mud.subeler.map((s) => s.id), ['sube-cankaya']);
  assert.ok(mud.ogrenciler.length > 0 && mud.ogrenciler.every((o) => o.sube_id === 'sube-cankaya'));
  assert.ok(mud.olaylar.every((o) => o.sube_id === 'sube-cankaya'));
  assert.equal(mud.ayarlar, undefined, 'müdür kurum ayarlarını almaz');
  const buro = await veri(await gir('buro', 'personel'));
  assert.ok(buro.ogrenciler.every((o) => o.sube_id === 'sube-cankaya'));
  assert.equal(buro.giderler, undefined, 'büro varsayılanda kasa göremez');
  assert.ok(buro.odemeler);
  const muh = await veri(await gir('muhasebe', 'personel'));
  assert.ok(muh.giderler && muh.tedarikciler);
  assert.match(muh.ogrenciler[0].tc, /\*{6}/, 'muhasebe kimlik numarasını açık görmez');
});

test('eğitmen: yalnız kendi öğrencileri ve dersleri; para, adres ve kimlik gönderilmez', async () => {
  const yon = await veri(await gir('patron', 'yonetici'));
  const beklenen = yon.ogrenciler.filter((o) => o.egitmen_id === 'k-egitmen1').map((o) => o.id).sort();
  const v = await veri(await gir('egitmen1', 'personel'));
  assert.ok(beklenen.every((id) => v.ogrenciler.some((o) => o.id === id)));
  assert.ok(v.ogrenciler.length < yon.ogrenciler.length);
  for (const o of v.ogrenciler) {
    assert.equal(o.hesap, undefined);
    assert.equal(o.adres, undefined);
    assert.match(o.tc, /\*{6}/);
  }
  assert.equal(v.odemeler, undefined);
  assert.equal(v.olaylar, undefined);
  assert.ok(v.dersler.every((d) => d.egitmen_id === 'k-egitmen1'));
});

test('şube müdürü başka şubenin öğrencisine ve personeline dokunamaz', async () => {
  const c = await gir('mudur', 'yonetici');
  assert.equal((await islem(c, { islem: 'odeme_al', ogrenciId: 'o12', tutar: 1000 })).durum, 404);
  assert.equal((await islem(c, { islem: 'personel_ekle', ad: 'X', kullaniciAdi: 'xx1', sifre: 'GucluSifre9', rol: 'sube_muduru', subeId: 'sube-cankaya' })).durum, 403);
  assert.equal((await islem(c, { islem: 'personel_ekle', ad: 'X', kullaniciAdi: 'xx2', sifre: 'GucluSifre9', rol: 'egitmen', subeId: 'sube-kecioren' })).durum, 403);
  tamam(await islem(c, { islem: 'personel_ekle', ad: 'Yeni Eğitmen', kullaniciAdi: 'yeni.egitmen', sifre: 'GucluSifre9', rol: 'egitmen', subeId: 'sube-cankaya' }));
  assert.equal((await islem(c, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { sinavHakki: 9 } })).durum, 403);
});

test('sahadan ders: eğitmen tamamlar, merkez canlı bildirim alır, tekrar gönderim çift kayıt yapmaz', async () => {
  const merkez = await gir('patron', 'yonetici');
  const egitmen = await gir('egitmen1', 'personel');
  const ac = new AbortController();
  const akis = await fetch(adres + '/api/canli?firma=ornek', { headers: { cookie: merkez }, signal: ac.signal });
  assert.equal(akis.status, 200);
  const okuyucu = akis.body.getReader();
  const bekle = (async () => {
    let metin = '';
    while (!metin.includes('event: degisti')) metin += new TextDecoder().decode((await okuyucu.read()).value);
    return metin;
  })();
  const ev = await veri(egitmen);
  const ders = ev.dersler.find((d) => d.durum === 'planli');
  assert.ok(ders, 'eğitmenin planlı dersi olmalı');
  const govde = { islem: 'ders_sonuc', id: ders.id, durum: 'tamamlandi', istekNo: 'saha-1' };
  tamam(await islem(egitmen, govde));
  assert.match(await bekle, /dersi tamamlandı/);
  ac.abort();
  tamam(await islem(egitmen, govde));
  const ogr = ev.ogrenciler.find((o) => o.egitmen_id === 'k-egitmen1' && o.durum === 'aktif');
  const once = (await veri(merkez)).dersler.filter((d) => d.ogrenci_id === ogr.id && d.durum === 'tamamlandi').length;
  const saha = { islem: 'ders_saha', ogrenciId: ogr.id, dersTuru: 'direksiyon', istekNo: 'saha-2' };
  tamam(await islem(egitmen, saha));
  tamam(await islem(egitmen, saha));
  const sonra = (await veri(merkez)).dersler.filter((d) => d.ogrenci_id === ogr.id && d.durum === 'tamamlandi').length;
  assert.equal(sonra, once + 1, 'aynı istek iki kez gelse de tek ders yazılır');
  // Başka eğitmenin dersine dokunamaz; sonuçlanmış dersi değiştiremez
  const yon = await veri(merkez);
  const baskasi = yon.dersler.find((d) => d.egitmen_id === 'k-egitmen2' && d.durum === 'planli');
  if (baskasi) assert.equal((await islem(egitmen, { islem: 'ders_sonuc', id: baskasi.id, durum: 'tamamlandi' })).durum, 404);
  assert.equal((await islem(egitmen, { islem: 'ders_sonuc', id: ders.id, durum: 'gelmedi' })).durum, 403);
});

test('çakışma: aynı eğitmene üst üste binen saat verilemez', async () => {
  const c = await gir('buro', 'personel');
  const tarih = gunEkle(20);
  tamam(await islem(c, { islem: 'ders_planla', ogrenciId: 'o4', egitmenId: 'k-egitmen1', dersTuru: 'direksiyon', tarih, saat: '10:00', sureDk: 50 }));
  const r = await islem(c, { islem: 'ders_planla', ogrenciId: 'o5', egitmenId: 'k-egitmen1', dersTuru: 'direksiyon', tarih, saat: '10:30', sureDk: 50 });
  assert.equal(r.durum, 400);
  assert.match(r.j.hata, /başka derste/);
});

test('para: kayıt, peşinat, ödeme, iade, indirim, ek kalem ve gün sonu', async () => {
  const buro = await gir('buro', 'personel');
  const muh = await gir('muhasebe', 'personel');
  const tc = tcUret('200000001');
  let r = await islem(buro, { islem: 'ogrenci_ekle', subeId: 'sube-cankaya', ad: 'Nazlı', soyad: 'Deneme', tc, sinif: 'B', ucret: 1200000, pesinat: 200000, taksitSayisi: 4, ilkVade: gunEkle(30) });
  tamam(r);
  const id = r.j.id;
  assert.equal((await islem(buro, { islem: 'ogrenci_ekle', subeId: 'sube-cankaya', ad: 'Nazlı', soyad: 'Deneme', tc, sinif: 'B' })).durum, 400, 'aynı kişi aynı sınıfa iki kez kayıt olamaz');
  assert.equal((await islem(buro, { islem: 'ogrenci_ekle', subeId: 'sube-kecioren', ad: 'A', soyad: 'B', tc: tcUret('200000002'), sinif: 'B' })).durum, 403, 'büro başka şubeye kayıt açamaz');
  assert.equal((await islem(buro, { islem: 'odeme_al', ogrenciId: id, tutar: 2000000 })).durum, 400, 'borçtan fazla ödeme alınmaz');
  r = await islem(buro, { islem: 'odeme_al', ogrenciId: id, tutar: 250000, yontem: 'nakit' });
  tamam(r);
  assert.match(r.j.makbuzNo, /^\d{4}-\d{6}$/);
  assert.equal((await islem(buro, { islem: 'iade', ogrenciId: id, tutar: 1000, aciklama: 'x' })).durum, 403, 'büro iade yapamaz');
  tamam(await islem(buro, { islem: 'ucret_kalemi_ekle', ogrenciId: id, tur: 'ek_ders', tutar: 150000, aciklama: 'Ek ders' }));
  assert.equal((await islem(buro, { islem: 'ucret_kalemi_ekle', ogrenciId: id, tur: 'indirim', tutar: 50000 })).durum, 403, 'büro indirim yapamaz');
  tamam(await islem(muh, { islem: 'ucret_kalemi_ekle', ogrenciId: id, tur: 'indirim', tutar: 50000, aciklama: 'Kardeş indirimi' }));
  tamam(await islem(muh, { islem: 'iade', ogrenciId: id, tutar: 100000, aciklama: 'Fazla ödeme', yontem: 'nakit' }));
  const o = (await veri(muh)).ogrenciler.find((x) => x.id === id);
  assert.equal(o.hesap.ucret, 1200000 + 150000 - 50000);
  assert.equal(o.hesap.odenen, 200000 + 250000 - 100000);
  assert.equal(o.hesap.kalan, 1300000 - 350000);
  // Gün sonu: beklenen nakit bugün girilen nakit hareketlerini içerir
  const b = await istek(`/api/kasa-beklenen?sube=sube-cankaya&tarih=${gunEkle(0)}`, { cerez: muh });
  tamam(b);
  r = await islem(muh, { islem: 'gun_sonu', subeId: 'sube-cankaya', sayilan: b.j.beklenen - 500 });
  tamam(r);
  assert.equal(r.j.fark, -500);
  assert.equal((await islem(muh, { islem: 'gun_sonu', subeId: 'sube-cankaya', sayilan: 0 })).durum, 400, 'aynı gün iki kez kapatılamaz');
});

test('tedarikçi: veresiye gider borç yazar, ödeme borçtan düşer, fazla ödeme girilmez', async () => {
  const muh = await gir('muhasebe', 'personel');
  let r = await islem(muh, { islem: 'tedarikci_ekle', ad: 'Yeni Lastikçi' });
  tamam(r);
  const t = r.j.id;
  tamam(await islem(muh, { islem: 'gider_ekle', subeId: 'sube-cankaya', tutar: 400000, kategori: 'Araç bakım', tedarikciId: t, veresiye: true }));
  assert.equal((await islem(muh, { islem: 'tedarikci_odeme', tedarikciId: t, subeId: 'sube-cankaya', tutar: 500000 })).durum, 400);
  tamam(await islem(muh, { islem: 'tedarikci_odeme', tedarikciId: t, subeId: 'sube-cankaya', tutar: 150000, yontem: 'havale' }));
  const v = await veri(muh);
  assert.equal(v.tedarikciler.find((x) => x.id === t).bakiye, 250000);
});

test('sınav: kurallar, hak, tekrar ücreti ve ayardan değişen geçme puanı', async () => {
  const c = await gir('buro', 'personel');
  const yon = await gir('patron', 'yonetici');
  assert.equal((await islem(c, { islem: 'sinav_ekle', ogrenciId: 'o3', sinavTuru: 'direksiyon', tarih: gunEkle(3) })).durum, 400, 'e-sınavı geçmeden direksiyona yazılamaz');
  let r = await islem(c, { islem: 'sinav_ekle', ogrenciId: 'o3', sinavTuru: 'e_sinav', tarih: gunEkle(3) });
  tamam(r);
  tamam(await islem(yon, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { eSinavGecme: 80 } }));
  tamam(await islem(c, { islem: 'sinav_sonuc', id: r.j.id, sonuc: 'bekliyor', puan: 75 }));
  let s = (await veri(c)).sinavlar.find((x) => x.id === r.j.id);
  assert.equal(s.sonuc, 'kaldi', '80 geçme puanında 75 kalır');
  const once = (await veri(c)).ogrenciler.find((o) => o.id === 'o3').hesap.ucret;
  r = await islem(c, { islem: 'sinav_ekle', ogrenciId: 'o3', sinavTuru: 'e_sinav', tarih: gunEkle(10) });
  tamam(r);
  const sonra = (await veri(c)).ogrenciler.find((o) => o.id === 'o3').hesap.ucret;
  assert.equal(sonra - once, 100000, '2. hakta sınav tekrar ücreti borca eklenir');
  tamam(await islem(c, { islem: 'sinav_sonuc', id: r.j.id, sonuc: 'bekliyor', puan: 85 }));
  s = (await veri(c)).sinavlar.find((x) => x.id === r.j.id);
  assert.equal(s.sonuc, 'gecti');
  tamam(await islem(yon, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { eSinavGecme: 70 } }));
});

test('ek ders: paket sayısını aşan tamamlanan direksiyon dersinde ücret otomatik eklenir', async () => {
  const yon = await gir('patron', 'yonetici');
  const v = await veri(yon);
  const o = v.ogrenciler.find((x) => x.id === 'o2');
  const gerekli = v.tanimlar.siniflar[o.sinif].direksiyon;
  assert.ok(o.dersler.direksiyon >= gerekli, 'örnek öğrenci paketini bitirmiş olmalı');
  const once = o.hesap.ucret;
  tamam(await islem(yon, { islem: 'ders_saha', ogrenciId: 'o2', dersTuru: 'direksiyon' }));
  const sonra = (await veri(yon)).ogrenciler.find((x) => x.id === 'o2').hesap.ucret;
  assert.equal(sonra - once, 150000);
});

test('öğrenci: ilk girişte şifre değiştirmeden işlem yapamaz, boş saatten ders seçer ve bırakır', async () => {
  const buro = await gir('buro', 'personel');
  tamam(await islem(buro, { islem: 'ogrenci_portal', id: 'o4', sifre: 'kurs123' }));
  const ov = await veri(await gir('patron', 'yonetici'));
  const tc = ov.ogrenciler.find((o) => o.id === 'o4').tc;
  let g = await istek('/api/ogrenci-giris', { govde: { tc, sifre: 'kurs123' } });
  tamam(g);
  const oc = g.cerez;
  let r = await istek('/api/ogrenci', { cerez: oc });
  assert.equal(r.j.ben.sifreDegismeli, true);
  const tarih = gunEkle(3);
  r = await istek('/api/ogrenci-islem', { cerez: oc, govde: { islem: 'ders_sec', tarih, saat: '09:00' } });
  assert.equal(r.durum, 403, 'geçici şifreyle işlem yapılamaz');
  tamam(await istek('/api/ogrenci-islem', { cerez: oc, govde: { islem: 'ogrenci_sifre', eskiSifre: 'kurs123', yeniSifre: 'benimsifrem' } }));
  const bos = await istek(`/api/bos-saatler?tarih=${tarih}`, { cerez: oc });
  tamam(bos);
  assert.ok(bos.j.saatler.length > 0);
  r = await istek('/api/ogrenci-islem', { cerez: oc, govde: { islem: 'ders_sec', tarih, saat: bos.j.saatler[0] } });
  tamam(r);
  const bos2 = await istek(`/api/bos-saatler?tarih=${tarih}`, { cerez: oc });
  assert.ok(!bos2.j.saatler.includes(bos.j.saatler[0]), 'seçilen saat artık boş görünmez');
  assert.equal((await istek('/api/ogrenci-islem', { cerez: oc, govde: { islem: 'ders_sec', tarih: gunEkle(40), saat: '09:00' } })).durum, 400, 'çok ileri tarih seçilemez');
  tamam(await istek('/api/ogrenci-islem', { cerez: oc, govde: { islem: 'ders_birak', id: r.j.id } }));
  // Öğrenci personel verisini alamaz; başka öğrenci giremez
  assert.equal((await istek('/api/veri', { cerez: oc })).durum, 403);
  g = await istek('/api/ogrenci-giris', { govde: { tc: ORNEK.ogrenciTc, sifre: ORNEK.ogrenciSifre } });
  tamam(g);
  r = await istek('/api/ogrenci', { cerez: g.cerez });
  assert.equal(r.j.ben.ad, 'Hakan');
  assert.ok(r.j.sinavlar.length >= 2);
  assert.ok(r.j.teorikDersler.length > 0);
});

test('görevlendirme: eğitmen başka şubede yalnız görevlendirildiği tarihlerde ders verir', async () => {
  const yon = await gir('patron', 'yonetici');
  const tarih = gunEkle(5);
  let r = await islem(yon, { islem: 'ders_planla', ogrenciId: 'o12', egitmenId: 'k-egitmen1', dersTuru: 'direksiyon', tarih, saat: '17:00' });
  assert.equal(r.durum, 400);
  assert.match(r.j.hata, /görevlendirme/);
  tamam(await islem(yon, { islem: 'gorevlendir', kullaniciId: 'k-egitmen1', subeId: 'sube-kecioren', bas: gunEkle(4), bit: gunEkle(6) }));
  tamam(await islem(yon, { islem: 'ders_planla', ogrenciId: 'o12', egitmenId: 'k-egitmen1', dersTuru: 'direksiyon', tarih, saat: '17:00' }));
  const ev = await veri(await gir('egitmen1', 'personel'));
  assert.ok(ev.dersler.some((d) => d.ogrenci_id === 'o12' && d.tarih === tarih), 'eğitmen görevli olduğu şubedeki dersini görür');
  assert.equal((await islem(await gir('mudur', 'yonetici'), { islem: 'gorevlendir', kullaniciId: 'k-egitmen2', subeId: 'sube-kecioren', bas: tarih, bit: tarih })).durum, 403);
});

test('teorik yoklama: gelen öğrencinin teorik sayacı ders saati kadar artar', async () => {
  const eg = await gir('egitmen2', 'personel');
  const v = await veri(eg);
  const oturum = v.teorikOturumlar.find((o) => o.durum === 'planli');
  assert.ok(oturum);
  const grup = v.teorikGruplar.find((g) => g.id === oturum.grup_id);
  const yon = await gir('patron', 'yonetici');
  const once = (await veri(yon)).ogrenciler.find((o) => o.id === grup.uyeler[0]).dersler.teorik;
  tamam(await islem(eg, { islem: 'yoklama_kaydet', oturumId: oturum.id, liste: grup.uyeler.map((id, i) => ({ ogrenciId: id, durum: i === 0 ? 'geldi' : 'gelmedi' })) }));
  const sonra = (await veri(yon)).ogrenciler.find((o) => o.id === grup.uyeler[0]).dersler.teorik;
  assert.equal(sonra - once, oturum.ders_saati);
  assert.equal((await islem(await gir('egitmen1', 'personel'), { islem: 'yoklama_kaydet', oturumId: oturum.id, liste: [] })).durum, 403, 'başka eğitmen yoklama alamaz');
});

test('rapor: müdür kendi şubesini, yönetici hepsini alır; eğitmen alamaz; prim hesaplanır', async () => {
  const bas = gunEkle(-120), bit = gunEkle(30);
  const m = await istek(`/api/rapor?bas=${bas}&bit=${bit}`, { cerez: await gir('mudur', 'yonetici') });
  tamam(m);
  assert.deepEqual(m.j.satirlar.map((x) => x.sube_id), ['sube-cankaya']);
  const y = await istek(`/api/rapor?bas=${bas}&bit=${bit}`, { cerez: await gir('patron', 'yonetici') });
  assert.equal(y.j.satirlar.length, 3);
  assert.equal(y.j.toplam.tahsilat, y.j.satirlar.reduce((a, x) => a + x.tahsilat, 0));
  const e = y.j.egitmenler.find((x) => x.direksiyon > 0);
  assert.equal(e.prim, e.direksiyon * 20000 + e.teorik * 10000);
  assert.equal((await istek(`/api/rapor?bas=${bas}&bit=${bit}`, { cerez: await gir('egitmen1', 'personel') })).durum, 403);
});

test('ayar: yalnız yönetici; aktif öğrencisi olan sınıf silinemez', async () => {
  const yon = await gir('patron', 'yonetici');
  const v = await veri(yon);
  const yeni = { ...v.ayarlar.siniflar };
  delete yeni.B;
  assert.equal((await islem(yon, { islem: 'ayar_kaydet', bolum: 'siniflar', deger: yeni })).durum, 400);
  tamam(await islem(yon, { islem: 'ayar_kaydet', bolum: 'siniflar', deger: { ...v.ayarlar.siniflar, B: { ad: 'B (Otomobil)', teorik: 34, direksiyon: 16 } } }));
  assert.equal((await veri(yon)).tanimlar.siniflar.B.direksiyon, 16);
  tamam(await islem(yon, { islem: 'ayar_kaydet', bolum: 'siniflar', deger: v.ayarlar.siniflar }));
});

test('nakil ve kapatılan şube', async () => {
  const c = await gir('patron', 'yonetici');
  tamam(await islem(c, { islem: 'ogrenci_nakil', id: 'o17', subeId: 'sube-kecioren' }));
  assert.equal((await veri(c)).ogrenciler.find((o) => o.id === 'o17').sube_id, 'sube-kecioren');
  assert.equal((await islem(c, { islem: 'sube_duzenle', id: 'sube-merkez', aktif: false })).durum, 400, 'merkez kapatılamaz');
  const egitmen3 = await gir('egitmen3', 'personel');
  tamam(await islem(c, { islem: 'sube_duzenle', id: 'sube-kecioren', aktif: false }));
  assert.equal((await istek('/api/veri', { cerez: egitmen3 })).durum, 401, 'kapatılan şubenin personeli dışarıda kalır');
  tamam(await islem(c, { islem: 'sube_duzenle', id: 'sube-kecioren', aktif: true }));
  delete cerezler['ornek:egitmen3'];
});

test('evrak: yükleme, eksik listesi, yetkisiz erişim ve öğrencinin gördüğü eksikler', async () => {
  const buro = await gir('buro', 'personel');
  let v = await veri(buro);
  const o = v.ogrenciler.find((x) => x.id === 'o1');
  assert.equal(o.evrak.eksik.length, 4);
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  let r = await islem(buro, { islem: 'evrak_yukle', ogrenciId: 'o1', tur: 'Sağlık raporu', ad: 'rapor.png', veri: png });
  tamam(r);
  assert.equal((await islem(buro, { islem: 'evrak_yukle', ogrenciId: 'o1', tur: 'X', veri: 'data:text/html;base64,PGh0bWw+' })).durum, 400, 'resim/PDF olmayan dosya reddedilir');
  v = await veri(buro);
  assert.ok(v.ogrenciler.find((x) => x.id === 'o1').evrak.tamam.includes('Sağlık raporu'));
  const dosya = await fetch(`${adres}/api/evrak?id=${r.j.id}`, { headers: { cookie: buro, 'x-firma': 'ornek' } });
  assert.equal(dosya.status, 200);
  assert.equal(dosya.headers.get('content-type'), 'image/png');
  assert.equal((await istek(`/api/evrak?id=${r.j.id}`, { cerez: await gir('egitmen1', 'personel') })).durum, 403, 'eğitmen evrak göremez');
  assert.equal((await istek(`/api/evrak?id=${r.j.id}`, { cerez: await gir('mudur2', 'yonetici') })).durum, 404, 'başka şubenin müdürü göremez');
  const g = await istek('/api/ogrenci-giris', { govde: { tc: ORNEK.ogrenciTc, sifre: ORNEK.ogrenciSifre } });
  const ov = await istek('/api/ogrenci', { cerez: g.cerez });
  assert.ok(!ov.j.evrak.eksik.includes('Sağlık raporu'));
  assert.equal(ov.j.evrak.eksik.length, 3);
});

test('duyuru: şube duyurusu yalnız o şubenin öğrencisine görünür', async () => {
  const mud = await gir('mudur2', 'yonetici');
  tamam(await islem(mud, { islem: 'duyuru_ekle', baslik: 'Keçiören sınav günü', metin: 'Yarın sınav var.', subeId: 'sube-cankaya' }));
  const g = await istek('/api/ogrenci-giris', { govde: { tc: ORNEK.ogrenciTc, sifre: ORNEK.ogrenciSifre } });
  let ov = await istek('/api/ogrenci', { cerez: g.cerez });
  assert.ok(!ov.j.duyurular.some((d) => d.baslik === 'Keçiören sınav günü'), 'müdür şubeyi değiştiremez; Çankaya öğrencisi görmez');
  tamam(await islem(await gir('patron', 'yonetici'), { islem: 'duyuru_ekle', baslik: 'Bayram tatili', metin: 'Kurs kapalıdır.' }));
  ov = await istek('/api/ogrenci', { cerez: g.cerez });
  assert.ok(ov.j.duyurular.some((d) => d.baslik === 'Bayram tatili'));
});

test('araç ve personel: takip tarihleri, belge, izinli eğitmene ders planlanamaz', async () => {
  const mud = await gir('mudur', 'yonetici');
  tamam(await islem(mud, { islem: 'arac_duzenle', id: 'a1', km: 61000, muayene: gunEkle(3), bakimKm: 62000 }));
  let v = await veri(mud);
  const a = v.araclar.find((x) => x.id === 'a1');
  assert.equal(a.km, 61000);
  assert.equal(a.muayene, gunEkle(3));
  assert.ok(v.personelBelgeleri.some((b) => b.kullanici_id === 'k-egitmen1'));
  assert.equal((await islem(mud, { islem: 'izin_ekle', kullaniciId: 'k-egitmen3', tur: 'Rapor', bas: gunEkle(1), bit: gunEkle(2) })).durum, 404, 'başka şubenin personeline izin girilemez');
  const r = await islem(mud, { islem: 'izin_ekle', kullaniciId: 'k-egitmen2', tur: 'Rapor', bas: gunEkle(30), bit: gunEkle(31) });
  tamam(r);
  const d = await islem(mud, { islem: 'ders_planla', ogrenciId: 'o5', egitmenId: 'k-egitmen2', dersTuru: 'direksiyon', tarih: gunEkle(30), saat: '12:00' });
  assert.equal(d.durum, 400);
  assert.match(d.j.hata, /izinli/);
  assert.equal((await islem(await gir('buro', 'personel'), { islem: 'personel_belge_ekle', kullaniciId: 'k-egitmen1', tur: 'X' })).durum, 403);
});
