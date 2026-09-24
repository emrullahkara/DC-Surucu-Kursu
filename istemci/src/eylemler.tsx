// Düğmelerin açtığı işlemler (form pencereleri). Bütün kurallar sunucuda da denetlenir.
import { islem, konumAl } from './api';
import { bildir, pencere, onayla, type Alan } from './bilesenler/ortak';
import { yardimcilar, type Baglam } from './baglam';
import { gunEkle, tl, tarih, YONTEM, DURUM_OGR, DURUM_SINAV, SINAV_AD, whatsapp } from './yardim';
import type { Ders, Ogrenci, Personel, Sinav } from './tipler';
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

  const E = {
    // ------------------------------------------------------------------ Dersler
    async dersTamam(d: Ders) {
      const r = await islem('ders_sonuc', await konumluGovde({ id: d.id, durum: 'tamamlandi' }), { kuyruk: true, aciklama: `${y.ogrAd(d.ogrenci_id)} dersi tamamlandı` });
      if (r.sirada) { d.durum = 'tamamlandi'; bildir('İnternet yok. Kayıt telefonda bekliyor, bağlantı gelince merkeze gönderilecek.', 'hata'); b.yerel(); }
      else await tamamla('Ders tamamlandı olarak kaydedildi.');
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
    ogrenciEkle() {
      const sube = y.varsayilanSube();
      const alanlar: Alan[] = [
        ...(v.ben.rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: y.subeSecenek(), deger: sube } as Alan] : []),
        { ad: 'sinif', etiket: 'Ehliyet sınıfı', tip: 'select', secenekler: y.sinifSecenek(), deger: 'B' },
        { ad: 'ad', etiket: 'Ad', zorunlu: true }, { ad: 'soyad', etiket: 'Soyad', zorunlu: true },
        { ad: 'tc', etiket: 'T.C. kimlik no', zorunlu: true, tip: 'text' }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel' },
        { ad: 'dogum', etiket: 'Doğum tarihi', tip: 'date' }, { ad: 'kayitTarihi', etiket: 'Kayıt tarihi', tip: 'date', deger: v.bugun },
        { ad: 'mevcutEhliyet', etiket: 'Elindeki ehliyet (sınıf yükseltme için)', tip: 'select', secenekler: [['', 'Yok'], ...y.sinifSecenek()] },
        { ad: 'donemId', etiket: 'Dönem', tip: 'select', secenekler: [['', 'Seçilmedi'], ...v.donemler.map((d): [string, string] => [d.id, d.ad])], deger: v.donemler.find((d) => d.bas <= v.bugun && d.bit >= v.bugun)?.id || '' },
        { ad: 'egitmenId', etiket: 'Direksiyon eğitmeni', tip: 'select', secenekler: y.egitmenSecenek(sube), gizle: (x) => !!x.subeId && x.subeId !== sube },
        { ad: 'eposta', etiket: 'E-posta', tip: 'email' },
        { ad: 'adres', etiket: 'Adres', genis: true },
        { ad: 'ucret', etiket: 'Kurs ücreti (₺)', tip: 'para' },
        ...(y.hak('tahsilat') ? [
          { ad: 'pesinat', etiket: 'Peşinat, şimdi alınan (₺)', tip: 'para' } as Alan,
          { ad: 'pesinatYontem', etiket: 'Peşinat ödeme şekli', tip: 'select', secenekler: odemeYontemleri } as Alan,
        ] : []),
        { ad: 'taksitSayisi', etiket: 'Kalan kaç taksit?', tip: 'number', deger: 1, min: 1, max: 24 },
        { ad: 'ilkVade', etiket: 'İlk taksit tarihi', tip: 'date', deger: gunEkle(v.bugun, 30) },
        { ad: 'portalSifre', etiket: 'Öğrenci giriş şifresi (isteğe bağlı)', not: 'En az 6 karakter. Öğrenci ilk girişte kendi şifresini belirler.' },
        { ad: 'notlar', etiket: 'Not', tip: 'textarea', genis: true },
      ];
      pencere('Yeni öğrenci kaydı', alanlar, async (g) => {
        if (!g.subeId) g.subeId = sube;
        if (g.subeId !== sube) g.egitmenId = '';
        const r = await islem<{ id: string }>('ogrenci_ekle', g);
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
          { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun },
          { ad: 'aciklama', etiket: 'Açıklama' },
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
      ], async (g) => { await islem('iade', { ogrenciId: o.id, ...g }); await tamamla('İade kaydedildi.'); });
    },
    odemeIptal(id: string) {
      pencere('Ödeme iptali', [{ tip: 'bilgi', html: 'Ödeme silinmez; iptal edildi olarak işaretlenir ve kasadan düşer.' }, { ad: 'neden', etiket: 'İptal nedeni', zorunlu: true }],
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
        { ad: 'aracId', etiket: 'Araç (varsa)', tip: 'select', secenekler: [['', 'Yok'], ...y.subeSuz(v.araclar).map((a): [string, string] => [a.id, a.plaka])], deger: aracId || '' },
        { ad: 'aciklama', etiket: 'Açıklama' },
      ], async (g) => { await islem('gider_ekle', { ...g, subeId: g.subeId || y.varsayilanSube(), veresiye: !!(g.veresiye && g.tedarikciId) }); await tamamla('Gider kaydedildi.'); }, { ikili: true });
    },
    giderIptal(id: string) { onayla('Bu gider iptal edilsin mi?', async () => { await islem('gider_iptal', { id }); await tamamla(); }, 'İptal et'); },
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
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: v.bugun }, { ad: 'aciklama', etiket: 'Açıklama' },
      ], async (g) => { await islem('tedarikci_odeme', { ...g, subeId: g.subeId || y.varsayilanSube() }); await tamamla('Ödeme kaydedildi.'); });
    },

    // ------------------------------------------------------------------ Sınav
    sinavEkle(id?: string) {
      ogrenciSor('Sınava yaz', () => true, (ogrenciId) => {
        const o = y.ogr(ogrenciId)!;
        const esGecti = v.sinavlar.some((s) => s.ogrenci_id === ogrenciId && s.tur === 'e_sinav' && s.sonuc === 'gecti');
        pencere(`Sınava yaz · ${o.ad} ${o.soyad}`, [
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
  };
  return E;
}
