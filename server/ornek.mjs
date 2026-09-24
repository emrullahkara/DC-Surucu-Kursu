// ÖRNEK KURUM (yalnız ENABLE_DEMO=1). Bütün kişiler, numaralar ve plakalar uydurmadır.
import { randomUUID } from 'node:crypto';
import { taksitPlani } from './domain.mjs';
import { sifreOzet } from './firma.mjs';

export function tcUret(ilk9) {
  const d = [...String(ilk9)].map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8], cift = d[1] + d[3] + d[5] + d[7];
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return String(ilk9) + d10 + d11;
}

export const ORNEK = {
  sifre: 'Deneme123!',
  ogrenciTc: tcUret('100000001'),
  ogrenciSifre: 'ogrenci1',
};

export function ornekFirmaDoldur(c) {
  const t = new Date().toISOString();
  const bugun = c.bugunStr();
  const gunEkle = (n) => { const d = new Date(bugun + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const { run } = c;
  // Aynı veriyi her seferinde üretmek için basit, tekrarlanabilir sayı üreteci.
  let tohum = 7;
  const rnd = () => { tohum = (tohum * 16807) % 2147483647; return tohum / 2147483647; };
  const sec = (l) => l[Math.floor(rnd() * l.length)];

  c.islemde(() => {
    run('INSERT INTO kurum(id,ad,olusturma) VALUES(1,?,?)', 'Örnek Sürücü Kursu', t);
    c.ayarYaz('kurum', { adres: 'Örnek Cad. No:1 Çankaya / Ankara', telefon: '0312 000 00 00', vergiDairesi: 'Örnek VD', vergiNo: '0000000000', logo: '' });
    c.ayarYaz('ucretler', { ekDers: 150000, sinavTekrar: 100000 });
    c.ayarYaz('prim', { direksiyon: 20000, teorik: 10000 });
    const S = { merkez: 'sube-merkez', cankaya: 'sube-cankaya', kecioren: 'sube-kecioren' };
    const sube = (...a) => run('INSERT INTO subeler(id,ad,adres,telefon,merkez,aktif,olusturma,kod) VALUES(?,?,?,?,?,1,?,?)', ...a);
    sube(S.merkez, 'Merkez', 'Örnek Cad. No:1', '0312 000 00 01', 1, t, 'MRK');
    sube(S.cankaya, 'Çankaya Şubesi', 'Deneme Sok. No:5', '0312 000 00 02', 0, t, 'CNK');
    sube(S.kecioren, 'Keçiören Şubesi', 'Uydurma Bulvarı No:9', '0312 000 00 03', 0, t, 'KEC');
    const s = sifreOzet(ORNEK.sifre);
    const kul = [
      ['k-patron', 'patron', 'Ayşe Patron', 'yonetici', null],
      ['k-mudur', 'mudur', 'Burak Müdür', 'sube_muduru', S.cankaya],
      ['k-buro', 'buro', 'Canan Büro', 'buro', S.cankaya],
      ['k-muhasebe', 'muhasebe', 'Hülya Muhasebe', 'muhasebe', S.cankaya],
      ['k-egitmen1', 'egitmen1', 'Deniz Eğitmen', 'egitmen', S.cankaya],
      ['k-egitmen2', 'egitmen2', 'Emre Eğitmen', 'egitmen', S.cankaya],
      ['k-egitmen3', 'egitmen3', 'Figen Eğitmen', 'egitmen', S.kecioren],
      ['k-egitmen4', 'egitmen4', 'Gül Eğitmen', 'egitmen', S.merkez],
      ['k-buro2', 'buro2', 'Gökhan Büro', 'buro', S.merkez],
      ['k-mudur2', 'mudur2', 'İpek Müdür', 'sube_muduru', S.kecioren],
    ];
    for (const [id, kad, ad, rol, sb] of kul)
      run("INSERT INTO kullanicilar(id,kullanici_adi,ad,sifre,rol,sube_id,yetkiler,telefon,aktif,olusturma) VALUES(?,?,?,?,?,?,NULL,'0500 000 00 00',1,?)", id, kad, ad, s, rol, sb, t);
    const arac = [
      ['a1', S.cankaya, '06 DC 001', 'Örnek Sedan', 'B'], ['a2', S.cankaya, '06 DC 002', 'Örnek Hatchback', 'B'],
      ['a5', S.cankaya, '06 DC 005', 'Örnek Otomatik', 'B Otomatik'], ['a3', S.kecioren, '06 DC 003', 'Örnek Motosiklet', 'A2'],
      ['a6', S.kecioren, '06 DC 006', 'Örnek Sedan', 'B'], ['a4', S.merkez, '06 DC 004', 'Örnek Sedan', 'B'],
    ];
    for (const a of arac) run('INSERT INTO araclar(id,sube_id,plaka,model,sinif,aktif) VALUES(?,?,?,?,?,1)', ...a);
    arac.forEach(([id], i) => run('UPDATE araclar SET km=?, muayene=?, sigorta=?, kasko=?, bakim=?, bakim_km=? WHERE id=?',
      42000 + i * 9100, gunEkle(i === 0 ? 9 : 200 + i * 20), gunEkle(i === 3 ? -2 : 120 + i * 15), gunEkle(150 + i * 10), gunEkle(i === 1 ? 5 : 60 + i * 7), 50000 + i * 9100 + (i === 2 ? -8600 : 0), id));
    run("INSERT INTO personel_belgeleri(id,kullanici_id,tur,no,bitis,notlar,kaydeden,olusturma) VALUES('pb1','k-egitmen1','Usta öğretici belgesi','ÖRN-0001',?,'','Örnek',?)", gunEkle(400), t);
    run("INSERT INTO personel_belgeleri(id,kullanici_id,tur,no,bitis,notlar,kaydeden,olusturma) VALUES('pb2','k-egitmen2','Sağlık raporu','',?,'','Örnek',?)", gunEkle(20), t);
    run("INSERT INTO izinler(id,kullanici_id,bas,bit,tur,aciklama,kaydeden,olusturma) VALUES('iz1','k-egitmen3',?,?,'Yıllık izin','','Örnek',?)", gunEkle(10), gunEkle(14), t);

    // Dönemler ve teorik gruplar
    const ay = bugun.slice(0, 7);
    const oncekiAy = gunEkle(-30).slice(0, 7);
    run('INSERT INTO donemler(id,ad,bas,bit,olusturma) VALUES(?,?,?,?,?)', 'd-once', `${oncekiAy} dönemi`, oncekiAy + '-01', oncekiAy + '-28', t);
    run('INSERT INTO donemler(id,ad,bas,bit,olusturma) VALUES(?,?,?,?,?)', 'd-simdi', `${ay} dönemi`, ay + '-01', ay + '-28', t);
    run('INSERT INTO teorik_gruplar(id,sube_id,donem_id,ad,derslik,egitmen_id,aktif,olusturma) VALUES(?,?,?,?,?,?,1,?)', 'g-cankaya', S.cankaya, 'd-simdi', 'Çankaya Akşam Grubu', 'Derslik 1', 'k-egitmen2', t);
    run('INSERT INTO teorik_gruplar(id,sube_id,donem_id,ad,derslik,egitmen_id,aktif,olusturma) VALUES(?,?,?,?,?,?,1,?)', 'g-kecioren', S.kecioren, 'd-simdi', 'Keçiören Hafta Sonu', 'Derslik A', 'k-egitmen3', t);

    const adlar = ['Hakan', 'İrem', 'Kerem', 'Leyla', 'Mert', 'Nazlı', 'Onur', 'Pelin', 'Rıza', 'Selin', 'Tuna', 'Umay', 'Volkan', 'Yeşim', 'Zafer', 'Ahu', 'Bora', 'Ceren'];
    const soyadlar = ['Deneme', 'Örnek', 'Uydurma', 'Sınama', 'Taslak'];
    const egitmenOf = { [S.cankaya]: ['k-egitmen1', 'k-egitmen2'], [S.kecioren]: ['k-egitmen3'], [S.merkez]: ['k-egitmen4'] };
    const aracOf = { [S.cankaya]: 'a1', [S.kecioren]: 'a6', [S.merkez]: 'a4' };
    const ogrenciler = [];
    adlar.forEach((ad, i) => {
      const id = 'o' + (i + 1);
      const sb = i < 9 ? S.cankaya : i < 14 ? S.kecioren : S.merkez;
      const sinif = i === 2 ? 'B Otomatik' : i === 10 ? 'A2' : 'B';
      const eg = i === 16 ? null : sec(egitmenOf[sb]);
      const kayitGun = -(10 + Math.floor(rnd() * 70));
      const ucret = sinif === 'A2' ? 1000000 : sinif === 'B Otomatik' ? 1800000 : 1500000;
      const pesinat = [0, 300000, 500000, ucret][Math.floor(rnd() * 4)];
      const n = pesinat === ucret ? 0 : 1 + Math.floor(rnd() * 5);
      run(`INSERT INTO ogrenciler(id,sube_id,ad,soyad,tc,telefon,dogum,adres,sinif,kayit_tarihi,durum,ucret,egitmen_id,portal_sifre,portal_sifre_gecici,notlar,olusturma,mevcut_ehliyet,donem_id,eposta)
        VALUES(?,?,?,?,?,?,?,?,?,?,'aktif',?,?,?,0,'',?,'',?,'')`,
        id, sb, ad, sec(soyadlar), tcUret(String(100000000 + i + 1)), `0500 000 00 ${String(i + 1).padStart(2, '0')}`, `200${i % 8}-0${1 + (i % 9)}-1${i % 9}`,
        'Uydurma Mah. Örnek Sok.', sinif, gunEkle(kayitGun), ucret, eg, i === 0 ? sifreOzet(ORNEK.ogrenciSifre) : null, t, kayitGun < -40 ? 'd-once' : 'd-simdi');
      for (const x of taksitPlani(ucret, pesinat, n, gunEkle(kayitGun + 30), gunEkle(kayitGun))) run('INSERT INTO taksitler VALUES(?,?,?,?)', randomUUID(), id, x.vade, x.tutar);
      let no = 0;
      const makbuz = () => `${bugun.slice(0, 4)}-${String(i * 10 + ++no).padStart(6, '0')}`;
      if (pesinat) run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,'nakit','Peşinat','Örnek',?,'odeme',?)", randomUUID(), id, sb, pesinat, gunEkle(kayitGun), t, makbuz());
      if (rnd() > 0.5 && pesinat < ucret) run("INSERT INTO odemeler(id,ogrenci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma,tur,makbuz_no) VALUES(?,?,?,?,?,?,'1. taksit','Örnek',?,'odeme',?)", randomUUID(), id, sb, Math.min(300000, ucret - pesinat), gunEkle(-1 - Math.floor(rnd() * 5)), sec(['nakit', 'kart', 'havale']), t, makbuz());
      ogrenciler.push({ id, sb, eg, sinif, kayitGun });
    });
    for (const o of ogrenciler) {
      if (o.sb === S.cankaya && o.id !== 'o3') run('INSERT INTO grup_uyeleri VALUES(?,?)', 'g-cankaya', o.id);
      if (o.sb === S.kecioren) run('INSERT INTO grup_uyeleri VALUES(?,?)', 'g-kecioren', o.id);
    }
    // Teorik oturumlar ve yoklama
    const konular = ['Trafik ve Çevre', 'İlk Yardım', 'Araç Tekniği'];
    for (let i = 0; i < 6; i++) {
      const oid = randomUUID();
      run('INSERT INTO teorik_oturumlar(id,grup_id,sube_id,tarih,saat,ders_saati,konu,egitmen_id,durum,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        oid, 'g-cankaya', S.cankaya, gunEkle(-18 + i * 3), '18:30', 3, konular[i % 3], 'k-egitmen2', 'yapildi', 'Örnek', t);
      for (const o of ogrenciler.filter((x) => x.sb === S.cankaya && x.id !== 'o3'))
        run('INSERT INTO yoklamalar(id,oturum_id,ogrenci_id,durum) VALUES(?,?,?,?)', randomUUID(), oid, o.id, rnd() > 0.15 ? 'geldi' : 'gelmedi');
    }
    run('INSERT INTO teorik_oturumlar(id,grup_id,sube_id,tarih,saat,ders_saati,konu,egitmen_id,durum,kaydeden,olusturma) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      randomUUID(), 'g-cankaya', S.cankaya, bugun, '18:30', 3, 'İlk Yardım', 'k-egitmen2', 'planli', 'Örnek', t);

    // Direksiyon dersleri
    const ders = (o, gunN, sa, durum) => run('INSERT INTO dersler(id,ogrenci_id,sube_id,egitmen_id,arac_id,tur,tarih,saat,sure_dk,durum,kaydeden,tamamlanma,olusturma) VALUES(?,?,?,?,?,?,?,?,50,?,?,?,?)',
      randomUUID(), o.id, o.sb, o.eg, o.id === 'o3' ? 'a5' : aracOf[o.sb], 'direksiyon', gunEkle(gunN), sa, durum, 'Örnek', durum === 'planli' ? null : t, t);
    const saatler = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
    ogrenciler.forEach((o, i) => {
      if (!o.eg) return;
      const yapilan = i === 1 ? 14 : Math.floor(rnd() * 10);
      for (let j = 0; j < yapilan; j++) ders(o, -Math.max(1, Math.floor(-o.kayitGun * (1 - j / (yapilan + 1)))), saatler[(i + j) % saatler.length], i === 1 || rnd() > 0.1 ? 'tamamlandi' : 'gelmedi');
    });
    // Bugün ve yarın planlı dersler (eğitmen başına saatleri ayrı)
    const kullanilan = new Set();
    ogrenciler.forEach((o, i) => {
      if (!o.eg || i === 1) return;
      for (const g of [0, 1]) {
        const sa = saatler.find((x) => !kullanilan.has(`${o.eg}${g}${x}`) && !kullanilan.has(`${o.id === 'o3' ? 'a5' : aracOf[o.sb]}${g}${x}`));
        if (!sa || rnd() < 0.3) continue;
        kullanilan.add(`${o.eg}${g}${sa}`); kullanilan.add(`${o.id === 'o3' ? 'a5' : aracOf[o.sb]}${g}${sa}`);
        ders(o, g, sa, 'planli');
      }
    });
    // Sınavlar
    const sinav = (o, tur, gunN, deneme, sonuc, puan) => run('INSERT INTO sinavlar(id,ogrenci_id,sube_id,tur,tarih,saat,deneme,sonuc,puan,kaydeden,olusturma,yer,harc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      randomUUID(), o.id, o.sb, tur, gunEkle(gunN), '09:00', deneme, sonuc, puan, 'Örnek', t, 'Örnek Sınav Merkezi', 0);
    const o = (id) => ogrenciler.find((x) => x.id === id);
    sinav(o('o1'), 'e_sinav', -15, 1, 'kaldi', 62); sinav(o('o1'), 'e_sinav', -3, 2, 'gecti', 84);
    sinav(o('o2'), 'e_sinav', -30, 1, 'gecti', 90); sinav(o('o2'), 'direksiyon', 3, 1, 'bekliyor', null);
    sinav(o('o4'), 'e_sinav', -20, 1, 'gecti', 76); sinav(o('o5'), 'e_sinav', 5, 1, 'bekliyor', null);
    sinav(o('o11'), 'e_sinav', -8, 1, 'kaldi', 58); sinav(o('o12'), 'e_sinav', 2, 1, 'bekliyor', null);
    run("INSERT INTO ucret_kalemleri(id,ogrenci_id,sube_id,tur,aciklama,tutar,tarih,kaydeden,olusturma) VALUES(?,?,?,'sinav_tekrar','E-sınav 2. hak tekrar ücreti',100000,?,'Örnek',?)", randomUUID(), 'o1', S.cankaya, gunEkle(-10), t);

    // Tedarikçiler ve giderler
    run("INSERT INTO tedarikciler(id,ad,telefon,vergi_no,notlar,aktif,olusturma) VALUES('t1','Örnek Akaryakıt','0312 111 11 11','','Aylık cari',1,?)", t);
    run("INSERT INTO tedarikciler(id,ad,telefon,vergi_no,notlar,aktif,olusturma) VALUES('t2','Deneme Oto Servis','0312 222 22 22','','',1,?)", t);
    const gider = (sb, tutar, gunN, kategori, aciklama, ted = null, veresiye = 0) => run('INSERT INTO giderler(id,sube_id,tutar,tarih,kategori,aciklama,kaydeden,olusturma,yontem,tedarikci_id,veresiye) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      randomUUID(), sb, tutar, gunEkle(gunN), kategori, aciklama, 'Örnek', t, veresiye ? 'veresiye' : 'nakit', ted, veresiye);
    gider(S.cankaya, 450000, -12, 'Yakıt', 'Ay başı yakıt', 't1', 1);
    gider(S.cankaya, 250000, -2, 'Yakıt', 'Ek yakıt', 't1', 1);
    gider(S.kecioren, 380000, -7, 'Araç bakım', 'Periyodik bakım', 't2', 1);
    gider(S.cankaya, 1500000, -20, 'Kira', 'Şube kirası');
    gider(S.merkez, 85000, -4, 'Kırtasiye', 'Kağıt, toner');
    run("INSERT INTO tedarikci_odemeleri(id,tedarikci_id,sube_id,tutar,tarih,yontem,aciklama,kaydeden,olusturma) VALUES(?,'t1',?,300000,?,'havale','Kısmi ödeme','Örnek',?)", randomUUID(), S.cankaya, gunEkle(-5), t);
    // İkinci aşama bölümleri için birkaç örnek: kayıt kaynağı, kişisel veri onayı, adaylar, banka hesabı, senet, karne.
    const kaynaklar = ['Tavsiye (tanıdık)', 'İnternet araması', 'Sosyal medya', 'Tabela / yoldan geçerken', 'Eski öğrencimiz'];
    ogrenciler.forEach((o, i) => run('UPDATE ogrenciler SET kaynak=?, kvkk_onay=? WHERE id=?', kaynaklar[i % kaynaklar.length],
      i % 4 === 3 ? '' : JSON.stringify({ tarih: t, kaydeden: 'Örnek', surum: 1, yol: 'kayıt' }), o.id));
    const aday = (id, sb, ad, soyad, tel, sinif, kaynak, durum, sonraki, onKayit, notlar) => run(`INSERT INTO adaylar(id,sube_id,ad,soyad,telefon,eposta,sinif,kaynak,fiyat,durum,sonraki_arama,notlar,on_kayit,kaydeden,olusturma)
      VALUES(?,?,?,?,?,'',?,?,?,?,?,?,?,?,?)`, id, sb, ad, soyad, tel, sinif, kaynak, 1500000, durum, sonraki, notlar, onKayit, onKayit ? 'İnternetten ön kayıt' : 'Canan Büro', t);
    aday('ad1', S.cankaya, 'Efe', 'Aday', '05000000091', 'B', 'Sosyal medya', 'gorusuluyor', bugun, 0, 'Hafta sonu grubu soruyor');
    aday('ad2', null, 'Gizem', 'Başvuru', '05000000092', 'B Otomatik', 'İnternet (ön kayıt)', 'yeni', bugun, 1, '');
    aday('ad3', S.kecioren, 'Hasan', 'Adaylık', '05000000093', 'A2', 'Tavsiye (tanıdık)', 'gorusuluyor', gunEkle(3), 0, 'Fiyat verildi, düşünecek');
    run("INSERT INTO aday_notlari(id,aday_id,metin,kaydeden,zaman) VALUES('an1','ad1','Arandı, fiyat verildi','Canan Büro',?)", t);
    run("INSERT INTO banka_hesaplari(id,ad,banka,iban,sube_id,acilis,aktif,olusturma) VALUES('bh1','Merkez vadesiz','Örnek Bank','',NULL,2500000,1,?)", t);
    run("INSERT INTO banka_hesaplari(id,ad,banka,iban,sube_id,acilis,aktif,olusturma) VALUES('bh2','Çankaya POS','Örnek Bank','',?,0,1,?)", S.cankaya, t);
    run("INSERT INTO senetler(id,ogrenci_id,sube_id,tur,no,banka,borclu,vade,tutar,durum,aciklama,kaydeden,olusturma) VALUES('sn1','o4',?,'senet','S-0001','','Leyla Örnek',?,300000,'portfoy','','Örnek',?)", S.cankaya, gunEkle(5), t);
    const karneKonu = ['Araç kontrolü ve hazırlık', 'Kalkış ve duruş', 'Vites ve debriyaj', 'Direksiyon hakimiyeti', 'Paralel park', 'Şehir içi trafikte sürüş'];
    c.q("SELECT id, ogrenci_id FROM dersler WHERE ogrenci_id='o2' AND durum='tamamlandi' ORDER BY tarih").forEach((d, i) => {
      const p = {};
      for (let j = 0; j <= Math.min(i, karneKonu.length - 1); j++) p[karneKonu[j]] = Math.min(5, 2 + Math.floor((i - j) / 2));
      run('INSERT INTO ders_karneleri(ders_id,ogrenci_id,puanlar,notu,kaydeden,zaman) VALUES(?,?,?,?,?,?)', d.id, d.ogrenci_id, JSON.stringify(p), i === 13 ? 'Sınava hazır, park biraz daha çalışılmalı' : '', 'Deniz Eğitmen', t);
    });
    run("UPDATE ogrenciler SET sinava_hazir=? WHERE id='o2'", JSON.stringify({ tarih: gunEkle(-1), kim: 'Deniz Eğitmen', notu: '' }));
    run("INSERT INTO olaylar(zaman,sube_id,kullanici,tur,metin) VALUES(?,NULL,'Sistem','sistem','Örnek kurum hazırlandı (bütün veriler uydurmadır)')", t);
  });
}
