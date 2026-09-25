// Düğmelerin açtığı işlemler (form pencereleri). Bütün kurallar sunucuda da denetlenir.
import { islem, konumAl } from './api';
import { bildir, pencere, onayla, icerikPenceresi, type Alan } from './bilesenler/ortak';
import { yardimcilar, type Baglam } from './baglam';
import { gunEkle, tl, tarih, YONTEM, DURUM_OGR, DURUM_SINAV, SINAV_AD, whatsapp, resitDegil } from './yardim';
import type { Ders, Ogrenci, Personel, Sinav, Senet, BankaHesap, Aday, Arac } from './tipler';
import { KarneFormu } from './bilesenler/KarneFormu';
import { makbuzYazdir, sozlesmeYazdir } from './yazdir';

export function eylemler(b: Baglam) {
  const y = yardimcilar(b);
  const { v } = b;
  const tamamla = async (mesaj?: string) => { await b.yenile(); if (mesaj) bildir(mesaj, 'tamam'); };
  const odemeYontemleri = Object.entries(YONTEM).filter(([k]) => ['nakit', 'kart', 'havale'].includes(k)) as [string, string][];

  function ogrenciSor(baslik: string, filtre: (o: Ogrenci) => boolean, devam: (id: string) => void, id?: string) {
    if (id) return devam(id);
    const l = y.ogrenciSecenek(filtre);
    if (!l.length) return bildir('Uygun aktif öğrenci yok.', 'hata');
    pencere(baslik, [{ ad: 'ogrenciId', etiket: 'Öğrenci', tip: 'select', secenekler: l, zorunlu: true }], (d) => { setTimeout(() => devam(d.ogrenciId), 0); }, { dugme: 'Devam' });
  }
  async function konumluGovde(g: Record<string, unknown>) {
    if (!v.tanimlar.konumKaydi) return g;
    const konum = await konumAl();
    return konum ? { ...g, konum } : g;
  }

  // Kasası kapatılmış güne giriş için gerekçe (yalnız yönetici görür; gerekmedikçe boş bırakılır).
  const gerekceAlani: Alan[] = v.ben.rol === 'yonetici' ? [{ ad: 'gerekce', etiket: 'Kapalı güne giriş gerekçesi', not: 'Yalnız kasası kapatılmış bir güne nakit kayıt girerken gerekir.' }] : [];
  const hesapSecenek = (): [string, string][] => [['', 'Seçilmedi'], ...(v.bankaHesaplari || []).filter((h) => h.aktif).map((h): [string, string] => [h.id, `${h.ad}${h.banka ? ` (${h.banka})` : ''}`])];
  const hesapAlani = (gizle: (x: Record<string, any>) => boolean): Alan[] => (v.bankaHesaplari || []).some((h) => h.aktif)
    ? [{ ad: 'hesapId', etiket: 'Banka hesabı / POS', tip: 'select', secenekler: hesapSecenek(), gizle }] : [];

  const E = {
    // ------------------------------------------------------------------ Dersler
    async dersTamam(d: Ders) {
      const r = await islem('ders_sonuc', await konumluGovde({ id: d.id, durum: 'tamamlandi' }), { kuyruk: true, aciklama: `${y.ogrAd(d.ogrenci_id)} dersi tamamlandı` });
      if (r.sirada) { d.durum = 'tamamlandi'; bildir('İnternet yok. Kayıt telefonda bekliyor, bağlantı gelince merkeze gönderilecek.', 'hata'); b.yerel(); }
      else {
        await tamamla('Ders tamamlandı olarak kaydedildi.');
        // Direksiyon dersinden sonra eğitmen karneyi doldurabilir (isteğe bağlı).
        if (d.tur === 'direksiyon' && (d.egitmen_id === v.ben.id || y.hak('ders'))) E.karne(d.id, d.ogrenci_id);
      }
    },
    // Direksiyon eğitim karnesi: konuları 1-5 puanla, not düş.
    karne(dersId: string, ogrenciId: string) {
      const onceki = (b.v.karneler || []).find((k) => k.ders_id === dersId);
      icerikPenceresi(`Ders karnesi · ${y.ogrAd(ogrenciId)}`, <KarneFormu konular={v.tanimlar.karneKonulari} onceki={onceki}
        kaydet={async (puanlar, notu) => { await islem('karne_kaydet', { dersId, puanlar, notu }); await tamamla('Karne kaydedildi.'); }} />, false);
    },
    sinavaHazir(o: Ogrenci) {
      const hazir = !!o.sinava_hazir;
      pencere(hazir ? 'Sınava hazır işaretini kaldır' : 'Direksiyon sınavına hazır', [
        { tip: 'bilgi', html: hazir ? `${o.ad} ${o.soyad} ${o.sinava_hazir!.tarih} tarihinde ${o.sinava_hazir!.kim} tarafından hazır işaretlenmiş.` : `${o.ad} ${o.soyad} direksiyon sınavına hazır olarak işaretlenecek. Büro sınav kaydını buna göre yapar.` },
        ...(hazir ? [] : [{ ad: 'notu', etiket: 'Not (isteğe bağlı)' } as Alan]),
      ], async (g) => { await islem('sinava_hazir', { ogrenciId: o.id, hazir: !hazir, notu: g.notu }); await tamamla(); }, { dugme: hazir ? 'Kaldır' : 'Hazır' });
    },
    // Planlı dersin gününü, saatini, eğitmenini ya da aracını değiştir.
    dersTasi(d: Ders) {
      const o = y.ogr(d.ogrenci_id);
      pencere(`Dersi taşı · ${y.ogrAd(d.ogrenci_id)}`, [
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: d.tarih, zorunlu: true }, { ad: 'saat', etiket: 'Saat', tip: 'time', deger: d.saat, zorunlu: true },
        ...(y.hak('ders') ? [{ ad: 'egitmenId', etiket: 'Eğitmen', tip: 'select', secenekler: y.egitmenSecenek(d.sube_id, 'Seçilmedi', d.tarih), deger: d.egitmen_id || '' } as Alan] : []),
        ...(d.tur === 'direksiyon' ? [{ ad: 'aracId', etiket: 'Araç', tip: 'select', secenekler: y.aracSecenek(d.sube_id, o?.sinif), deger: d.arac_id || '' } as Alan] : []),
      ], async (g) => { await islem('ders_tasi', { id: d.id, ...g }); await tamamla('Ders taşındı.'); }, { ikili: true });
    },
    // Eğitmen hastalandı / araç arızalandı: tarih aralığındaki dersleri başka eğitmene ya da araca aktar.
    topluAktar(varsayilan: { kaynakEgitmenId?: string; kaynakAracId?: string; bas?: string; bit?: string } = {}) {
      const sube = y.varsayilanSube();
      const egitmenler = v.personel.filter((p) => ['egitmen', 'sube_muduru', 'yonetici'].includes(p.rol) && (p.aktif ?? 1)).map((p): [string, string] => [p.id, `${p.ad}${p.sube_id ? ` (${y.subeAd(p.sube_id)})` : ''}`]);
      const araclar = y.subeSuz(v.araclar).filter((a) => a.aktif).map((a): [string, string] => [a.id, `${a.plaka} (${y.subeAd(a.sube_id)})`]);
      pencere('Dersleri toplu aktar', [
        { tip: 'bilgi', html: 'Seçilen tarihlerdeki planlı dersler yeni eğitmene ve/veya araca aktarılır. Yeni eğitmenin ya da aracın o saatte dersi varsa o ders aktarılmaz ve size listelenir.' },
        { ad: 'bas', etiket: 'Başlangıç', tip: 'date', deger: varsayilan.bas || v.bugun, zorunlu: true }, { ad: 'bit', etiket: 'Bitiş', tip: 'date', deger: varsayilan.bit || varsayilan.bas || v.bugun, zorunlu: true },
        { ad: 'kaynakEgitmenId', etiket: 'Dersleri alınacak eğitmen', tip: 'select', secenekler: [['', 'Seçilmedi'], ...egitmenler], deger: varsayilan.kaynakEgitmenId || '' },
        { ad: 'kaynakAracId', etiket: 'Dersleri alınacak araç', tip: 'select', secenekler: [['', 'Seçilmedi'], ...araclar], deger: varsayilan.kaynakAracId || '' },
        { ad: 'hedefEgitmenId', etiket: 'Yeni eğitmen', tip: 'select', secenekler: [['', 'Değişmesin'], ...egitmenler] },
        { ad: 'hedefAracId', etiket: 'Yeni araç', tip: 'select', secenekler: [['', 'Değişmesin'], ...araclar] },
      ], async (g) => {
        const r = await islem<{ aktarilan: number; atlanan: { tarih: string; saat: string; ogrenci: string; neden: string }[] }>('ders_toplu_aktar', { ...g, subeId: sube });
        await tamamla(`${r.aktarilan} ders aktarıldı.`);
        if (r.atlanan.length) setTimeout(() => icerikPenceresi('Aktarılamayan dersler', (
          <div><p className="soluk kucuk">Bu dersleri tek tek taşıyın ya da başka bir eğitmen/araç seçin.</p>
            <ul className="liste">{r.atlanan.map((x, i) => <li key={i}><b>{tarih(x.tarih)} {x.saat}</b> {x.ogrenci} <span className="soluk kucuk">· {x.neden}</span></li>)}</ul></div>
        ), false, true), 50);
      }, { ikili: true });
    },
    aracAriza(a: Arac) {
      if (a.ariza) return onayla(`${a.plaka} yeniden kullanıma alınsın mı? (${a.ariza})`, async () => { await islem('arac_ariza', { id: a.id, bitir: true }); await tamamla('Araç kullanımda.'); }, 'Kullanıma al');
      pencere(`Arıza / kullanım dışı · ${a.plaka}`, [
        { ad: 'aciklama', etiket: 'Ne oldu?', zorunlu: true }, { ad: 'bas', etiket: 'Başlangıç', tip: 'date', deger: v.bugun },
        { ad: 'bit', etiket: 'Tahmini bitiş (bilinmiyorsa boş)', tip: 'date' },
        { tip: 'bilgi', html: 'Arızalı araca bu tarihlerde ders planlanamaz. Planlı dersler varsa sonraki adımda başka araca aktarabilirsiniz.' },
      ], async (g) => {
        const r = await islem<{ etkilenen: number }>('arac_ariza', { id: a.id, ...g });
        await tamamla('Arıza kaydedildi.');
        if (r.etkilenen && y.hak('ders')) setTimeout(() => E.topluAktar({ kaynakAracId: a.id, bas: g.bas || v.bugun, bit: g.bit || gunEkle(v.bugun, 30) }), 50);
        else if (r.etkilenen) bildir(`${r.etkilenen} planlı ders başka araca aktarılmalı; ders yetkisi olan personele haber verin.`, 'hata');
      });
    },
    aracKm(a: Arac) {
      pencere(`Kilometre · ${a.plaka}`, [{ ad: 'km', etiket: 'Güncel kilometre', tip: 'number', deger: a.km ?? '', zorunlu: true }],
        async (g) => { await islem('arac_km', { id: a.id, km: g.km }); await tamamla('Kilometre kaydedildi.'); });
    },
    dersGelmedi(d: Ders) {
      pencere('Öğrenci gelmedi', [{ ad: 'notu', etiket: 'Not (isteğe bağlı)', tip: 'textarea' }], async (g) => {
        const r = await islem('ders_sonuc', { id: d.id, durum: 'gelmedi', notu: g.notu }, { kuyruk: true, aciklama: `${y.ogrAd(d.ogrenci_id)} gelmedi` });
        if (r.sirada) { d.durum = 'gelmedi'; bildir('İnternet yok. Kayıt telefonda bekliyor.', 'hata'); b.yerel(); } else await tamamla();
      });
    },
    dersDurum(d: Ders) {
      pencere('Ders durumunu değiştir', [
        { ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: [['planli', 'Planlı'], ['tamamlandi', 'Tamamlandı'], ['gelmedi', 'Gelmedi'], ['iptal', 'İptal']], deger: d.durum },
        { ad: 'notu', etiket: 'Not', tip: 'textarea', deger: d.notu },
      ], async (g) => { await islem('ders_sonuc', { id: d.id, ...g }); await tamamla(); });
    },
    dersSaha(id?: string) {
      ogrenciSor('Yapılan ders', (o) => y.hak('ders') || o.egitmen_id === v.ben.id, (ogrenciId) => {
        const o = y.ogr(ogrenciId)!;
        pencere(`Yapılan ders · ${o.ad} ${o.soyad}`, [
          { tip: 'bilgi', html: <>Ders şu anki saatle <b>tamamlandı</b> olarak kaydedilir ve merkeze anında düşer. İnternet yoksa telefonunuzda bekler.</> },
          { ad: 'dersTuru', etiket: 'Ders türü', tip: 'select', secenekler: [['direksiyon', 'Direksiyon'], ['teorik', 'Teorik']] },
          { ad: 'aracId', etiket: 'Araç', tip: 'select', secenekler: y.aracSecenek(o.sube_id, o.sinif), gizle: (x) => x.dersTuru !== 'direksiyon' },
          { ad: 'sureDk', etiket: 'Süre (dakika)', tip: 'number', deger: v.tanimlar.dersSuresi },
          { ad: 'notu', etiket: 'Not', tip: 'textarea' },
        ], async (g) => {
          const r = await islem('ders_saha', await konumluGovde({ ogrenciId, ...g }), { kuyruk: true, aciklama: `${o.ad} ${o.soyad} yapılan ders` });
          if (r.sirada) { bildir('İnternet yok. Kayıt telefonda bekliyor, bağlantı gelince gönderilecek.', 'hata'); b.yerel(); }
          else await tamamla('Ders kaydedildi, merkeze iletildi.');
        });
      }, id);
    },
    dersPlanla(id?: string, varsayilan: { tarih?: string; saat?: string; egitmenId?: string } = {}) {
      ogrenciSor('Ders planla', (o) => y.hak('ders') || o.egitmen_id === v.ben.id, (ogrenciId) => {
        const o = y.ogr(ogrenciId)!;
        const t = varsayilan.tarih || v.bugun;
        const alanlar: Alan[] = [
          { ad: 'dersTuru', etiket: 'Ders türü', tip: 'select', secenekler: [['direksiyon', 'Direksiyon'], ['teorik', 'Teorik (bireysel)']] },
          ...(y.hak('ders') ? [{ ad: 'egitmenId', etiket: 'Eğitmen', tip: 'select', secenekler: y.egitmenSecenek(o.sube_id, 'Seçilmedi', t), deger: varsayilan.egitmenId || o.egitmen_id || '' } as Alan] : []),
          { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: t, zorunlu: true },
          { ad: 'saat', etiket: 'Saat', tip: 'time', deger: varsayilan.saat || '09:00', zorunlu: true },
          { ad: 'sureDk', etiket: 'Süre (dakika)', tip: 'number', deger: v.tanimlar.dersSuresi },
          { ad: 'aracId', etiket: 'Araç', tip: 'select', secenekler: y.aracSecenek(o.sube_id, o.sinif), gizle: (x) => x.dersTuru !== 'direksiyon' },
        ];
        pencere(`Ders planla · ${o.ad} ${o.soyad}`, alanlar, async (g) => { await islem('ders_planla', { ogrenciId, ...g }); await tamamla('Ders planlandı.'); }, { ikili: true });
      }, id);
    },
    // Aynı öğrenciye birkaç haftalık düzenli ders (ör. her salı ve perşembe 10:00)
    topluPlan(id?: string) {
      ogrenciSor('Toplu ders planla', () => y.hak('ders'), (ogrenciId) => {
        const o = y.ogr(ogrenciId)!;
        const kalan = Math.max(0, (v.tanimlar.siniflar[o.sinif]?.direksiyon || 0) - o.dersler.direksiyon);
        pencere(`Toplu ders planla · ${o.ad} ${o.soyad}`, [
          { tip: 'bilgi', html: <>Seçilen günlerde, aynı saatte direksiyon dersi planlanır. Dolu saatler atlanır. Paketten kalan ders: <b>{kalan}</b></> },
          { ad: 'egitmenId', etiket: 'Eğitmen', tip: 'select', secenekler: y.egitmenSecenek(o.sube_id), deger: o.egitmen_id || '', zorunlu: true },
          { ad: 'aracId', etiket: 'Araç', tip: 'select', secenekler: y.aracSecenek(o.sube_id, o.sinif) },
          { ad: 'bas', etiket: 'Başlangıç tarihi', tip: 'date', deger: gunEkle(v.bugun, 1), zorunlu: true },
          { ad: 'saat', etiket: 'Saat', tip: 'time', deger: '10:00', zorunlu: true },
          { ad: 'adet', etiket: 'Kaç ders?', tip: 'number', deger: Math.min(kalan || 4, 14), min: 1, max: 30 },
          { ad: 'gunler', etiket: 'Günler', tip: 'coklu', secenekler: [['1', 'Pazartesi'], ['2', 'Salı'], ['3', 'Çarşamba'], ['4', 'Perşembe'], ['5', 'Cuma'], ['6', 'Cumartesi'], ['0', 'Pazar']], deger: ['2', '4'] },
        ], async (g) => {
          if (!g.gunler.length) throw new Error('En az bir gün seçin.');
          let t = g.bas, n = 0, atla = 0, deneme = 0;
          while (n < g.adet && deneme < 120) {
            deneme++;
            if (g.gunler.includes(String(new Date(t + 'T12:00:00Z').getUTCDay()))) {
              try { await islem('ders_planla', { ogrenciId, dersTuru: 'direksiyon', egitmenId: g.egitmenId, aracId: g.aracId, tarih: t, saat: g.saat }); n++; }
              catch { atla++; }
            }
            t = gunEkle(t, 1);
          }
          await tamamla(`${n} ders planlandı${atla ? `, ${atla} dolu gün atlandı` : ''}.`);
        }, { ikili: true });
      }, id);
    },

    // ------------------------------------------------------------------ Öğrenci
    ogrenciEkle(varsayilan: { adayId?: string; subeId?: string; ad?: string; soyad?: string; telefon?: string; eposta?: string; sinif?: string; kaynak?: string; ucret?: number; kvkkOnay?: boolean } = {}) {
      const sube = varsayilan.subeId || y.varsayilanSube();
      const alanlar: Alan[] = [
        ...(v.ben.rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: y.subeSecenek(), deger: sube } as Alan] : []),
        { ad: 'sinif', etiket: 'Ehliyet sınıfı', tip: 'select', secenekler: y.sinifSecenek(), deger: varsayilan.sinif || 'B' },
        { ad: 'ad', etiket: 'Ad', zorunlu: true, deger: varsayilan.ad }, { ad: 'soyad', etiket: 'Soyad', zorunlu: true, deger: varsayilan.soyad },
        { ad: 'tc', etiket: 'T.C. kimlik no', zorunlu: true, tip: 'text' }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: varsayilan.telefon },
        { ad: 'dogum', etiket: 'Doğum tarihi', tip: 'date' }, { ad: 'kayitTarihi', etiket: 'Kayıt tarihi', tip: 'date', deger: v.bugun },
        { ad: 'mevcutEhliyet', etiket: 'Elindeki ehliyet (sınıf yükseltme için)', tip: 'select', secenekler: [['', 'Yok'], ...y.sinifSecenek()] },
        { ad: 'donemId', etiket: 'Dönem', tip: 'select', secenekler: [['', 'Seçilmedi'], ...v.donemler.map((d): [string, string] => [d.id, d.ad])], deger: v.donemler.find((d) => d.bas <= v.bugun && d.bit >= v.bugun)?.id || '' },
        { ad: 'egitmenId', etiket: 'Direksiyon eğitmeni', tip: 'select', secenekler: y.egitmenSecenek(sube), gizle: (x) => !!x.subeId && x.subeId !== sube },
        { ad: 'eposta', etiket: 'E-posta', tip: 'email', deger: varsayilan.eposta },
        { ad: 'kaynak', etiket: 'Bizi nereden duydu?', tip: 'select', secenekler: [['', 'Seçilmedi'], ...v.tanimlar.kaynaklar.map((k): [string, string] => [k, k])], deger: varsayilan.kaynak || '' },
        { ad: 'adres', etiket: 'Adres', genis: true },
        { tip: 'bilgi', html: '18 yaşından küçük adaylarda veli bilgisi zorunludur.', gizle: (x) => !resitDegil(x.dogum, x.kayitTarihi || v.bugun) },
        { ad: 'veliAd', etiket: 'Veli adı soyadı', gizle: (x) => !resitDegil(x.dogum, x.kayitTarihi || v.bugun) },
        { ad: 'veliTelefon', etiket: 'Veli telefonu', tip: 'tel', gizle: (x) => !resitDegil(x.dogum, x.kayitTarihi || v.bugun) },
        { ad: 'veliYakinlik', etiket: 'Yakınlığı', tip: 'select', secenekler: [['Anne', 'Anne'], ['Baba', 'Baba'], ['Vasi', 'Vasi'], ['Diğer', 'Diğer']], gizle: (x) => !resitDegil(x.dogum, x.kayitTarihi || v.bugun) },
        { ad: 'ucret', etiket: 'Kurs ücreti (₺)', tip: 'para', deger: varsayilan.ucret },
        ...(y.hak('tahsilat') ? [
          { ad: 'pesinat', etiket: 'Peşinat, şimdi alınan (₺)', tip: 'para' } as Alan,
          { ad: 'pesinatYontem', etiket: 'Peşinat ödeme şekli', tip: 'select', secenekler: odemeYontemleri } as Alan,
        ] : []),
        { ad: 'taksitSayisi', etiket: 'Kalan kaç taksit?', tip: 'number', deger: 1, min: 1, max: 24 },
        { ad: 'ilkVade', etiket: 'İlk taksit tarihi', tip: 'date', deger: gunEkle(v.bugun, 30) },
        { ad: 'portalSifre', etiket: 'Öğrenci giriş şifresi (isteğe bağlı)', not: 'En az 6 karakter. Öğrenci ilk girişte kendi şifresini belirler.' },
        { ad: 'notlar', etiket: 'Not', tip: 'textarea', genis: true },
        { ad: 'kvkkOnay', etiket: 'Kişisel verilerin işlenmesine ilişkin aydınlatma metni adaya okundu / verildi ve onayı alındı', tip: 'onay', deger: varsayilan.kvkkOnay ?? false, genis: true,
          not: 'Metin Ayarlar > Kişisel veri bölümündedir. Onay kaydı tarih ve alan kişiyle saklanır.' },
      ];
      pencere(varsayilan.adayId ? 'Adayı kayda dönüştür' : 'Yeni öğrenci kaydı', alanlar, async (g) => {
        if (!g.subeId) g.subeId = sube;
        if (g.subeId !== sube) g.egitmenId = '';
        const r = await islem<{ id: string }>(varsayilan.adayId ? 'aday_kayit' : 'ogrenci_ekle', varsayilan.adayId ? { adayId: varsayilan.adayId, ...g } : g);
        await tamamla('Öğrenci kaydedildi.');
        b.git('ogrenci', r.id);
      }, { ikili: true, genis: true });
    },
    ogrenciDuzenle(o: Ogrenci) {
      const hassas = y.hak('hassas');
      pencere('Öğrenci bilgisi', [
        { ad: 'ad', etiket: 'Ad', deger: o.ad, zorunlu: true }, { ad: 'soyad', etiket: 'Soyad', deger: o.soyad, zorunlu: true },
        ...(hassas ? [{ ad: 'tc', etiket: 'T.C. kimlik no', deger: o.tc, zorunlu: true } as Alan, { ad: 'dogum', etiket: 'Doğum tarihi', tip: 'date', deger: o.dogum } as Alan] : []),
        { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: o.telefon }, { ad: 'eposta', etiket: 'E-posta', tip: 'email', deger: o.eposta },
        { ad: 'sinif', etiket: 'Ehliyet sınıfı', tip: 'select', secenekler: y.sinifSecenek(), deger: o.sinif },
        { ad: 'mevcutEhliyet', etiket: 'Elindeki ehliyet', tip: 'select', secenekler: [['', 'Yok'], ...y.sinifSecenek()], deger: o.mevcut_ehliyet },
        { ad: 'egitmenId', etiket: 'Direksiyon eğitmeni', tip: 'select', secenekler: y.egitmenSecenek(o.sube_id), deger: o.egitmen_id || '' },
        { ad: 'donemId', etiket: 'Dönem', tip: 'select', secenekler: [['', 'Seçilmedi'], ...v.donemler.map((d): [string, string] => [d.id, d.ad])], deger: o.donem_id || '' },
        ...(hassas ? [{ ad: 'adres', etiket: 'Adres', deger: o.adres, genis: true } as Alan] : []),
        { ad: 'veliAd', etiket: 'Veli adı soyadı', deger: o.veli_ad }, { ad: 'veliTelefon', etiket: 'Veli telefonu', tip: 'tel', deger: o.veli_telefon },
        { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: o.notlar, genis: true },
      ], async (g) => { await islem('ogrenci_duzenle', { id: o.id, ...g }); await tamamla('Kaydedildi.'); }, { ikili: true, genis: true });
    },
    ogrenciDurum(o: Ogrenci) {
      pencere('Kayıt durumu', [
        { ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: Object.entries(DURUM_OGR).map(([k, [e]]): [string, string] => [k, e]), deger: o.durum },
        { tip: 'bilgi', html: 'Donduruldu veya İptal seçilirse öğrencinin planlı dersleri iptal edilir. Geçmiş kayıtlar silinmez.' },
      ], async (g) => { await islem('ogrenci_durum', { id: o.id, durum: g.durum }); await tamamla(); });
    },
    ogrenciPortal(o: Ogrenci) {
      const oneri = Math.random().toString(36).slice(2, 8);
      pencere('Öğrenci girişi', [
        { tip: 'bilgi', html: <>Öğrenci <b>T.C. kimlik numarası</b> ve bu şifreyle "Öğrenci girişi"nden girer; ilk girişte kendi şifresini belirler. Şu an: <b>{o.portal_acik ? 'açık' : 'kapalı'}</b>.</> },
        { ad: 'sifre', etiket: 'Yeni şifre (boş bırakırsanız giriş kapatılır)', deger: oneri, not: 'En az 6 karakter.' },
      ], async (g) => {
        await islem('ogrenci_portal', { id: o.id, sifre: g.sifre });
        await tamamla(g.sifre ? `Şifre kaydedildi: ${g.sifre}` : 'Öğrenci girişi kapatıldı.');
        if (g.sifre && o.telefon) window.open(whatsapp(o.telefon, `Merhaba ${o.ad}, ${v.kurum.ad} öğrenci girişi: ${location.origin}/?firma=${encodeURIComponent(new URL(location.href).searchParams.get('firma') || localStorage.getItem('dc_firma') || '')} · Kimlik no ile giriş, ilk şifreniz: ${g.sifre}`), '_blank', 'noopener');
      });
    },
    ogrenciNakil(o: Ogrenci) {
      pencere('Şubeler arası nakil', [
        { tip: 'bilgi', html: 'Öğrenci yeni şubeye geçer; eğitmeni boşaltılır ve planlı dersleri iptal edilir. Geçmiş ödeme, ders ve sınavlar eski şubenin hesabında kalır.' },
        { ad: 'subeId', etiket: 'Yeni şube', tip: 'select', secenekler: y.subeSecenek().filter(([id]) => id !== o.sube_id) },
      ], async (g) => { await islem('ogrenci_nakil', { id: o.id, subeId: g.subeId }); await tamamla('Nakil yapıldı.'); });
    },
    ogrenciUcret(o: Ogrenci) {
      const h = o.hesap!;
      pencere('Paket ücreti ve taksit planı', [
        { tip: 'bilgi', html: <>Ödenen: <b>{tl(h.odenen)}</b>. Ek kalemler (ek ders, sınav tekrarı, indirim) ayrı tutulur. Kalan paket tutarı yeni taksit sayısına eşit bölünür.</> },
        { ad: 'ucret', etiket: 'Paket kurs ücreti (₺)', tip: 'para', deger: h.paket, zorunlu: true },
        { ad: 'taksitSayisi', etiket: 'Kalan kaç taksit?', tip: 'number', deger: Math.max(1, h.taksitler.filter((t) => t.durum !== 'odendi' && !t.ek).length) },
        { ad: 'ilkVade', etiket: 'İlk taksit tarihi', tip: 'date', deger: h.siradaki?.vade || gunEkle(v.bugun, 30) },
      ], async (g) => { await islem('ogrenci_ucret', { id: o.id, ...g }); await tamamla(); });
    },
    kalemEkle(o: Ogrenci, tur = 'ek_ders') {
      const turler = Object.entries(v.tanimlar.kalemTurleri).filter(([k]) => y.hak('kasa') || k !== 'indirim') as [string, string][];
      const varsayilan: Record<string, number> = { ek_ders: v.tanimlar.ucretler.ekDers, sinav_tekrar: v.tanimlar.ucretler.sinavTekrar };
      pencere(`Ek ücret / indirim · ${o.ad} ${o.soyad}`, [
        { ad: 'tur', etiket: 'Tür', tip: 'select', secenekler: turler, deger: tur },
        { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', deger: varsayilan[tur] || 0, zorunlu: true },
        { ad: 'aciklama', etiket: 'Açıklama' },
      ], async (g) => { await islem('ucret_kalemi_ekle', { ogrenciId: o.id, ...g }); await tamamla('Borca işlendi.'); });
    },
    kalemIptal(id: string) { onayla('Bu kalem kaldırılsın mı?', async () => { await islem('ucret_kalemi_iptal', { id }); await tamamla(); }); },

    // ------------------------------------------------------------------ Para
    odemeAl(id?: string) {
      ogrenciSor('Ödeme al', (o) => (o.hesap?.kalan || 0) > 0, (ogrenciId) => {
        const o = y.ogr(ogrenciId)!;
        const h = o.hesap!;
        const oneri = h.geciken || (h.siradaki ? h.siradaki.tutar - h.siradaki.odenen : h.kalan);
        pencere(`Ödeme al · ${o.ad} ${o.soyad}`, [
          { tip: 'bilgi', html: <>Kalan borç: <b>{tl(h.kalan)}</b>{h.geciken ? <> · geciken <b>{tl(h.geciken)}</b></> : null}{h.siradaki ? <> · sıradaki taksit {tarih(h.siradaki.vade)}</> : null}</> },
          { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', deger: oneri, zorunlu: true },
          { ad: 'yontem', etiket: 'Ödeme şekli', tip: 'select', secenekler: odemeYontemleri },
          ...hesapAlani((x) => x.yontem === 'nakit'),
          { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun },
          { ad: 'aciklama', etiket: 'Açıklama' },
          ...gerekceAlani,
          { ad: 'yazdir', etiket: 'Kaydettikten sonra makbuz yazdır', tip: 'onay', deger: true },
        ], async (g) => {
          const yazdir = g.yazdir; delete g.yazdir;
          const r = await islem<{ id: string; makbuzNo: string }>('odeme_al', { ogrenciId, ...g });
          await tamamla(`Ödeme kaydedildi. Makbuz no: ${r.makbuzNo}`);
          if (yazdir) setTimeout(() => { const od = b.v.odemeler?.find((x) => x.id === r.id); if (od) makbuzYazdir(b.v, od, o); }, 300);
        });
      }, id);
    },
    iade(o: Ogrenci) {
      pencere(`İade · ${o.ad} ${o.soyad}`, [
        { tip: 'bilgi', html: <>Ödenen: <b>{tl(o.hesap?.odenen)}</b>. İade kasadan çıkış olarak işlenir.</> },
        { ad: 'tutar', etiket: 'İade tutarı (₺)', tip: 'para', zorunlu: true },
        { ad: 'yontem', etiket: 'İade şekli', tip: 'select', secenekler: odemeYontemleri },
        { ad: 'aciklama', etiket: 'İade nedeni', zorunlu: true },
        ...gerekceAlani,
      ], async (g) => { await islem('iade', { ogrenciId: o.id, ...g }); await tamamla('İade kaydedildi.'); });
    },
    odemeIptal(id: string) {
      pencere('Ödeme iptali', [{ tip: 'bilgi', html: 'Ödeme silinmez; iptal edildi olarak işaretlenir ve kasadan düşer.' }, { ad: 'neden', etiket: 'İptal nedeni', zorunlu: true }, ...gerekceAlani],
        async (g) => { await islem('odeme_iptal', { id, neden: g.neden }); await tamamla(); }, { dugme: 'İptal et', tehlike: true });
    },
    giderEkle(aracId?: string) {
      pencere('Gider gir', [
        ...(y.cokSube ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: y.subeSecenek(), deger: y.varsayilanSube() } as Alan] : []),
        { ad: 'kategori', etiket: 'Gider türü', tip: 'select', secenekler: ['Yakıt', 'Araç bakım', 'Araç muayene', 'Araç sigorta', 'Kira', 'Maaş', 'Prim', 'Fatura', 'Sınav ücreti', 'Kırtasiye', 'Reklam', 'Vergi', 'Diğer'].map((x): [string, string] => [x, x]) },
        { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', zorunlu: true },
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun },
        { ad: 'tedarikciId', etiket: 'Firma (tedarikçi)', tip: 'select', secenekler: [['', 'Yok'], ...(v.tedarikciler || []).filter((t) => t.aktif).map((t): [string, string] => [t.id, t.ad])] },
        { ad: 'veresiye', etiket: 'Veresiye (şimdi ödenmedi, firmaya borç yazılsın)', tip: 'onay', gizle: (x) => !x.tedarikciId },
        { ad: 'yontem', etiket: 'Ödeme şekli', tip: 'select', secenekler: odemeYontemleri, gizle: (x) => x.veresiye && x.tedarikciId },
        ...hesapAlani((x) => x.yontem === 'nakit' || (x.veresiye && x.tedarikciId)),
        { ad: 'aracId', etiket: 'Araç (varsa)', tip: 'select', secenekler: [['', 'Yok'], ...y.subeSuz(v.araclar).map((a): [string, string] => [a.id, a.plaka])], deger: aracId || '' },
        { ad: 'aciklama', etiket: 'Açıklama' },
        ...gerekceAlani,
      ], async (g) => { await islem('gider_ekle', { ...g, subeId: g.subeId || y.varsayilanSube(), veresiye: !!(g.veresiye && g.tedarikciId) }); await tamamla('Gider kaydedildi.'); }, { ikili: true });
    },
    giderIptal(id: string) {
      pencere('Gider iptali', [{ tip: 'bilgi', html: 'Gider silinmez; iptal edildi olarak işaretlenir.' }, ...gerekceAlani],
        async (g) => { await islem('gider_iptal', { id, ...g }); await tamamla(); }, { dugme: 'İptal et', tehlike: true });
    },
    tedarikciEkle(t?: { id: string; ad: string; telefon: string; vergi_no: string; notlar: string; aktif: number }) {
      pencere(t ? `Tedarikçi · ${t.ad}` : 'Tedarikçi ekle', [
        { ad: 'ad', etiket: 'Firma adı', deger: t?.ad, zorunlu: true }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: t?.telefon },
        { ad: 'vergiNo', etiket: 'Vergi no', deger: t?.vergi_no }, { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: t?.notlar },
        ...(t ? [{ ad: 'aktif', etiket: 'Kullanımda', tip: 'onay', deger: !!t.aktif } as Alan] : []),
      ], async (g) => { await islem(t ? 'tedarikci_duzenle' : 'tedarikci_ekle', t ? { id: t.id, ...g } : g); await tamamla(); });
    },
    tedarikciOdeme(tedarikciId?: string) {
      pencere('Tedarikçiye ödeme', [
        ...(y.cokSube ? [{ ad: 'subeId', etiket: 'Hangi şubenin kasasından', tip: 'select', secenekler: y.subeSecenek(), deger: y.varsayilanSube() } as Alan] : []),
        { ad: 'tedarikciId', etiket: 'Firma', tip: 'select', secenekler: (v.tedarikciler || []).map((t): [string, string] => [t.id, `${t.ad} (borç ${tl(t.bakiye)})`]), deger: tedarikciId, zorunlu: true },
        { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', zorunlu: true },
        { ad: 'yontem', etiket: 'Ödeme şekli', tip: 'select', secenekler: odemeYontemleri },
        ...hesapAlani((x) => x.yontem === 'nakit'),
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun }, { ad: 'aciklama', etiket: 'Açıklama' },
        ...gerekceAlani,
      ], async (g) => { await islem('tedarikci_odeme', { ...g, subeId: g.subeId || y.varsayilanSube() }); await tamamla('Ödeme kaydedildi.'); });
    },

    // ------------------------------------------------------------------ Sınav
    sinavEkle(id?: string) {
      ogrenciSor('Sınava yaz', () => true, (ogrenciId) => {
        const o = y.ogr(ogrenciId)!;
        const esGecti = v.sinavlar.some((s) => s.ogrenci_id === ogrenciId && s.tur === 'e_sinav' && s.sonuc === 'gecti');
        pencere(`Sınava yaz · ${o.ad} ${o.soyad}`, [
          ...(esGecti && !o.sinava_hazir ? [{ tip: 'bilgi', html: 'Eğitmeni bu öğrenciyi henüz "sınava hazır" olarak işaretlemedi.' } as Alan] : []),
          { ad: 'sinavTuru', etiket: 'Sınav türü', tip: 'select', secenekler: [['e_sinav', 'E-sınav (teorik)'], ['direksiyon', 'Direksiyon sınavı']], deger: esGecti ? 'direksiyon' : 'e_sinav' },
          { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: gunEkle(v.bugun, 7), zorunlu: true }, { ad: 'saat', etiket: 'Saat', tip: 'time' },
          { ad: 'yer', etiket: 'Sınav yeri' },
          ...(y.hak('tahsilat') ? [{ ad: 'harc', etiket: 'Sınav harcı (₺)', tip: 'para' } as Alan, { ad: 'harcBorca', etiket: 'Harcı öğrencinin borcuna ekle', tip: 'onay' } as Alan] : []),
          { tip: 'bilgi', html: v.tanimlar.ucretler.sinavTekrar ? <>Tekrar sınavlarında {tl(v.tanimlar.ucretler.sinavTekrar)} tekrar ücreti otomatik borca eklenir.</> : 'Tekrar ücreti ayarlarda sıfır.' },
        ], async (g) => { await islem('sinav_ekle', { ogrenciId, ...g }); await tamamla('Sınav kaydı yapıldı.'); });
      }, id);
    },
    sinavSonuc(s: Sinav) {
      pencere(`${SINAV_AD[s.tur]} sonucu · ${y.ogrAd(s.ogrenci_id)}`, [
        { ad: 'sonuc', etiket: 'Sonuç', tip: 'select', secenekler: Object.entries(DURUM_SINAV).map(([k, [e]]): [string, string] => [k, e]), deger: s.sonuc },
        ...(s.tur === 'e_sinav' ? [{ ad: 'puan', etiket: 'Puan (0-100)', tip: 'number', deger: s.puan ?? '', not: `Puan girilirse ${v.tanimlar.eSinavGecme} ve üstü "Geçti" sayılır.` } as Alan]
          : [{ tip: 'bilgi', html: 'Direksiyon sınavını geçen öğrencinin kaydı "Tamamlandı" olur.' } as Alan]),
        { ad: 'notu', etiket: 'Not', deger: s.notu },
      ], async (g) => { await islem('sinav_sonuc', { id: s.id, ...g }); await tamamla(); });
    },
    sinavDuzenle(s: Sinav) {
      pencere('Sınav tarihi', [
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: s.tarih, zorunlu: true }, { ad: 'saat', etiket: 'Saat', tip: 'time', deger: s.saat }, { ad: 'yer', etiket: 'Yer', deger: s.yer },
      ], async (g) => { await islem('sinav_duzenle', { id: s.id, ...g }); await tamamla(); });
    },

    // ------------------------------------------------------------------ Personel
    personel(p: Personel | null) {
      const yon = v.ben.rol === 'yonetici';
      const roller = Object.entries(v.tanimlar.roller).filter(([k]) => yon || ['buro', 'muhasebe', 'egitmen'].includes(k)) as [string, string][];
      const haklar = Object.entries(v.tanimlar.haklar).filter(([k]) => k !== 'personel') as [string, string][];
      const kendisi = p?.id === v.ben.id;
      const alanlar: Alan[] = [
        { ad: 'ad', etiket: 'Ad soyad', deger: p?.ad, zorunlu: true },
        ...(p ? [] : [{ ad: 'kullaniciAdi', etiket: 'Kullanıcı adı', zorunlu: true, not: 'Küçük harf, rakam, nokta. Örnek: ali.yilmaz' } as Alan]),
        { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: p?.telefon },
        ...(kendisi ? [] : [
          { ad: 'rol', etiket: 'Görev', tip: 'select', secenekler: roller, deger: p?.rol || 'egitmen' } as Alan,
          ...(yon ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: y.subeSecenek(), deger: p?.sube_id || y.varsayilanSube(), gizle: (x: any) => x.rol === 'yonetici' } as Alan] : []),
          { tip: 'bilgi', html: <>Yetkiler yalnız <b>büro</b>, <b>muhasebe</b> ve <b>eğitmen</b> için geçerlidir; yönetici ve şube müdürü her şeyi yapar. Kutusu boş eğitmen yalnız kendi öğrencilerini ve derslerini görür, para bilgisi görmez. Boş bırakırsanız görevin varsayılan yetkileri verilir.</>, gizle: (x: any) => ['yonetici', 'sube_muduru'].includes(x.rol) } as Alan,
          { ad: 'yetkiler', etiket: 'Yetkiler', tip: 'coklu', secenekler: haklar, deger: p?.haklar || [], gizle: (x: any) => ['yonetici', 'sube_muduru'].includes(x.rol) } as Alan,
        ]),
        { ad: p ? 'yeniSifre' : 'sifre', etiket: p ? 'Yeni şifre (değiştirmeyecekseniz boş bırakın)' : 'Şifre (en az 8 karakter)', zorunlu: !p },
        ...(p && !kendisi ? [{ ad: 'aktif', etiket: 'Giriş açık', tip: 'onay', deger: !!p.aktif } as Alan] : []),
      ];
      pencere(p ? `Personel · ${p.ad}` : 'Personel ekle', alanlar, async (g) => {
        if (!yon) g.subeId = v.ben.sube_id;
        if (!p && (!g.yetkiler || !g.yetkiler.length)) delete g.yetkiler;
        if (p) await islem('personel_duzenle', { id: p.id, ...g, yeniSifre: g.yeniSifre || undefined });
        else await islem('personel_ekle', g);
        await tamamla('Kaydedildi.');
      });
    },
    gorevlendir() {
      pencere('Başka şubeye görevlendirme', [
        { tip: 'bilgi', html: 'Eğitmen bu tarihler arasında seçilen şubede de ders verebilir. Kendi şubesindeki işi sürer.' },
        { ad: 'kullaniciId', etiket: 'Eğitmen', tip: 'select', secenekler: v.personel.filter((p) => ['egitmen', 'sube_muduru'].includes(p.rol) && p.aktif).map((p): [string, string] => [p.id, `${p.ad} (${y.subeAd(p.sube_id)})`]) },
        { ad: 'subeId', etiket: 'Görev yeri', tip: 'select', secenekler: y.subeSecenek() },
        { ad: 'bas', etiket: 'Başlangıç', tip: 'date', deger: v.bugun, zorunlu: true }, { ad: 'bit', etiket: 'Bitiş', tip: 'date', deger: gunEkle(v.bugun, 7), zorunlu: true },
        { ad: 'aciklama', etiket: 'Açıklama' },
      ], async (g) => { await islem('gorevlendir', g); await tamamla('Görevlendirme kaydedildi.'); });
    },

    sozlesme(o: Ogrenci) { sozlesmeYazdir(v, o); },

    // ------------------------------------------------------------------ Senet / çek
    senetEkle(o: Ogrenci) {
      pencere(`Senet / çek al · ${o.ad} ${o.soyad}`, [
        { tip: 'bilgi', html: <>Senet borcu değiştirmez; yalnız güvencedir. Tahsil edildiğinde ödeme olarak işlenir. Kalan borç: <b>{tl(o.hesap?.kalan)}</b></> },
        { ad: 'tur', etiket: 'Tür', tip: 'select', secenekler: [['senet', 'Senet (bono)'], ['cek', 'Çek']] },
        { ad: 'taksitlerden', etiket: 'Ödenmemiş her taksit için ayrı senet oluştur', tip: 'onay', deger: true },
        { ad: 'vade', etiket: 'Vade', tip: 'date', deger: gunEkle(v.bugun, 30), gizle: (x) => x.taksitlerden },
        { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', gizle: (x) => x.taksitlerden },
        { ad: 'no', etiket: 'Senet / çek no', not: 'Birden çok senette sırayla -1, -2 eklenir.' },
        { ad: 'banka', etiket: 'Banka (çek için)', gizle: (x) => x.tur !== 'cek' },
        { ad: 'borclu', etiket: 'Borçlu (boşsa öğrenci)', deger: `${o.ad} ${o.soyad}` },
        { ad: 'aciklama', etiket: 'Açıklama' },
      ], async (g) => { const r = await islem<{ sayi: number }>('senet_ekle', { ogrenciId: o.id, ...g }); await tamamla(`${r.sayi} ${g.tur === 'cek' ? 'çek' : 'senet'} kaydedildi.`); }, { ikili: true });
    },
    senetTahsil(x: Senet) {
      pencere(`${x.tur === 'cek' ? 'Çek' : 'Senet'} tahsili · ${y.ogrAd(x.ogrenci_id)}`, [
        { tip: 'bilgi', html: <>Vade {tarih(x.vade)} · <b>{tl(x.tutar)}</b>. Tahsilat makbuzlu ödeme olarak işlenir.</> },
        { ad: 'yontem', etiket: 'Ödeme şekli', tip: 'select', secenekler: odemeYontemleri }, ...hesapAlani((z) => z.yontem === 'nakit'),
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun }, ...gerekceAlani,
      ], async (g) => { const r = await islem<{ makbuzNo: string }>('senet_tahsil', { id: x.id, ...g }); await tamamla(`Tahsil edildi. Makbuz no: ${r.makbuzNo}`); });
    },
    senetDurum(x: Senet) {
      pencere(`${x.tur === 'cek' ? 'Çek' : 'Senet'} durumu`, [
        { ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: [['portfoy', 'Portföyde (elde)'], ['karsiliksiz', 'Karşılıksız / protestolu'], ['iade', 'Borçluya iade edildi']], deger: x.durum === 'tahsil' ? 'portfoy' : x.durum },
        { ad: 'aciklama', etiket: 'Açıklama', deger: x.aciklama },
      ], async (g) => { await islem('senet_durum', { id: x.id, ...g }); await tamamla(); });
    },

    // ------------------------------------------------------------------ Banka ve aktarım
    bankaHesap(h?: BankaHesap) {
      pencere(h ? `Hesap · ${h.ad}` : 'Banka hesabı / POS ekle', [
        { ad: 'ad', etiket: 'Hesap adı', deger: h?.ad, zorunlu: true, not: 'Örnek: Çankaya POS, Merkez vadesiz hesap' }, { ad: 'banka', etiket: 'Banka', deger: h?.banka },
        { ad: 'iban', etiket: 'IBAN', deger: h?.iban },
        { ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: [...(v.ben.rol === 'yonetici' ? [['', 'Bütün kurum (merkez)'] as [string, string]] : []), ...y.subeSecenek()], deger: h?.sube_id ?? (v.ben.rol === 'yonetici' ? '' : v.ben.sube_id || '') },
        { ad: 'acilis', etiket: 'Açılış bakiyesi (₺)', tip: 'para', deger: h?.acilis ?? 0 },
        ...(h ? [{ ad: 'aktif', etiket: 'Kullanımda', tip: 'onay', deger: !!h.aktif } as Alan] : []),
      ], async (g) => { await islem('banka_hesap_kaydet', h ? { id: h.id, ...g } : g); await tamamla('Kaydedildi.'); }, { ikili: true });
    },
    paraAktar() {
      const kasalar = (v.ben.rol === 'yonetici' ? v.subeler : v.subeler.filter((s) => s.id === v.ben.sube_id)).filter((s) => s.aktif).map((s): [string, string] => [`kasa:${s.id}`, `${s.ad} kasası`]);
      const hesaplar = (v.bankaHesaplari || []).filter((h) => h.aktif).map((h): [string, string] => [`hesap:${h.id}`, h.ad]);
      const hedefKasalar = v.subeler.filter((s) => s.aktif).map((s): [string, string] => [`kasa:${s.id}`, `${s.ad} kasası`]);
      const hedefHesaplar = (v.aktarimHedefleri || []).map((h): [string, string] => [`hesap:${h.id}`, h.ad]);
      pencere('Para aktarımı', [
        { tip: 'bilgi', html: 'Şube kasasından merkeze gönderilen, bankaya yatırılan ya da bankadan çekilen para. Kasa sayımı (gün sonu) bu aktarımları hesaba katar.' },
        { ad: 'kaynak', etiket: 'Nereden', tip: 'select', secenekler: [...kasalar, ...hesaplar], deger: `kasa:${y.varsayilanSube()}` },
        // Varsayılan hedef: şubeden merkeze (şube personeli) ya da ilk banka hesabı (yönetici).
        { ad: 'hedef', etiket: 'Nereye', tip: 'select', secenekler: [...hedefKasalar, ...hedefHesaplar],
          deger: (v.ben.rol === 'yonetici' ? hedefHesaplar[0]?.[0] : undefined) || hedefKasalar.find(([k]) => k === `kasa:${v.subeler.find((x) => x.merkez)?.id}` && k !== `kasa:${y.varsayilanSube()}`)?.[0]
            || [...hedefKasalar, ...hedefHesaplar].find(([k]) => k !== `kasa:${y.varsayilanSube()}`)?.[0] },
        { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', zorunlu: true }, { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun },
        { ad: 'aciklama', etiket: 'Açıklama', not: 'Örnek: dekont no, teslim alan kişi' }, ...gerekceAlani,
      ], async (g) => {
        const [kaynakTur, kaynakId] = String(g.kaynak).split(':'), [hedefTur, hedefId] = String(g.hedef).split(':');
        await islem('para_aktar', { kaynakTur, kaynakId, hedefTur, hedefId, tutar: g.tutar, tarih: g.tarih, aciklama: g.aciklama, gerekce: g.gerekce });
        await tamamla('Aktarım kaydedildi.');
      });
    },

    // ------------------------------------------------------------------ Aday
    aday(a?: Aday) {
      pencere(a ? `Aday · ${a.ad} ${a.soyad}` : 'Yeni aday', [
        ...(v.ben.rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: [['', 'Belirsiz'], ...y.subeSecenek()], deger: a?.sube_id || b.sube || '' } as Alan] : []),
        { ad: 'ad', etiket: 'Ad', deger: a?.ad, zorunlu: true }, { ad: 'soyad', etiket: 'Soyad', deger: a?.soyad },
        { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: a?.telefon, zorunlu: true }, { ad: 'eposta', etiket: 'E-posta', tip: 'email', deger: a?.eposta },
        { ad: 'sinif', etiket: 'İstediği sınıf', tip: 'select', secenekler: [['', 'Belirsiz'], ...y.sinifSecenek()], deger: a?.sinif || '' },
        { ad: 'kaynak', etiket: 'Nereden duydu?', tip: 'select', secenekler: [['', 'Seçilmedi'], ...v.tanimlar.kaynaklar.map((k): [string, string] => [k, k])], deger: a?.kaynak || '' },
        { ad: 'fiyat', etiket: 'Verilen fiyat (₺)', tip: 'para', deger: a?.fiyat || 0 },
        { ad: 'sonrakiArama', etiket: 'Tekrar aranacak gün', tip: 'date', deger: a?.sonraki_arama || gunEkle(v.bugun, 2) },
        ...(a ? [{ ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: [['yeni', 'Yeni'], ['gorusuluyor', 'Görüşülüyor'], ['vazgecti', 'Vazgeçti']], deger: a.durum === 'kayit' ? 'gorusuluyor' : a.durum } as Alan] : []),
        { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: a?.notlar, genis: true },
      ], async (g) => { await islem('aday_kaydet', a ? { id: a.id, ...g } : { ...g, subeId: g.subeId ?? v.ben.sube_id }); await tamamla('Aday kaydedildi.'); }, { ikili: true });
    },
    adayNot(a: Aday) {
      pencere(`Görüşme notu · ${a.ad} ${a.soyad}`, [
        { ad: 'metin', etiket: 'Ne konuşuldu?', tip: 'textarea', zorunlu: true },
        { ad: 'sonrakiArama', etiket: 'Tekrar aranacak gün (boşsa aranmaz)', tip: 'date', deger: gunEkle(v.bugun, 3) },
        { ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: [['gorusuluyor', 'Görüşülüyor'], ['vazgecti', 'Vazgeçti']], deger: 'gorusuluyor' },
      ], async (g) => { await islem('aday_not', { id: a.id, ...g }); await tamamla(); });
    },
    adayKayit(a: Aday) {
      E.ogrenciEkle({ adayId: a.id, subeId: a.sube_id || undefined, ad: a.ad, soyad: a.soyad, telefon: a.telefon, eposta: a.eposta, sinif: a.sinif || undefined, kaynak: a.kaynak, ucret: a.fiyat || undefined, kvkkOnay: a.on_kayit ? true : undefined });
    },

    // ------------------------------------------------------------------ Kişisel veri
    kvkkOnay(o: Ogrenci) {
      pencere('Kişisel veri onayı', [
        { tip: 'bilgi', html: 'Aydınlatma metni öğrenciye verildi / okundu ve onayı (imzalı form ya da kendi ekranından) alındı. Onay tarihiyle birlikte kaydedilir.' },
        { tip: 'bilgi', html: <div className="metin-kutu">{v.tanimlar.kvkk.metin}</div> },
      ], async () => { await islem('kvkk_onay', { ogrenciId: o.id }); await tamamla('Onay kaydedildi.'); }, { dugme: 'Onay alındı', genis: true });
    },
    anonimlestir(o: Ogrenci) {
      pencere('Kişisel verileri sil (anonim yap)', [
        { tip: 'bilgi', html: <>Ad, kimlik no, telefon, adres, veli bilgisi ve bütün evrak <b>kalıcı olarak silinir</b>. Ödeme ve ders sayıları isimsiz kalır, raporlar bozulmaz. Geri alınamaz.</> },
        { ad: 'onay', etiket: 'Onay için büyük harflerle SİL yazın', zorunlu: true },
      ], async (g) => { await islem('ogrenci_anonimlestir', { id: o.id, onay: g.onay }); await tamamla('Kişisel veriler silindi.'); }, { dugme: 'Kalıcı olarak sil', tehlike: true });
    },
  };
  return E;
}
