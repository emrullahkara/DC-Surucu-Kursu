// E-sınav deneme testi: öğrenci kendi ekranından soru çözer; sonuç ve konu başına başarısı saklanır.
//  - Soru bankası kurumundur: yönetici soru ekler, düzenler, Excel'den toplu yükler.
//  - Başlangıçta birkaç ÖRNEK soru gelir (kurumun kendi sorularıyla değiştirmesi önerilir).
//  - Doğru cevaplar öğrencinin ekranına test bitmeden gönderilmez; puan sunucuda hesaplanır.
import { randomUUID } from 'node:crypto';
import { fail, metin, tamSayi, secim } from '../domain.mjs';

const simdi = () => new Date().toISOString();
export const TEST_KONULARI = ['Trafik ve Çevre', 'İlk Yardım', 'Araç Tekniği', 'Trafik Adabı'];

// Örnek sorular (kurum silebilir ya da değiştirebilir). Seçeneklerin ilki doğru cevaptır; kayıtta karıştırılır.
const ORNEK_SORULAR = [
  ['Trafik ve Çevre', 'Yerleşim yeri içinde, aksine bir işaret yoksa otomobiller için azami hız sınırı saatte kaç kilometredir?', ['50', '30', '70', '90'], 'Yerleşim yeri içinde otomobiller için genel hız sınırı 50 km/saattir.'],
  ['Trafik ve Çevre', 'Otoyolda, aksine bir işaret yoksa otomobiller için azami hız sınırı saatte kaç kilometredir?', ['120', '90', '110', '140'], ''],
  ['Trafik ve Çevre', 'Bölünmüş yolda, aksine bir işaret yoksa otomobiller için azami hız sınırı saatte kaç kilometredir?', ['110', '90', '120', '82'], ''],
  ['Trafik ve Çevre', 'Şehirlerarası çift yönlü karayolunda, aksine bir işaret yoksa otomobiller için azami hız sınırı saatte kaç kilometredir?', ['90', '70', '110', '120'], ''],
  ['Trafik ve Çevre', 'Trafik ışıklarında sürekli yanan kırmızı ışık sürücüye ne bildirir?', ['Dur, geçme', 'Yavaşla, dikkatli geç', 'Geçiş serbest', 'Yalnız sağa dönülebilir'], ''],
  ['Trafik ve Çevre', 'Işıklı işaret, trafik işareti ve görevli bulunmayan bir kavşakta, kavşağa aynı anda gelen araçlardan hangisine ilk geçiş hakkı verilir?', ['Sağdan gelen araca', 'Soldan gelen araca', 'Büyük araca', 'Hızlı gelen araca'], 'Bu durumda sağdan gelen araca ilk geçiş hakkı verilir.'],
  ['Trafik ve Çevre', 'Dönel kavşakta ilk geçiş hakkı kimdedir?', ['Dönel kavşak içindeki araçlarda', 'Kavşağa girmek isteyen araçlarda', 'Sağdan gelen araçlarda', 'Ağır taşıtlarda'], ''],
  ['Trafik ve Çevre', 'Takip mesafesi için genel kural aşağıdakilerden hangisidir?', ['Hızın yarısı kadar metre (ör. 90 km/saatte en az 45 metre)', 'Hız kaç ise o kadar santimetre', 'Her hızda 10 metre', 'Önündeki aracın boyu kadar'], ''],
  ['Trafik ve Çevre', 'Hususi otomobil sürücüleri için kandaki alkol sınırı kaç promildir?', ['0,50', '1,00', '0,20', '0,80'], ''],
  ['Trafik ve Çevre', 'Ticari araç (taksi, dolmuş, otobüs vb.) sürücüleri için kandaki alkol sınırı nedir?', ['Hiç alkol almamış olmaları gerekir (0,00 promil)', '0,50 promil', '0,20 promil', '1,00 promil'], ''],
  ['Trafik ve Çevre', 'Aşağıdakilerden hangisinde öndeki aracı geçmek (sollama) yasaktır?', ['Tepe üstleri ve görüşün yetersiz olduğu virajlarda', 'Görüşün açık olduğu düz yolda', 'Karşı yönden araç gelmeyen düz yolda', 'Otoyolda sol şeritten'], ''],
  ['Trafik ve Çevre', 'Emniyet kemeri takma zorunluluğu kimleri kapsar?', ['Sürücüyü ve bütün yolcuları', 'Yalnız sürücüyü', 'Yalnız ön koltuktakileri', 'Yalnız şehirlerarası yolda olanları'], ''],
  ['Trafik ve Çevre', 'Işıklı işaret bulunmayan yaya geçidine yaklaşan sürücü, geçitte yaya varsa ne yapmalıdır?', ['Yavaşlamalı, gerekirse durarak yayaya ilk geçiş hakkını vermeli', 'Korna çalarak geçmeli', 'Hızını artırıp yayadan önce geçmeli', 'Yayanın geri çekilmesini beklemeden geçmeli'], ''],
  ['Trafik ve Çevre', 'Sürücü belgesi olmadan araç kullanan kişiye ne olur?', ['Yasal yaptırım uygulanır ve aracı trafikten men edilir', 'Yalnız uyarılır', 'Hiçbir işlem yapılmaz', 'Yalnız aracın ehliyeti olan birine verilmesi istenir'], ''],
  ['İlk Yardım', 'Türkiye’de acil sağlık yardımı için aranacak numara hangisidir?', ['112', '155', '110', '156'], ''],
  ['İlk Yardım', 'İlk yardımın temel uygulamaları sırasıyla hangileridir?', ['Koruma, bildirme, kurtarma', 'Kurtarma, koruma, bildirme', 'Bildirme, kurtarma, koruma', 'Taşıma, bildirme, koruma'], 'Önce olay yeri güvenliği (koruma), sonra 112’ye bildirme, sonra kurtarma.'],
  ['İlk Yardım', 'Bilinci kapalı ama solunumu olan yaralıya hangi pozisyon verilir?', ['Koma (derlenme / yarı yüzüstü yan) pozisyonu', 'Sırtüstü, başı yüksekte', 'Oturur pozisyon', 'Yüzüstü, kollar yanda'], ''],
  ['İlk Yardım', 'Yetişkinde temel yaşam desteğinde göğüs basısı ve suni solunum oranı nedir?', ['30 bası, 2 solunum', '15 bası, 1 solunum', '5 bası, 1 solunum', '10 bası, 2 solunum'], ''],
  ['İlk Yardım', 'Atardamar kanamasının belirtisi hangisidir?', ['Açık kırmızı renkli kanın fışkırır tarzda akması', 'Koyu renkli kanın yavaşça sızması', 'Kanın damla damla akması', 'Kanamanın kendiliğinden hemen durması'], ''],
  ['İlk Yardım', 'Yanıklarda ilk yapılması gereken hangisidir?', ['Yanık bölgeyi soğuk (buzlu olmayan) su ile soğutmak', 'Yanığa diş macunu sürmek', 'Oluşan su keseciklerini patlatmak', 'Yanık bölgeyi sıkıca sarmak'], ''],
  ['İlk Yardım', 'Kırık şüphesi olan yaralıda ne yapılmalıdır?', ['Kırık bölge hareket ettirilmeden sabitlenmeli (tespit edilmeli)', 'Kırık yerine oturtulmaya çalışılmalı', 'Yaralı yürütülerek hastaneye götürülmeli', 'Kırık bölgeye masaj yapılmalı'], ''],
  ['İlk Yardım', 'Kaza yerinde ilk yardımcının ilk işi aşağıdakilerden hangisidir?', ['Kendisinin ve çevrenin güvenliğini sağlamak', 'Yaralıyı hemen araçtan çıkarmak', 'Yaralıya su içirmek', 'Olay yerinden fotoğraf çekmek'], ''],
  ['Araç Tekniği', 'Motor yağ seviyesi nasıl kontrol edilir?', ['Araç düz zemindeyken, motor durdurulduktan bir süre sonra yağ çubuğuyla', 'Motor çalışırken, yokuşta', 'Araç hareket halindeyken göstergeden', 'Yalnız servis tarafından ölçülebilir'], ''],
  ['Araç Tekniği', 'ABS (kilitlenme önleyici fren sistemi) ne işe yarar?', ['Ani frenlemede tekerleklerin kilitlenmesini önleyerek direksiyon hakimiyetini korur', 'Aracın hızını sabit tutar', 'Yakıt tasarrufu sağlar', 'Motoru soğutur'], ''],
  ['Araç Tekniği', 'Otomobil lastiklerinde yasal en az diş derinliği kaç milimetredir?', ['1,6', '0,5', '3,0', '5,0'], ''],
  ['Araç Tekniği', 'Hararet (motor sıcaklık) göstergesinin yükselmesinin en olası nedeni hangisidir?', ['Soğutma suyunun (antifrizin) eksik olması', 'Yakıt deposunun dolu olması', 'Lastik basıncının yüksek olması', 'Farların açık olması'], ''],
  ['Araç Tekniği', 'Debriyajın görevi nedir?', ['Motor gücünü vites kutusuna iletmek ya da kesmek', 'Aracı durdurmak', 'Yakıtı motora göndermek', 'Aküyü şarj etmek'], ''],
  ['Araç Tekniği', 'Akünün temel görevi nedir?', ['Motoru çalıştırmak için marş motoruna elektrik vermek', 'Motoru soğutmak', 'Frenleri güçlendirmek', 'Lastik basıncını ayarlamak'], ''],
  ['Trafik Adabı', 'Geçiş üstünlüğüne sahip bir araç (ambulans, itfaiye) ses ve ışık işaretiyle yaklaşırken sürücü ne yapmalıdır?', ['Sağa yanaşarak yol vermeli, gerekirse durmalı', 'Hızını artırıp önünden kaçmalı', 'Olduğu yerde şerit değiştirmeden devam etmeli', 'Korna çalarak karşılık vermeli'], ''],
  ['Trafik Adabı', 'Korna hangi durumda kullanılmalıdır?', ['Yalnız tehlikeyi önlemek için zorunlu hallerde', 'Selamlaşmak için', 'Trafik yavaş aktığında', 'Yaya geçidindeki yayaları hızlandırmak için'], ''],
  ['Trafik Adabı', 'Trafik adabına uygun davranış hangisidir?', ['Yaya geçidinde bekleyen yayaya yol vermek', 'Kırmızı ışık yanarken yayalara korna çalmak', 'Emniyet şeridinde ilerlemek', 'Kuyrukta araya girmek'], ''],
  ['Trafik Adabı', 'Yağmurlu havada su birikintisinin yanından geçen sürücü ne yapmalıdır?', ['Yavaşlayarak yayalara su sıçratmamalı', 'Hızlanarak birikintiden çabuk çıkmalı', 'Korna çalarak yayaları uzaklaştırmalı', 'Hiçbir şey yapmasına gerek yoktur'], ''],
];

// Seçenekleri karıştır, doğrunun yerini kaydet (her kurumda aynı sıra olmasın diye rastgele).
function karistir(secenekler) {
  const l = secenekler.map((m, i) => ({ m, d: i === 0 }));
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return { secenekler: l.map((x) => x.m), dogru: l.findIndex((x) => x.d) };
}
function soruDogrula(g) {
  const konu = secim(g.konu, TEST_KONULARI, 'Konu');
  const soru = metin(g.metin, 1000, true, 'Soru');
  if (!Array.isArray(g.secenekler) || g.secenekler.length < 2 || g.secenekler.length > 5) fail('Soruya 2 ile 5 arasında seçenek yazın.');
  const secenekler = g.secenekler.map((x, i) => metin(x, 300, true, `${i + 1}. seçenek`));
  const dogru = tamSayi(g.dogru, 0, secenekler.length - 1, 'Doğru cevap');
  return { konu, soru, secenekler, dogru, aciklama: metin(g.aciklama, 500) };
}

export default {
  ad: 'deneme_testi',
  sema(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS sorular(id TEXT PRIMARY KEY, konu TEXT NOT NULL, metin TEXT NOT NULL, secenekler TEXT NOT NULL, dogru INTEGER NOT NULL,
  aciklama TEXT NOT NULL DEFAULT '', kaynak TEXT NOT NULL DEFAULT 'kurum', aktif INTEGER NOT NULL DEFAULT 1, olusturma TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS test_oturumlari(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), sorular TEXT NOT NULL, baslangic TEXT NOT NULL, bitti INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS test_sonuclari(id TEXT PRIMARY KEY, ogrenci_id TEXT NOT NULL REFERENCES ogrenciler(id), oturum_id TEXT NOT NULL, tarih TEXT NOT NULL,
  soru_sayisi INTEGER NOT NULL, dogru INTEGER NOT NULL, puan INTEGER NOT NULL, konular TEXT NOT NULL, sure_sn INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS test_ogr ON test_sonuclari(ogrenci_id);
CREATE TABLE IF NOT EXISTS sistem_anahtarlari(ad TEXT PRIMARY KEY, deger TEXT NOT NULL);`);
    // Örnek sorular yalnız bir kez yüklenir (kurum hepsini silerse geri gelmez).
    if (!db.q("SELECT 1 FROM sistem_anahtarlari WHERE ad='ornek_sorular'").length) {
      const t = simdi();
      for (const [konu, soru, secenekler, aciklama] of ORNEK_SORULAR) {
        const k = karistir(secenekler);
        db.run('INSERT INTO sorular(id,konu,metin,secenekler,dogru,aciklama,kaynak,aktif,olusturma) VALUES(?,?,?,?,?,?,?,1,?)', randomUUID(), konu, soru, JSON.stringify(k.secenekler), k.dogru, aciklama, 'ornek', t);
      }
      db.run("INSERT INTO sistem_anahtarlari(ad,deger) VALUES('ornek_sorular','1')");
    }
  },

  veri(c, k, v) {
    v.tanimlar.testKonulari = TEST_KONULARI;
    if (k.rol === 'yonetici') v.sorular = c.q('SELECT * FROM sorular WHERE aktif=1 ORDER BY konu, olusturma').map((x) => ({ ...x, secenekler: JSON.parse(x.secenekler) }));
    const gorunen = new Set(v.ogrenciler.map((o) => o.id));
    v.testSonuclari = c.q('SELECT id, ogrenci_id, tarih, soru_sayisi, dogru, puan, konular FROM test_sonuclari ORDER BY tarih DESC LIMIT 3000')
      .filter((x) => gorunen.has(x.ogrenci_id)).map((x) => ({ ...x, konular: JSON.parse(x.konular) }));
  },

  islemler: {
    soru_kaydet(c, k, g) {
      if (k.rol !== 'yonetici') fail('Soru bankasını yönetici düzenler.', 403);
      const s = soruDogrula(g);
      if (g.id) {
        const x = c.q1('SELECT id FROM sorular WHERE id=? AND aktif=1', String(g.id));
        if (!x) fail('Soru bulunamadı.', 404);
        c.run("UPDATE sorular SET konu=?, metin=?, secenekler=?, dogru=?, aciklama=?, kaynak='kurum' WHERE id=?", s.konu, s.soru, JSON.stringify(s.secenekler), s.dogru, s.aciklama, x.id);
        return { olay: [null, 'ayar', 'Deneme testi sorusu güncellendi'] };
      }
      const id = randomUUID();
      c.run('INSERT INTO sorular(id,konu,metin,secenekler,dogru,aciklama,kaynak,aktif,olusturma) VALUES(?,?,?,?,?,?,?,1,?)', id, s.konu, s.soru, JSON.stringify(s.secenekler), s.dogru, s.aciklama, 'kurum', simdi());
      return { sonuc: { id }, olay: [null, 'ayar', 'Deneme testine soru eklendi'] };
    },
    soru_sil(c, k, g) {
      if (k.rol !== 'yonetici') fail('Soru bankasını yönetici düzenler.', 403);
      const idler = Array.isArray(g.idler) ? g.idler : [g.id];
      for (const id of idler) c.run('UPDATE sorular SET aktif=0 WHERE id=?', String(id));
      return { olay: [null, 'ayar', `${idler.length} deneme testi sorusu kaldırıldı`] };
    },
    // Excel'den: her satır {konu, metin, secenekler[], dogru(0..)}. Hatalı satırlar atlanır.
    soru_toplu_ekle(c, k, g) {
      if (k.rol !== 'yonetici') fail('Soru bankasını yönetici düzenler.', 403);
      if (!Array.isArray(g.sorular) || !g.sorular.length) fail('Soru yok.');
      if (g.sorular.length > 2000) fail('Bir seferde en fazla 2000 soru.');
      let eklenen = 0;
      const hatalar = [];
      g.sorular.forEach((x, i) => {
        try {
          const s = soruDogrula(x || {});
          c.run('INSERT INTO sorular(id,konu,metin,secenekler,dogru,aciklama,kaynak,aktif,olusturma) VALUES(?,?,?,?,?,?,?,1,?)', randomUUID(), s.konu, s.soru, JSON.stringify(s.secenekler), s.dogru, s.aciklama, 'kurum', simdi());
          eklenen++;
        } catch (e) {
          if (!(e instanceof Error) || !('durum' in e)) throw e;
          hatalar.push({ satir: Number(x?.satirNo) || i + 2, hata: e.message });
        }
      });
      return { sonuc: { eklenen, hatalar }, olay: [null, 'ayar', `Excel'den ${eklenen} deneme testi sorusu yüklendi`] };
    },
  },

  ogrenciVeri(c, o, v) {
    const a = c.ayar().denemeTest;
    v.denemeTest = {
      acik: a.acik, soruSayisi: a.soruSayisi, sureDk: a.sureDk, havuz: c.q1('SELECT COUNT(*) n FROM sorular WHERE aktif=1').n,
      sonuclar: c.q('SELECT tarih, soru_sayisi, dogru, puan, konular FROM test_sonuclari WHERE ogrenci_id=? ORDER BY tarih DESC LIMIT 20', o.id).map((x) => ({ ...x, konular: JSON.parse(x.konular) })),
    };
  },

  ogrenciYol(c, o, { yontem, yol }) {
    if (yol !== '/api/deneme-test' || yontem !== 'POST') return null;
    const a = c.ayar().denemeTest;
    if (!a.acik) fail('Kursunuz deneme testini kapatmış.');
    const havuz = c.q('SELECT id, konu, metin, secenekler FROM sorular WHERE aktif=1');
    if (havuz.length < 5) fail('Soru bankasında yeterli soru yok. Kursunuza haber verin.');
    // Rastgele seçim (her konudan dengeli olması için konu konu karıştırılır).
    for (let i = havuz.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [havuz[i], havuz[j]] = [havuz[j], havuz[i]]; }
    const secilen = havuz.slice(0, Math.min(a.soruSayisi, havuz.length));
    // Öğrencinin yarım kalan eski testleri kapanır.
    c.run('UPDATE test_oturumlari SET bitti=1 WHERE ogrenci_id=? AND bitti=0', o.id);
    const id = randomUUID();
    c.run('INSERT INTO test_oturumlari(id,ogrenci_id,sorular,baslangic,bitti) VALUES(?,?,?,?,0)', id, o.id, JSON.stringify(secilen.map((x) => x.id)), simdi());
    return { durum: 200, veri: { oturumId: id, sureDk: a.sureDk, sorular: secilen.map((x) => ({ id: x.id, konu: x.konu, metin: x.metin, secenekler: JSON.parse(x.secenekler) })) } };
  },

  ogrenciIslemleri: {
    test_bitir(c, o, g) {
      const t = c.q1('SELECT * FROM test_oturumlari WHERE id=? AND ogrenci_id=?', metin(g.oturumId, 60, true, 'Test'), o.id);
      if (!t) fail('Test bulunamadı.', 404);
      if (t.bitti) fail('Bu test daha önce bitirildi.');
      const cevaplar = g.cevaplar && typeof g.cevaplar === 'object' ? g.cevaplar : {};
      const ids = JSON.parse(t.sorular);
      const konular = {};
      const sonuclar = [];
      let dogru = 0;
      for (const id of ids) {
        const s = c.q1('SELECT * FROM sorular WHERE id=?', id);
        if (!s) continue;
        const cevap = Number.isInteger(cevaplar[id]) ? cevaplar[id] : null;
        const tamam = cevap === s.dogru;
        if (tamam) dogru++;
        const y = (konular[s.konu] ||= { dogru: 0, sayi: 0 });
        y.sayi++; if (tamam) y.dogru++;
        sonuclar.push({ id, cevap, dogru: s.dogru, aciklama: s.aciklama });
      }
      const sayi = sonuclar.length;
      const puan = sayi ? Math.round((100 * dogru) / sayi) : 0;
      const sure = Math.max(0, Math.round((c.saatKaynagi().getTime() - Date.parse(t.baslangic)) / 1000));
      c.run('UPDATE test_oturumlari SET bitti=1 WHERE id=?', t.id);
      c.run('INSERT INTO test_sonuclari(id,ogrenci_id,oturum_id,tarih,soru_sayisi,dogru,puan,konular,sure_sn) VALUES(?,?,?,?,?,?,?,?,?)',
        randomUUID(), o.id, t.id, c.bugunStr(), sayi, dogru, puan, JSON.stringify(konular), sure);
      return { sonuc: { puan, dogru, sayi, konular, sonuclar, gecme: c.ayar().eSinavGecme } };
    },
  },
};
