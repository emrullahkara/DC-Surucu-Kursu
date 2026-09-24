import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp, tcUret, etkinHaklar } from './app.mjs';
import { taksitPlani, hesapDurumu, tcGecerli } from './domain.mjs';

let app, sunucu, adres;
before(async () => {
  app = createApp({ dbPath: ':memory:', demo: true });
  sunucu = createServer(app.handler);
  await new Promise((r) => sunucu.listen(0, r));
  adres = 'http://localhost:' + sunucu.address().port;
});
after(() => { sunucu.close(); app.kapat(); });

async function istek(yol, { govde, cerez = '', basliksiz = false } = {}) {
  const h = { cookie: cerez };
  if (govde !== undefined) { h['content-type'] = 'application/json'; if (!basliksiz) h['x-dc'] = '1'; }
  const r = await fetch(adres + yol, { method: govde === undefined ? 'GET' : 'POST', headers: h, body: govde === undefined ? undefined : JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  return { durum: r.status, j, cerez: (r.headers.get('set-cookie') || '').split(';')[0] };
}
async function gir(kullaniciAdi, kapi) {
  const r = await istek('/api/giris', { govde: { kullaniciAdi, sifre: 'Deneme123!', kapi } });
  assert.equal(r.durum, 200, JSON.stringify(r.j));
  return r.cerez;
}
const islem = (cerez, govde) => istek('/api/islem', { govde, cerez });
const veri = async (cerez) => (await istek('/api/veri', { cerez })).j;

test('hesaplar: taksit planı kuruş artığını son taksite ekler', () => {
  const p = taksitPlani(100000, 10000, 3, '2026-01-31', '2026-01-01');
  assert.deepEqual(p.map((x) => x.tutar), [10000, 30000, 30000, 30000]);
  assert.deepEqual(p.map((x) => x.vade), ['2026-01-01', '2026-01-31', '2026-02-28', '2026-03-31']);
  const q = taksitPlani(1000, 0, 3, '2026-01-10', '2026-01-01');
  assert.equal(q.reduce((a, x) => a + x.tutar, 0), 1000);
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

test('yetki: rol varsayılanları ve verilemeyen personel hakkı', () => {
  assert.equal(etkinHaklar({ rol: 'yonetici' }).length, 8);
  assert.deepEqual(etkinHaklar({ rol: 'egitmen', yetkiler: null }), []);
  assert.ok(!etkinHaklar({ rol: 'buro', yetkiler: '["personel","kayit"]' }).includes('personel'));
});

test('giriş: yanlış kapı, yanlış şifre ve kilit', async () => {
  let r = await istek('/api/giris', { govde: { kullaniciAdi: 'egitmen1', sifre: 'Deneme123!', kapi: 'yonetici' } });
  assert.equal(r.durum, 403);
  r = await istek('/api/giris', { govde: { kullaniciAdi: 'patron', sifre: 'Deneme123!', kapi: 'personel' } });
  assert.equal(r.durum, 403);
  for (let i = 0; i < 5; i++) {
    r = await istek('/api/giris', { govde: { kullaniciAdi: 'buro2', sifre: 'yanlis-sifre', kapi: 'personel' } });
    assert.equal(r.durum, 401);
  }
  r = await istek('/api/giris', { govde: { kullaniciAdi: 'buro2', sifre: 'Deneme123!', kapi: 'personel' } });
  assert.equal(r.durum, 429, 'beş hatadan sonra doğru şifre de kilitli olmalı');
});

test('güvenlik: X-DC başlığı olmayan yazma isteği reddedilir, oturumsuz veri verilmez', async () => {
  const c = await gir('patron', 'yonetici');
  const r = await istek('/api/islem', { govde: { tur: 'sube_ekle', ad: 'X' }, cerez: c, basliksiz: true });
  assert.equal(r.durum, 403);
  assert.equal((await istek('/api/veri')).durum, 401);
});

test('şube kapsamı: şube müdürü ve büro yalnız kendi şubesini görür', async () => {
  const yon = await veri(await gir('patron', 'yonetici'));
  assert.equal(yon.subeler.length, 3);
  assert.equal(yon.ogrenciler.length, 5);
  const mud = await veri(await gir('mudur', 'yonetici'));
  assert.deepEqual(mud.subeler.map((s) => s.id), ['sube-cankaya']);
  assert.ok(mud.ogrenciler.every((o) => o.sube_id === 'sube-cankaya'));
  assert.ok(mud.olaylar.every((o) => o.sube_id === 'sube-cankaya'));
  const buro = await veri(await gir('buro', 'personel'));
  assert.ok(buro.ogrenciler.every((o) => o.sube_id === 'sube-cankaya'));
  assert.equal(buro.giderler, undefined, 'büro varsayılanda kasa göremez');
  assert.ok(buro.odemeler, 'büro tahsilat görür');
});

test('eğitmen: yalnız kendi öğrencileri, para ve kimlik bilgisi gönderilmez', async () => {
  const v = await veri(await gir('egitmen1', 'personel'));
  assert.deepEqual(v.ogrenciler.map((o) => o.id).sort(), ['o1', 'o2']);
  for (const o of v.ogrenciler) {
    assert.equal(o.hesap, undefined);
    assert.equal(o.adres, undefined);
    assert.match(o.tc, /\*{6}/);
  }
  assert.equal(v.odemeler, undefined);
  assert.equal(v.olaylar, undefined);
  assert.ok(v.dersler.every((d) => d.egitmen_id === 'k-egitmen1'));
});

test('şube müdürü başka şubenin öğrencisine dokunamaz', async () => {
  const c = await gir('mudur', 'yonetici');
  const r = await islem(c, { tur: 'odeme_al', ogrenciId: 'o4', tutar: 1000 });
  assert.equal(r.durum, 404);
  const r2 = await islem(c, { tur: 'personel_ekle', ad: 'X', kullaniciAdi: 'xx1', sifre: 'GucluSifre9', rol: 'sube_muduru', subeId: 'sube-cankaya' });
  assert.equal(r2.durum, 403);
  const r3 = await islem(c, { tur: 'personel_ekle', ad: 'X', kullaniciAdi: 'xx2', sifre: 'GucluSifre9', rol: 'egitmen', subeId: 'sube-kecioren' });
  assert.equal(r3.durum, 403);
});

test('sahadan ders: eğitmen tamamlar, merkez canlı bildirim alır, tekrar gönderim çift kayıt yapmaz', async () => {
  const merkez = await gir('patron', 'yonetici');
  const egitmen = await gir('egitmen1', 'personel');
  const ac = new AbortController();
  const akis = await fetch(adres + '/api/canli', { headers: { cookie: merkez }, signal: ac.signal });
  const okuyucu = akis.body.getReader();
  const bekle = (async () => {
    let metin = '';
    while (!metin.includes('event: degisti')) metin += new TextDecoder().decode((await okuyucu.read()).value);
    return metin;
  })();
  const ders = (await veri(egitmen)).dersler.find((d) => d.ogrenci_id === 'o1' && d.durum === 'planli');
  const govde = { tur: 'ders_sonuc', id: ders.id, durum: 'tamamlandi', istekNo: 'saha-1' };
  assert.equal((await islem(egitmen, govde)).durum, 200);
  const gelen = await bekle;
  assert.match(gelen, /dersi tamamlandı/);
  ac.abort();
  assert.equal((await islem(egitmen, govde)).durum, 200, 'aynı istek tekrar gelirse hata vermez');
  const saha = { tur: 'ders_saha', ogrenciId: 'o1', dersTuru: 'direksiyon', istekNo: 'saha-2' };
  await islem(egitmen, saha);
  await islem(egitmen, saha);
  const v = await veri(merkez);
  assert.equal(v.dersler.filter((d) => d.ogrenci_id === 'o1' && d.kaydeden === 'Deniz Eğitmen').length, 1);
  assert.equal(v.ogrenciler.find((o) => o.id === 'o1').dersler.direksiyon, 8);
});

test('eğitmen başkasının dersini sonuçlandıramaz, sonuçlanmış dersi değiştiremez', async () => {
  const c = await gir('egitmen1', 'personel');
  const merkez = await veri(await gir('patron', 'yonetici'));
  const baskasi = merkez.dersler.find((d) => d.egitmen_id === 'k-egitmen2');
  assert.equal((await islem(c, { tur: 'ders_sonuc', id: baskasi.id, durum: 'tamamlandi' })).durum, 404);
  const biten = merkez.dersler.find((d) => d.egitmen_id === 'k-egitmen1' && d.durum === 'tamamlandi');
  assert.equal((await islem(c, { tur: 'ders_sonuc', id: biten.id, durum: 'gelmedi' })).durum, 403);
});

test('kayıt, ödeme ve borç', async () => {
  const c = await gir('buro', 'personel');
  const tc = tcUret('200000001');
  let r = await islem(c, { tur: 'ogrenci_ekle', subeId: 'sube-cankaya', ad: 'Nazlı', soyad: 'Deneme', tc, sinif: 'B', ucret: 1200000, pesinat: 200000, taksitSayisi: 4, ilkVade: '2026-10-15' });
  assert.equal(r.durum, 200, JSON.stringify(r.j));
  const id = r.j.id;
  r = await islem(c, { tur: 'ogrenci_ekle', subeId: 'sube-cankaya', ad: 'Nazlı', soyad: 'Deneme', tc, sinif: 'B' });
  assert.equal(r.durum, 400, 'aynı kişi aynı sınıfa iki kez kayıt olamaz');
  r = await islem(c, { tur: 'ogrenci_ekle', subeId: 'sube-kecioren', ad: 'A', soyad: 'B', tc: tcUret('200000002'), sinif: 'B' });
  assert.equal(r.durum, 403, 'büro başka şubeye kayıt açamaz');
  r = await islem(c, { tur: 'odeme_al', ogrenciId: id, tutar: 2000000 });
  assert.equal(r.durum, 400, 'borçtan fazla ödeme alınmaz');
  r = await islem(c, { tur: 'odeme_al', ogrenciId: id, tutar: 250000, yontem: 'kart' });
  assert.equal(r.durum, 200);
  const o = (await veri(c)).ogrenciler.find((x) => x.id === id);
  assert.equal(o.hesap.odenen, 450000);
  assert.equal(o.hesap.kalan, 750000);
  assert.equal(o.hesap.taksitler.length, 5);
  r = await islem(c, { tur: 'odeme_iptal', id: 'yok', neden: 'x' });
  assert.equal(r.durum, 403, 'büro ödeme iptal edemez (kasa yetkisi yok)');
});

test('sınav kuralları ve öğrenci ekranı', async () => {
  const c = await gir('buro', 'personel');
  let r = await islem(c, { tur: 'sinav_ekle', ogrenciId: 'o3', sinavTuru: 'direksiyon', tarih: '2026-10-01' });
  assert.equal(r.durum, 400, 'e-sınavı geçmeden direksiyona yazılamaz');
  r = await islem(c, { tur: 'sinav_ekle', ogrenciId: 'o3', sinavTuru: 'e_sinav', tarih: '2026-10-01' });
  assert.equal(r.durum, 200);
  r = await islem(c, { tur: 'sinav_sonuc', id: r.j.id, sonuc: 'bekliyor', puan: 75 });
  assert.equal(r.durum, 200);
  const s = (await veri(c)).sinavlar.find((x) => x.ogrenci_id === 'o3');
  assert.equal(s.sonuc, 'gecti');

  const g = await istek('/api/ogrenci-giris', { govde: { tc: tcUret('100000001'), sifre: 'ogrenci1' } });
  assert.equal(g.durum, 200);
  const ov = await istek('/api/ogrenci', { cerez: g.cerez });
  assert.equal(ov.j.ben.ad, 'Hakan');
  assert.equal(ov.j.sinavlar.length, 2);
  assert.equal(ov.j.hesap.ucret, 1500000);
  assert.equal((await istek('/api/veri', { cerez: g.cerez })).durum, 403, 'öğrenci personel verisini alamaz');
  assert.equal((await istek('/api/ogrenci-giris', { govde: { tc: tcUret('100000002'), sifre: 'ogrenci1' } })).durum, 401, 'girişi açılmamış öğrenci giremez');
});

test('rapor: şube müdürü yalnız kendi şubesinin raporunu alır, eğitmen hiç alamaz', async () => {
  const m = await istek('/api/rapor?bas=2026-01-01&bit=2026-12-31', { cerez: await gir('mudur', 'yonetici') });
  assert.equal(m.durum, 200);
  assert.deepEqual(m.j.satirlar.map((x) => x.sube_id), ['sube-cankaya']);
  const y = await istek('/api/rapor?bas=2026-01-01&bit=2026-12-31', { cerez: await gir('patron', 'yonetici') });
  assert.equal(y.j.satirlar.length, 3);
  assert.equal(y.j.toplam.tahsilat, y.j.satirlar.reduce((a, x) => a + x.tahsilat, 0));
  assert.equal((await istek('/api/rapor?bas=2026-01-01&bit=2026-12-31', { cerez: await gir('egitmen1', 'personel') })).durum, 403);
});

test('nakil ve kapatılan şube', async () => {
  const c = await gir('patron', 'yonetici');
  assert.equal((await islem(c, { tur: 'ogrenci_nakil', id: 'o5', subeId: 'sube-kecioren' })).durum, 200);
  const v = await veri(c);
  assert.equal(v.ogrenciler.find((o) => o.id === 'o5').sube_id, 'sube-kecioren');
  assert.equal((await islem(c, { tur: 'sube_duzenle', id: 'sube-merkez', aktif: false })).durum, 400, 'merkez kapatılamaz');
  const egitmen3 = await gir('egitmen3', 'personel');
  assert.equal((await islem(c, { tur: 'sube_duzenle', id: 'sube-kecioren', aktif: false })).durum, 200);
  assert.equal((await istek('/api/veri', { cerez: egitmen3 })).durum, 401, 'kapatılan şubenin personeli dışarıda kalır');
  await islem(c, { tur: 'sube_duzenle', id: 'sube-kecioren', aktif: true });
});
