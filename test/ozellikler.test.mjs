// İkinci aşama özelliklerinin testleri: npm test
// (Kendi örnek kurumuyla çalışır; ilk test dosyasının verisine dokunmaz.)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformAc } from '../server/platform.mjs';
import { tcUret, ORNEK } from '../server/ornek.mjs';
import { bugun } from '../server/domain.mjs';
import { totpUret } from '../server/moduller/guvenlik.mjs';
import { cepNo } from '../server/moduller/hatirlatma.mjs';
import { resitDegil } from '../server/moduller/ogrenci.mjs';

let platform, sunucu, adres, dizin;
before(async () => {
  // Yedek testleri için gerçek bir veri klasörü; vekil adresine güvenilir (farklı IP denemeleri için).
  dizin = mkdtempSync(join(tmpdir(), 'dc-test-'));
  platform = platformAc({ veriDizini: dizin, demo: true, vekilGuvenilir: true, yedekGunu: 30 });
  sunucu = createServer(platform.handler);
  await new Promise((r) => sunucu.listen(0, r));
  adres = 'http://localhost:' + sunucu.address().port;
});
after(() => { sunucu.closeAllConnections?.(); sunucu.close(); platform.kapat(); rmSync(dizin, { recursive: true, force: true }); });

const gunEkle = (n) => { const d = new Date(bugun() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function istek(yol, { govde, cerez = '', firma = 'ornek', ip = '10.0.0.1', ham = false } = {}) {
  const h = { cookie: cerez, 'x-forwarded-for': ip };
  if (firma) h['x-firma'] = firma;
  if (govde !== undefined) { h['content-type'] = 'application/json'; h['x-dc'] = '1'; }
  const r = await fetch(adres + yol, { method: govde === undefined ? 'GET' : 'POST', headers: h, body: govde === undefined ? undefined : JSON.stringify(govde) });
  if (ham) return r;
  const j = await r.json().catch(() => ({}));
  return { durum: r.status, j, cerez: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const cerezler = {};
async function gir(kullaniciAdi, kapi, sifre = ORNEK.sifre) {
  if (cerezler[kullaniciAdi]) return cerezler[kullaniciAdi];
  const r = await istek('/api/giris', { govde: { kullaniciAdi, sifre, kapi } });
  assert.equal(r.durum, 200, JSON.stringify(r.j));
  return (cerezler[kullaniciAdi] = r.cerez);
}
const islem = (cerez, govde) => istek('/api/islem', { govde, cerez });
const veri = async (cerez) => (await istek('/api/veri', { cerez })).j;
const tamam = (r) => assert.equal(r.durum, 200, JSON.stringify(r.j));
const yon = () => gir('patron', 'yonetici');

// ---------------------------------------------------------------------------
test('yardımcılar: cep numarası ve 18 yaş hesabı', () => {
  assert.equal(cepNo('0532 111 22 33'), '5321112233');
  assert.equal(cepNo('+90 532 111 22 33'), '5321112233');
  assert.equal(cepNo('0312 000 00 00'), '');
  assert.ok(resitDegil('2010-05-01', '2026-01-01'));
  assert.ok(!resitDegil('2000-05-01', '2026-01-01'));
  assert.ok(!resitDegil('2008-01-01', '2026-01-01'), '18. doğum günü kayıt günü: reşit');
});

test('giriş sınırı: başka yerden yapılan hatalı denemeler öğrenciyi kilitlemez; aynı yerden 5 hata kilitler', async () => {
  const tc = ORNEK.ogrenciTc;
  for (let i = 0; i < 5; i++) assert.equal((await istek('/api/ogrenci-giris', { govde: { tc, sifre: 'yanlis' + i }, ip: '10.9.9.9' })).durum, 401);
  assert.equal((await istek('/api/ogrenci-giris', { govde: { tc, sifre: ORNEK.ogrenciSifre }, ip: '10.9.9.9' })).durum, 429, 'saldırganın yeri kilitli');
  tamam(await istek('/api/ogrenci-giris', { govde: { tc, sifre: ORNEK.ogrenciSifre }, ip: '10.1.1.1' }));
  // Aynı yerden birçok kullanıcı adı denenirse yer kilitlenir.
  for (let i = 0; i < 30; i++) await istek('/api/giris', { govde: { kullaniciAdi: 'yok' + i, sifre: 'x', kapi: 'personel' }, ip: '10.7.7.7' });
  assert.equal((await istek('/api/giris', { govde: { kullaniciAdi: 'buro', sifre: ORNEK.sifre, kapi: 'personel' }, ip: '10.7.7.7' })).durum, 429);
});

test('canlı akış: girişi kapatılan personelin akışı kesilir', async () => {
  const y = await yon();
  const r = await istek('/api/giris', { govde: { kullaniciAdi: 'egitmen2', sifre: ORNEK.sifre, kapi: 'personel' } });
  const eg = r.cerez;
  const akis = await fetch(adres + '/api/canli?firma=ornek', { headers: { cookie: eg } });
  const okuyucu = akis.body.getReader();
  await okuyucu.read();
  tamam(await islem(y, { islem: 'personel_duzenle', id: 'k-egitmen2', aktif: false }));
  // Sonraki olayda sunucu akışı kapatır.
  tamam(await islem(y, { islem: 'duyuru_ekle', baslik: 'x', metin: 'y' }));
  let bitti = false;
  for (let i = 0; i < 5 && !bitti; i++) bitti = (await okuyucu.read()).done;
  assert.ok(bitti, 'akış kapandı');
  tamam(await islem(y, { islem: 'personel_duzenle', id: 'k-egitmen2', aktif: true }));
});

test('sınav: girmeyenin hakkı yanar; yanlışlıkla girilen "geçti" düzeltilince öğrenci yeniden aktif olur', async () => {
  const b = await gir('buro', 'personel');
  const y = await yon();
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { sinavHakki: 2 } }));
  let r = await islem(b, { islem: 'sinav_ekle', ogrenciId: 'o6', sinavTuru: 'e_sinav', tarih: gunEkle(-5) });
  tamam(r);
  tamam(await islem(b, { islem: 'sinav_sonuc', id: r.j.id, sonuc: 'girmedi' }));
  r = await islem(b, { islem: 'sinav_ekle', ogrenciId: 'o6', sinavTuru: 'e_sinav', tarih: gunEkle(-2) });
  tamam(r);
  assert.equal((await veri(b)).sinavlar.find((s) => s.id === r.j.id).deneme, 2, 'girmediği sınav hak sayılır');
  tamam(await islem(b, { islem: 'sinav_sonuc', id: r.j.id, sonuc: 'girmedi' }));
  assert.equal((await islem(b, { islem: 'sinav_ekle', ogrenciId: 'o6', sinavTuru: 'e_sinav', tarih: gunEkle(3) })).durum, 400, 'hak doldu');
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { sinavHakki: 4 } }));
  // o2: e-sınavı geçmiş, direksiyon sınavı bekliyor.
  const s = (await veri(b)).sinavlar.find((x) => x.ogrenci_id === 'o2' && x.tur === 'direksiyon');
  tamam(await islem(b, { islem: 'sinav_sonuc', id: s.id, sonuc: 'gecti' }));
  assert.equal((await veri(b)).ogrenciler.find((o) => o.id === 'o2').durum, 'tamamlandi');
  tamam(await islem(b, { islem: 'sinav_sonuc', id: s.id, sonuc: 'bekliyor' }));
  assert.equal((await veri(b)).ogrenciler.find((o) => o.id === 'o2').durum, 'aktif', 'düzeltme öğrenciyi geri açar');
});

test('yoklama gelecekteki ders için alınamaz; kayıt "tamamlandı" yapılınca planlı dersler iptal olur', async () => {
  const y = await yon();
  const r = await islem(y, { islem: 'oturum_planla', grupId: 'g-cankaya', tarih: gunEkle(3), saat: '18:00', dersSaati: 2, konu: 'Trafik ve Çevre' });
  tamam(r);
  assert.equal((await islem(y, { islem: 'yoklama_kaydet', oturumId: r.j.id, liste: [] })).durum, 400);
  const d = (await veri(y)).dersler.find((x) => x.durum === 'planli' && x.ogrenci_id === 'o4');
  if (d) {
    tamam(await islem(y, { islem: 'ogrenci_durum', id: 'o4', durum: 'tamamlandi' }));
    assert.equal((await veri(y)).dersler.find((x) => x.id === d.id).durum, 'iptal');
    tamam(await islem(y, { islem: 'ogrenci_durum', id: 'o4', durum: 'aktif' }));
  }
});

test('makbuz: şube serisi seçilince numara şube koduyla başlar', async () => {
  const y = await yon();
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'makbuz', deger: { seri: 'sube' } }));
  const b = await gir('buro', 'personel');
  let r = await islem(b, { islem: 'odeme_al', ogrenciId: 'o5', tutar: 100, yontem: 'kart' });
  tamam(r);
  assert.match(r.j.makbuzNo, /^CNK-\d{4}-000001$/);
  r = await islem(b, { islem: 'odeme_al', ogrenciId: 'o5', tutar: 100, yontem: 'kart' });
  assert.match(r.j.makbuzNo, /^CNK-\d{4}-000002$/);
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'makbuz', deger: { seri: 'kurum' } }));
});

test('araç arızası: arızalı araca ders verilmez; dersler toplu aktarılır; eğitmen km girer; günlük ders sınırı', async () => {
  const y = await yon();
  const yarin = gunEkle(1);
  // a1 (Çankaya) için yarın planlı dersler varsa arıza bildirimi bunları sayar.
  let r = await islem(y, { islem: 'arac_ariza', id: 'a1', aciklama: 'Debriyaj arızası', bas: yarin, bit: gunEkle(3) });
  tamam(r);
  const o = (await veri(y)).ogrenciler.find((x) => x.sube_id === 'sube-cankaya' && x.durum === 'aktif' && x.egitmen_id);
  assert.equal((await islem(y, { islem: 'ders_planla', ogrenciId: o.id, dersTuru: 'direksiyon', egitmenId: o.egitmen_id, aracId: 'a1', tarih: yarin, saat: '07:00' })).durum, 400, 'arızalı araç');
  r = await islem(y, { islem: 'ders_toplu_aktar', bas: yarin, bit: gunEkle(3), kaynakAracId: 'a1', hedefAracId: 'a2' });
  tamam(r);
  assert.equal((await veri(y)).dersler.filter((d) => d.arac_id === 'a1' && d.durum === 'planli' && d.tarih >= yarin && d.tarih <= gunEkle(3)).length, r.j.atlanan.length);
  tamam(await islem(y, { islem: 'arac_ariza', id: 'a1', bitir: true }));
  // Eğitmen, derste kullandığı / şubesindeki aracın km'sini girer; geriye düşük km giremez.
  const eg = await gir('egitmen1', 'personel');
  tamam(await islem(eg, { islem: 'arac_km', id: 'a1', km: 99999 }));
  assert.equal((await islem(eg, { islem: 'arac_km', id: 'a1', km: 1000 })).durum, 400);
  assert.equal((await islem(eg, { islem: 'arac_km', id: 'a6', km: 1000 })).durum, 403, 'başka şubenin aracı');
  // Günlük sınır: 1 yapılınca aynı eğitmene ikinci direksiyon dersi planlanamaz.
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { egitmenGunlukDers: 1 } }));
  const gun = gunEkle(20);
  tamam(await islem(y, { islem: 'ders_planla', ogrenciId: o.id, dersTuru: 'direksiyon', egitmenId: o.egitmen_id, tarih: gun, saat: '09:00' }));
  const o2 = (await veri(y)).ogrenciler.find((x) => x.id !== o.id && x.egitmen_id === o.egitmen_id && x.durum === 'aktif');
  assert.equal((await islem(y, { islem: 'ders_planla', ogrenciId: o2.id, dersTuru: 'direksiyon', egitmenId: o.egitmen_id, tarih: gun, saat: '11:00' })).durum, 400);
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'kurallar', deger: { egitmenGunlukDers: 8 } }));
  // Ders taşıma
  const d = (await veri(y)).dersler.find((x) => x.tarih === gun && x.ogrenci_id === o.id);
  tamam(await islem(y, { islem: 'ders_tasi', id: d.id, tarih: gunEkle(21), saat: '10:00' }));
  assert.equal((await veri(y)).dersler.find((x) => x.id === d.id).tarih, gunEkle(21));
});

test('kayıt: 18 yaş altı adayda veli zorunlu; kişisel veri onayı ve kaynak saklanır; değişen alanlar kayıt defterine yazılır', async () => {
  const b = await gir('buro', 'personel');
  const g = { islem: 'ogrenci_ekle', subeId: 'sube-cankaya', ad: 'Genç', soyad: 'Deneme', tc: tcUret('300000011'), sinif: 'A1', dogum: gunEkle(-365 * 17), kaynak: 'Sosyal medya', kvkkOnay: true };
  assert.equal((await islem(b, g)).durum, 400);
  const r = await islem(b, { ...g, veliAd: 'Veli Deneme', veliTelefon: '0532 000 00 00', veliYakinlik: 'Anne' });
  tamam(r);
  let o = (await veri(b)).ogrenciler.find((x) => x.id === r.j.id);
  assert.equal(o.kaynak, 'Sosyal medya');
  assert.ok(o.kvkk);
  assert.equal(o.veli_ad, 'Veli Deneme');
  tamam(await islem(b, { islem: 'ogrenci_duzenle', id: r.j.id, telefon: '0532 999 99 99' }));
  const v = await veri(await yon());
  assert.ok(v.olaylar.some((x) => /telefon: - → 0532 999 99 99/.test(x.metin)), 'eski ve yeni değer');
});

test('Excel aktarımı: doğru satırlar kaydedilir, hatalı satırlar nedeniyle döner, eski ödeme devir olarak girer', async () => {
  const b = await gir('buro', 'personel');
  const r = await islem(b, { islem: 'ogrenci_toplu_ekle', subeId: 'sube-cankaya', satirlar: [
    { satirNo: 2, ad: 'Aktarım', soyad: 'Bir', tc: tcUret('400000001'), sinif: 'B', ucret: 1500000, odenen: 500000, taksitSayisi: 2 },
    { satirNo: 3, ad: 'Aktarım', soyad: 'İki', tc: '12345678901', sinif: 'B' },
    { satirNo: 4, ad: 'Aktarım', soyad: 'Üç', tc: tcUret('400000003'), sinif: 'XX' },
  ] });
  tamam(r);
  assert.equal(r.j.eklenen, 1);
  assert.deepEqual(r.j.hatalar.map((x) => x.satir), [3, 4]);
  const o = (await veri(b)).ogrenciler.find((x) => x.soyad === 'Bir' && x.ad === 'Aktarım');
  assert.equal(o.hesap.odenen, 500000);
  assert.equal(o.hesap.kalan, 1000000);
  // Devir ödemesi dönemin tahsilatı sayılmaz.
  const rp = await istek(`/api/rapor?bas=${gunEkle(-1)}&bit=${gunEkle(1)}`, { cerez: await yon() });
  const devirDahil = (await veri(await yon())).odemeler.filter((x) => x.yontem === 'devir').length;
  assert.ok(devirDahil >= 1);
  assert.ok(!Object.keys(rp.j.toplam.yontemler).includes('devir'));
});

test('kişisel veri: döküm, erişim kaydı, şifreli evrak, anonimleştirme', async () => {
  const y = await yon();
  const b = await gir('buro', 'personel');
  // Evrak şifreli saklanır, açılınca aynı dosya gelir.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e000503020166c0ad5b0000000049454e44ae426082', 'hex');
  let r = await islem(b, { islem: 'evrak_yukle', ogrenciId: 'o7', tur: 'Kimlik fotokopisi', veri: 'data:image/png;base64,' + png.toString('base64') });
  tamam(r);
  const ham = platform.firmaMotoru('ornek').ctx.q1('SELECT veri FROM evrak_dosyalari WHERE evrak_id=?', r.j.id).veri;
  assert.ok(!Buffer.from(ham).includes(png.subarray(0, 8)), 'veritabanında açık değil');
  const ac = await istek(`/api/evrak?id=${r.j.id}`, { cerez: b, ham: true });
  assert.deepEqual(Buffer.from(await ac.arrayBuffer()), png);
  // Döküm ve erişim kaydı
  const d = await istek('/api/kisisel-veri?id=o7', { cerez: y, ham: true });
  assert.equal(d.status, 200);
  const dj = await d.json();
  assert.equal(dj.kimlik.ad, (await veri(y)).ogrenciler.find((x) => x.id === 'o7').ad);
  const ek = await istek('/api/erisim-kaydi?id=o7', { cerez: y });
  assert.ok(ek.j.kayitlar.some((x) => x.tur === 'evrak') && ek.j.kayitlar.some((x) => x.tur === 'dokum'));
  assert.equal((await istek('/api/kisisel-veri?id=o7', { cerez: await gir('egitmen1', 'personel') })).durum, 403);
  // Anonimleştirme: aktif kayıt yapılamaz; iptal edilene yapılır.
  assert.equal((await islem(y, { islem: 'ogrenci_anonimlestir', id: 'o7', onay: 'SİL' })).durum, 400);
  tamam(await islem(y, { islem: 'ogrenci_durum', id: 'o7', durum: 'iptal' }));
  assert.equal((await islem(y, { islem: 'ogrenci_anonimlestir', id: 'o7', onay: 'sil' })).durum, 400, 'onay yazısı');
  tamam(await islem(y, { islem: 'ogrenci_anonimlestir', id: 'o7', onay: 'SİL' }));
  const o = (await veri(y)).ogrenciler.find((x) => x.id === 'o7');
  assert.equal(o.ad, 'Anonim');
  assert.equal(o.tc, '');
  assert.ok(o.anonim);
  assert.ok(!(await veri(y)).evraklar.some((e) => e.ogrenci_id === 'o7'));
});

test('fatura listesi: KDV ayrılır, kesilen fatura işlenir, kimlik yalnız hassas yetkisiyle', async () => {
  const m = await gir('muhasebe', 'personel');
  let r = await istek(`/api/fatura-listesi?bas=${gunEkle(-90)}&bit=${gunEkle(1)}&durum=kesilmemis`, { cerez: m });
  tamam(r);
  const x = r.j.liste.find((z) => z.tutar > 0);
  assert.equal(x.matrah + x.kdv, x.tutar);
  assert.equal(x.matrah, Math.round(x.tutar / 1.2));
  assert.match(x.tc, /\*/, 'muhasebe hassas yetkisi olmadan kimlik maskeli');
  tamam(await islem(m, { islem: 'fatura_isaretle', idler: [x.id], faturaNo: 'EAR2026000001' }));
  r = await istek(`/api/fatura-listesi?bas=${gunEkle(-90)}&bit=${gunEkle(1)}&durum=kesilmis`, { cerez: m });
  assert.ok(r.j.liste.some((z) => z.id === x.id && z.faturaNo === 'EAR2026000001'));
});

test('senet: taksitlerden senet, borçtan fazlası alınmaz, tahsil ödeme yazar, karşılıksız işaretlenir', async () => {
  const b = await gir('buro', 'personel');
  const m = await gir('muhasebe', 'personel');
  const o = (await veri(b)).ogrenciler.find((x) => x.sube_id === 'sube-cankaya' && x.durum === 'aktif' && x.hesap.kalan > 100000 && x.hesap.taksitler.some((t) => t.durum !== 'odendi'));
  let r = await islem(b, { islem: 'senet_ekle', ogrenciId: o.id, taksitlerden: true, no: 'S100' });
  tamam(r);
  assert.equal((await islem(b, { islem: 'senet_ekle', ogrenciId: o.id, vade: gunEkle(30), tutar: 100 })).durum, 400, 'kalan borçtan fazla senet');
  const senet = (await veri(b)).senetler.find((s) => s.ogrenci_id === o.id);
  const once = (await veri(b)).ogrenciler.find((x) => x.id === o.id).hesap.odenen;
  r = await islem(b, { islem: 'senet_tahsil', id: senet.id, yontem: 'havale' });
  tamam(r);
  assert.ok(r.j.makbuzNo);
  assert.equal((await veri(b)).ogrenciler.find((x) => x.id === o.id).hesap.odenen - once, senet.tutar);
  const ikinci = (await veri(b)).senetler.find((s) => s.ogrenci_id === o.id && s.durum === 'portfoy');
  if (ikinci) {
    assert.equal((await islem(b, { islem: 'senet_durum', id: ikinci.id, durum: 'karsiliksiz' })).durum, 403, 'büro durum değiştiremez');
    tamam(await islem(m, { islem: 'senet_durum', id: ikinci.id, durum: 'karsiliksiz' }));
  }
});

test('banka ve aktarım: şube kasasından merkeze gönderilen para gün sonunda düşülür; hesap bakiyesi', async () => {
  const y = await yon();
  const m = await gir('muhasebe', 'personel');
  let r = await islem(y, { islem: 'banka_hesap_kaydet', ad: 'Merkez Bankası Hesabı', banka: 'Örnek Bank', iban: 'TR000000000000000000000001', acilis: 1000000 });
  tamam(r);
  const merkezHesap = r.j.id;
  r = await islem(m, { islem: 'banka_hesap_kaydet', subeId: 'sube-cankaya', ad: 'Çankaya POS', banka: 'Örnek Bank' });
  tamam(r);
  const posHesap = r.j.id;
  assert.equal((await islem(m, { islem: 'banka_hesap_kaydet', ad: 'Kurum hesabı' })).durum, 403, 'kurum geneli hesabı yalnız yönetici');
  // Kartla tahsilat hesaba bağlanır.
  tamam(await islem(m, { islem: 'odeme_al', ogrenciId: 'o5', tutar: 5000, yontem: 'kart', hesapId: posHesap, tarih: gunEkle(2) }));
  // Kasa: yarın için (bugün kapatılmış olabilir) nakit al, merkeze gönder.
  const gun = gunEkle(2);
  const once = (await istek(`/api/kasa-beklenen?sube=sube-cankaya&tarih=${gun}`, { cerez: m })).j.beklenen;
  tamam(await islem(m, { islem: 'para_aktar', kaynakTur: 'kasa', kaynakId: 'sube-cankaya', hedefTur: 'kasa', hedefId: 'sube-merkez', tutar: 3000, tarih: gun }));
  tamam(await islem(m, { islem: 'para_aktar', kaynakTur: 'kasa', kaynakId: 'sube-cankaya', hedefTur: 'hesap', hedefId: merkezHesap, tutar: 2000, tarih: gun }));
  const sonra = (await istek(`/api/kasa-beklenen?sube=sube-cankaya&tarih=${gun}`, { cerez: m })).j.beklenen;
  assert.equal(once - sonra, 5000);
  assert.equal((await islem(m, { islem: 'para_aktar', kaynakTur: 'kasa', kaynakId: 'sube-kecioren', hedefTur: 'kasa', hedefId: 'sube-merkez', tutar: 1 })).durum, 403, 'başka şubenin kasası');
  const v = await veri(y);
  assert.equal(v.bankaHesaplari.find((h) => h.id === merkezHesap).bakiye, 1000000 + 2000);
  assert.equal(v.bankaHesaplari.find((h) => h.id === posHesap).bakiye, 5000);
});

test('aday ve internetten ön kayıt: form kapalıyken çalışmaz; başvuru aday olur; aday kayda dönüşür', async () => {
  const y = await yon();
  assert.equal((await istek('/api/on-kayit-bilgi')).durum, 404);
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'onKayit', deger: { acik: true, mesaj: 'Hoş geldiniz' } }));
  const bilgi = await istek('/api/on-kayit-bilgi');
  tamam(bilgi);
  assert.ok(bilgi.j.subeler.length >= 3);
  assert.equal((await istek('/api/on-kayit', { govde: { ad: 'A', soyad: 'B', telefon: '0532 111 22 33' } })).durum, 400, 'onay olmadan');
  tamam(await istek('/api/on-kayit', { govde: { ad: 'Ön', soyad: 'Kayıt', telefon: '0532 111 22 33', sinif: 'B', subeId: 'sube-cankaya', kvkkOnay: true }, ip: '10.3.3.3' }));
  tamam(await istek('/api/on-kayit', { govde: { ad: 'Ön', soyad: 'Kayıt', telefon: '0532 111 22 33', kvkkOnay: true }, ip: '10.3.3.3' }));
  for (let i = 0; i < 4; i++) await istek('/api/on-kayit', { govde: { ad: 'X', soyad: 'Y', telefon: `0532 111 22 ${40 + i}`, kvkkOnay: true }, ip: '10.4.4.4' });
  assert.equal((await istek('/api/on-kayit', { govde: { ad: 'X', soyad: 'Y', telefon: '0532 111 22 99', kvkkOnay: true }, ip: '10.4.4.4' })).durum, 200);
  assert.equal((await istek('/api/on-kayit', { govde: { ad: 'X', soyad: 'Y', telefon: '0532 111 22 98', kvkkOnay: true }, ip: '10.4.4.4' })).durum, 429, 'yer başına sınır');
  const b = await gir('buro', 'personel');
  const aday = (await veri(b)).adaylar.filter((a) => a.ad === 'Ön' && a.soyad === 'Kayıt');
  assert.equal(aday.length, 1, 'aynı telefondan ikinci başvuru açılmaz');
  assert.ok(aday[0].on_kayit);
  assert.equal((await veri(await gir('egitmen1', 'personel'))).adaylar, undefined, 'eğitmen aday görmez');
  tamam(await islem(b, { islem: 'aday_not', id: aday[0].id, metin: 'Arandı, fiyat verildi', sonrakiArama: gunEkle(2) }));
  const r = await islem(b, { islem: 'aday_kayit', adayId: aday[0].id, subeId: 'sube-cankaya', ad: 'Ön', soyad: 'Kayıt', tc: tcUret('500000001'), sinif: 'B', ucret: 1000000 });
  tamam(r);
  const vb = await veri(b);
  assert.equal(vb.adaylar.find((a) => a.id === aday[0].id).durum, 'kayit');
  assert.equal(vb.ogrenciler.find((o) => o.id === r.j.id).kaynak, 'İnternet (ön kayıt)');
  assert.ok(vb.ogrenciler.find((o) => o.id === r.j.id).kvkk, 'ön kayıttaki onay kayda geçer');
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'onKayit', deger: { acik: false } }));
});

test('hatırlatma: yarınki ders ve sınav için liste hazırlanır, tekrar hazırlanınca çoğalmaz, öğrenci görür, deneme SMS gider', async () => {
  const y = await yon();
  let r = await islem(y, { islem: 'hatirlatma_hazirla' });
  tamam(r);
  const ilk = r.j.eklenen;
  assert.ok(ilk > 0);
  r = await islem(y, { islem: 'hatirlatma_hazirla' });
  assert.equal(r.j.eklenen, 0, 'aynı gün ikinci kez eklenmez');
  const v = await veri(y);
  assert.ok(v.bildirimler.some((b) => b.tur === 'ders'));
  assert.equal((await veri(await gir('egitmen1', 'personel'))).bildirimler, undefined);
  // SMS (deneme sağlayıcısı)
  assert.equal((await istek('/api/sms-gonder', { govde: { idler: [v.bildirimler[0].id] }, cerez: y })).durum, 400, 'SMS kapalı');
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'sms', deger: { acik: true, saglayici: 'deneme', baslik: 'ORNEK' } }));
  const telli = v.bildirimler.find((b) => cepNo(b.telefon));
  r = await istek('/api/sms-gonder', { govde: { idler: [telli.id] }, cerez: y });
  tamam(r);
  assert.equal(r.j.gonderilen, 1);
  assert.equal((await veri(y)).bildirimler.find((b) => b.id === telli.id).durum, 'gonderildi');
  tamam(await islem(y, { islem: 'ayar_kaydet', bolum: 'sms', deger: { acik: false } }));
  // Öğrenci kendi bildirimlerini görür.
  const og = await istek('/api/ogrenci-giris', { govde: { tc: ORNEK.ogrenciTc, sifre: ORNEK.ogrenciSifre }, ip: '10.2.2.2' });
  const ov = (await istek('/api/ogrenci', { cerez: og.cerez })).j;
  assert.ok(Array.isArray(ov.bildirimler));
});

test('karne: eğitmen tamamlanan dersi puanlar, sınava hazır işaretler, öğrenci görür', async () => {
  const eg = await gir('egitmen1', 'personel');
  const v = await veri(eg);
  const d = v.dersler.find((x) => x.egitmen_id === 'k-egitmen1' && x.durum === 'tamamlandi');
  const planli = v.dersler.find((x) => x.egitmen_id === 'k-egitmen1' && x.durum === 'planli');
  assert.equal((await islem(eg, { islem: 'karne_kaydet', dersId: planli.id, puanlar: { 'Kalkış ve duruş': 3 } })).durum, 400, 'planlı derse karne yok');
  tamam(await islem(eg, { islem: 'karne_kaydet', dersId: d.id, puanlar: { 'Kalkış ve duruş': 4, 'Paralel park': 2, 'Uydurma konu': 5 }, notu: 'Park çalışılmalı' }));
  assert.equal((await islem(eg, { islem: 'karne_kaydet', dersId: d.id, puanlar: { 'Paralel park': 9 } })).durum, 400);
  const k = (await veri(eg)).karneler.find((x) => x.ders_id === d.id);
  assert.deepEqual(k.puanlar, { 'Kalkış ve duruş': 4, 'Paralel park': 2 });
  tamam(await islem(eg, { islem: 'sinava_hazir', ogrenciId: d.ogrenci_id, hazir: true }));
  assert.ok((await veri(eg)).ogrenciler.find((o) => o.id === d.ogrenci_id).sinava_hazir);
  assert.equal((await islem(await gir('egitmen3', 'personel'), { islem: 'karne_kaydet', dersId: d.id, puanlar: {} })).durum, 404, 'başka eğitmen');
});

test('deneme testi: doğru cevaplar test bitmeden gönderilmez, puan sunucuda hesaplanır, bir test iki kez bitirilemez', async () => {
  const og = await istek('/api/ogrenci-giris', { govde: { tc: ORNEK.ogrenciTc, sifre: ORNEK.ogrenciSifre }, ip: '10.2.2.3' });
  const t = await istek('/api/deneme-test', { govde: {}, cerez: og.cerez });
  tamam(t);
  assert.ok(t.j.sorular.length >= 20);
  assert.ok(t.j.sorular.every((s) => s.dogru === undefined));
  const sorular = platform.firmaMotoru('ornek').ctx.q('SELECT id, dogru FROM sorular');
  const cevaplar = Object.fromEntries(t.j.sorular.map((s, i) => [s.id, i % 2 === 0 ? sorular.find((x) => x.id === s.id).dogru : 99]));
  const r = await istek('/api/ogrenci-islem', { govde: { islem: 'test_bitir', oturumId: t.j.oturumId, cevaplar }, cerez: og.cerez });
  tamam(r);
  assert.equal(r.j.dogru, Math.ceil(t.j.sorular.length / 2));
  assert.equal(r.j.puan, Math.round((100 * r.j.dogru) / t.j.sorular.length));
  assert.equal((await istek('/api/ogrenci-islem', { govde: { islem: 'test_bitir', oturumId: t.j.oturumId, cevaplar }, cerez: og.cerez })).durum, 400);
  const y = await yon();
  assert.ok((await veri(y)).testSonuclari.some((x) => x.ogrenci_id === 'o1'));
  // Soru bankası yalnız yöneticide
  assert.equal((await veri(await gir('buro', 'personel'))).sorular, undefined);
  tamam(await islem(y, { islem: 'soru_kaydet', konu: 'Trafik Adabı', metin: 'Deneme sorusu?', secenekler: ['Evet', 'Hayır'], dogru: 0 }));
});

test('şifremi unuttum: talep yöneticiye düşer, kod tek kullanımlıktır, yanlış kod sınırı', async () => {
  const y = await yon();
  tamam(await istek('/api/sifre-unuttum', { govde: { kullaniciAdi: 'muhasebe' } }));
  tamam(await istek('/api/sifre-unuttum', { govde: { kullaniciAdi: 'olmayan' } }));
  const v = await veri(y);
  assert.ok(v.sifreTalepleri.some((t) => t.kullanici_id === 'k-muhasebe'));
  const mudur = await gir('mudur', 'yonetici');
  assert.equal((await islem(mudur, { islem: 'sifre_kodu_uret', kullaniciId: 'k-egitmen3' })).durum, 403, 'müdür başka şubenin personeline kod veremez');
  const r = await islem(mudur, { islem: 'sifre_kodu_uret', kullaniciId: 'k-muhasebe' });
  tamam(r);
  assert.equal((await istek('/api/sifre-sifirla', { govde: { kullaniciAdi: 'muhasebe', kod: 'YANLIS12', yeniSifre: 'YeniSifre1!' } })).durum, 400);
  tamam(await istek('/api/sifre-sifirla', { govde: { kullaniciAdi: 'muhasebe', kod: r.j.kod, yeniSifre: 'YeniSifre1!' } }));
  assert.equal((await istek('/api/sifre-sifirla', { govde: { kullaniciAdi: 'muhasebe', kod: r.j.kod, yeniSifre: 'BaskaSifre2!' } })).durum, 400, 'tek kullanımlık');
  tamam(await istek('/api/giris', { govde: { kullaniciAdi: 'muhasebe', sifre: 'YeniSifre1!', kapi: 'personel' } }));
  delete cerezler.muhasebe;
  // Eski şifreyle açık oturum kapandı.
  // Şifre geri alınır (diğer testler için)
  const r2 = await islem(y, { islem: 'sifre_kodu_uret', kullaniciId: 'k-muhasebe' });
  tamam(await istek('/api/sifre-sifirla', { govde: { kullaniciAdi: 'muhasebe', kod: r2.j.kod, yeniSifre: ORNEK.sifre } }));
});

test('bütün cihazlardan çıkış ve kurumun bütün verisini dışarı alma (şifreler hariç)', async () => {
  const r = await istek('/api/giris', { govde: { kullaniciAdi: 'buro2', sifre: ORNEK.sifre, kapi: 'personel' } });
  tamam(await islem(r.cerez, { islem: 'oturumlari_kapat' }));
  assert.equal((await istek('/api/veri', { cerez: r.cerez })).durum, 401);
  const y = await yon();
  assert.equal((await istek('/api/disa-aktar', { cerez: await gir('mudur', 'yonetici') })).durum, 403);
  const d = await istek('/api/disa-aktar', { cerez: y, ham: true });
  assert.equal(d.status, 200);
  const j = await d.json();
  assert.ok(j.tablolar.ogrenciler.length > 10);
  assert.ok(!('sifre' in j.tablolar.kullanicilar[0]));
  assert.ok(!j.tablolar.oturumlar);
  assert.ok(!('portal_sifre' in j.tablolar.ogrenciler[0]));
});

test('aylık rapor: son aylar, kaynaklar ve reklam maliyeti', async () => {
  const r = await istek('/api/rapor-aylik?ay=6', { cerez: await yon() });
  tamam(r);
  assert.equal(r.j.aylar.length, 6);
  assert.equal(r.j.aylar[5].ay, bugun().slice(0, 7));
  assert.ok(r.j.aylar.reduce((a, x) => a + x.yeniKayit, 0) > 0);
  assert.ok(Array.isArray(r.j.kaynaklar));
  const m = await istek('/api/rapor-aylik?ay=6', { cerez: await gir('mudur', 'yonetici') });
  assert.deepEqual(m.j.subeler.map((s) => s.id), ['sube-cankaya']);
});

test('platform: kullanıcı sınırı, lisans ödemesi ile uzatma, kullanım özeti, yedek al ve dön, yönetici kodu, ek doğrulama', async () => {
  let r = await istek('/api/platform/giris', { govde: { kullaniciAdi: 'dc', sifre: ORNEK.sifre }, firma: '' });
  tamam(r);
  const pc = r.cerez;
  const p = (yol, govde) => istek('/api/platform/' + yol, { govde, cerez: pc, firma: '' });
  // Kullanıcı sınırı
  const aktif = (await p('kullanim')).j.firmalar.find((f) => f.kod === 'ornek').personel;
  tamam(await p('firma-duzenle', { kod: 'ornek', maxKullanici: aktif }));
  const y = await yon();
  assert.equal((await islem(y, { islem: 'personel_ekle', ad: 'Fazla', kullaniciAdi: 'fazla1', sifre: 'GucluSifre9', rol: 'egitmen', subeId: 'sube-merkez' })).durum, 402);
  tamam(await p('firma-duzenle', { kod: 'ornek', maxKullanici: 0 }));
  tamam(await islem(y, { islem: 'personel_ekle', ad: 'Fazla', kullaniciAdi: 'fazla1', sifre: 'GucluSifre9', rol: 'egitmen', subeId: 'sube-merkez' }));
  // Lisans ödemesi
  tamam(await p('firma-duzenle', { kod: 'ornek', lisansBitis: gunEkle(10) }));
  tamam(await p('lisans-odeme', { kod: 'ornek', tutar: 1200000, donemBas: gunEkle(10), donemBit: gunEkle(375), faturaNo: 'DC-1', lisansUzat: true }));
  const f = (await p('firmalar')).j.firmalar.find((x) => x.kod === 'ornek');
  assert.equal(f.lisans_bitis, gunEkle(375));
  assert.equal(f.odenen, 1200000);
  tamam(await p('firma-duzenle', { kod: 'ornek', lisansBitis: '2099-12-31' }));
  // Yedek al, değişiklik yap, yedeğe dön.
  const yd = await p('yedek-al', { kod: 'ornek' });
  tamam(yd);
  tamam(await islem(y, { islem: 'duyuru_ekle', baslik: 'Yedekten sonra', metin: 'silinecek' }));
  assert.equal((await p('yedek-don', { kod: 'ornek', ad: yd.j.ad, onay: 'yanlis' })).durum, 400);
  tamam(await p('yedek-don', { kod: 'ornek', ad: yd.j.ad, onay: 'ornek' }));
  assert.ok(!(await veri(y)).duyurular.some((d) => d.baslik === 'Yedekten sonra'), 'yedekteki hale dönüldü');
  assert.ok((await p('yedekler?kod=ornek')).j.yedekler.some((x) => x.ad.includes('donus-oncesi')));
  assert.ok(existsSync(join(dizin, 'veri-anahtari.txt')));
  // Yöneticinin şifre sıfırlama kodu (DC üretir)
  r = await p('yonetici-kodu', { kod: 'ornek', kullaniciAdi: 'patron' });
  tamam(r);
  assert.equal(r.j.kod.length, 8);
  // Platform ek doğrulama
  r = await p('totp-baslat', {});
  tamam(r);
  const gizli = r.j.gizli;
  const adim = Math.floor(Date.now() / 30000);
  tamam(await p('totp-ac', { kod: totpUret(gizli, adim) }));
  r = await istek('/api/platform/giris', { govde: { kullaniciAdi: 'dc', sifre: ORNEK.sifre }, firma: '' });
  assert.equal(r.j.kodGerekli, true);
  assert.equal((await istek('/api/platform/giris', { govde: { kullaniciAdi: 'dc', sifre: ORNEK.sifre, kod: '000000' }, firma: '' })).durum, 401, 'yanlış kod');
  assert.equal((await istek('/api/platform/giris', { govde: { kullaniciAdi: 'dc', sifre: ORNEK.sifre, kod: totpUret(gizli, adim) }, firma: '' })).durum, 401, 'aynı kod ikinci kez kullanılamaz');
  tamam(await istek('/api/platform/giris', { govde: { kullaniciAdi: 'dc', sifre: ORNEK.sifre, kod: totpUret(gizli, adim + 1) }, firma: '' }));
  assert.ok((await p('kayitlar')).j.kayitlar.some((x) => /Yedek alındı/.test(x.metin)));
});
