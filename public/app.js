'use strict';
// DC Sürücü Kursu · ekran. Kütüphane kullanılmaz; telefonda da bilgisayarda da aynı dosya çalışır.
// Yetki kontrolü SUNUCUDADIR; burada yalnız kullanıcının yapamayacağı işlerin düğmeleri gösterilmez.

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tl = (k) => ((k || 0) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const tarih = (d) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');
const zamanYaz = (iso) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function paraOku(s) {
  s = String(s ?? '').trim().replace(/[\s₺]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error('Tutar geçersiz. Örnek: 1.500,00');
  return Math.round(n * 100);
}
const paraYaz = (k) => (k ? (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const gunEkle = (g, n) => { const d = new Date(g + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const yeniNo = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

const DURUM_OGR = { aktif: ['Aktif', 'yesil'], dondu: ['Donduruldu', 'sari'], tamamlandi: ['Tamamlandı', ''], iptal: ['İptal', 'gri'] };
const DURUM_DERS = { planli: ['Planlı', ''], tamamlandi: ['Tamamlandı', 'yesil'], gelmedi: ['Gelmedi', 'kirmizi'], iptal: ['İptal', 'gri'] };
const DURUM_SINAV = { bekliyor: ['Sonuç bekleniyor', 'sari'], gecti: ['Geçti', 'yesil'], kaldi: ['Kaldı', 'kirmizi'], girmedi: ['Girmedi', 'gri'] };
const SINAV_AD = { e_sinav: 'E-sınav', direksiyon: 'Direksiyon sınavı' };
const DERS_AD = { teorik: 'Teorik', direksiyon: 'Direksiyon' };
const YONTEM = { nakit: 'Nakit', kart: 'Kredi kartı', havale: 'Havale / EFT' };
const rozet = (tablo, d) => `<span class="rozet ${tablo[d]?.[1] ?? ''}">${esc(tablo[d]?.[0] ?? d)}</span>`;

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------
const S = { tur: null, veri: null, ogrenci: null, sekme: 'ozet', sube: '', ogrId: null, kapi: 'yonetici', durum: null,
  dersGunu: null, arama: '', durumSuz: 'aktif', kasaBas: null, kasaBit: null, rapor: null, canli: false, yeniOlay: new Set() };
const hak = (h) => S.veri?.ben.haklar.includes(h);
const ben = () => S.veri.ben;

// ---------------------------------------------------------------------------
// Sunucu ile konuşma
// ---------------------------------------------------------------------------
async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-DC': '1' }, body: JSON.stringify(govde) });
  let j = {};
  try { j = await r.json(); } catch { /* boş cevap */ }
  if (!r.ok) { const e = new Error(j.hata || 'İşlem yapılamadı.'); e.durum = r.status; throw e; }
  return j;
}

// Sahadan internet yokken girilen ders sonuçları telefonda sıraya alınır, bağlantı gelince gönderilir.
const KUYRUK_ANAHTAR = 'dc_kuyruk';
const kuyrukOku = () => { try { return JSON.parse(localStorage.getItem(KUYRUK_ANAHTAR) || '[]'); } catch { return []; } };
const kuyrukYaz = (l) => { try { localStorage.setItem(KUYRUK_ANAHTAR, JSON.stringify(l)); } catch { /* depolama kapalı */ } };
let kuyrukGonderiliyor = false;
async function kuyrukGonder() {
  if (kuyrukGonderiliyor) return;
  kuyrukGonderiliyor = true;
  let gonderilen = 0;
  try {
    for (const is of kuyrukOku()) {
      try { await api('/api/islem', is.govde); gonderilen++; }
      catch (e) {
        if (!e.durum) break; // hâlâ internet yok
        if (e.durum === 401) break;
        bildir(`Sıradaki kayıt gönderilemedi: ${is.aciklama} · ${e.message}`, 'hata');
      }
      kuyrukYaz(kuyrukOku().filter((x) => x.govde.istekNo !== is.govde.istekNo));
    }
  } finally { kuyrukGonderiliyor = false; }
  if (gonderilen) { bildir(`${gonderilen} bekleyen kayıt merkeze iletildi.`, 'tamam'); await yenile(); }
  else ciz();
}
window.addEventListener('online', kuyrukGonder);
setInterval(() => { if (kuyrukOku().length) kuyrukGonder(); }, 20000);

async function islem(tur, g = {}, { kuyruk = false, aciklama = '' } = {}) {
  const govde = { tur, ...g, istekNo: yeniNo() };
  try {
    const r = await api('/api/islem', govde);
    await yenile();
    return r;
  } catch (e) {
    if (!e.durum && kuyruk) {
      kuyrukYaz([...kuyrukOku(), { govde, aciklama, zaman: new Date().toISOString() }]);
      bildir('İnternet yok. Kayıt telefonda sıraya alındı, bağlantı gelince merkeze gönderilecek.', 'hata');
      setTimeout(ciz, 0);
      return { sirada: true };
    }
    if (!e.durum) throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    throw e;
  }
}

let yenileZamanlayici = null;
async function yenile() {
  try {
    if (S.tur === 'personel') S.veri = await api('/api/veri');
    else if (S.tur === 'ogrenci') S.ogrenci = await api('/api/ogrenci');
    ciz();
  } catch (e) {
    if (e.durum === 401) return basla();
    if (!e.durum) { S.canli = false; ciz(); }
  }
}
const yenileGecikmeli = () => { clearTimeout(yenileZamanlayici); yenileZamanlayici = setTimeout(yenile, 300); };

let kaynak = null;
function canliBaglan() {
  if (kaynak) kaynak.close();
  kaynak = new EventSource('/api/canli');
  kaynak.addEventListener('open', () => { S.canli = true; yenileGecikmeli(); kuyrukGonder(); });
  kaynak.addEventListener('error', () => { S.canli = false; ciz(); });
  kaynak.addEventListener('degisti', (e) => {
    let o = null;
    try { o = JSON.parse(e.data); } catch { return; }
    if (o && o.kullanici !== S.veri?.ben.ad) bildir(o.metin);
    if (o) S.yeniOlay.add(o.id);
    yenileGecikmeli();
  });
}

// ---------------------------------------------------------------------------
// Bildirim ve pencere
// ---------------------------------------------------------------------------
function bildir(metin, tur = '') {
  const d = document.createElement('div');
  d.className = 'bildirim' + (tur ? ` ${tur}-b` : '');
  d.textContent = metin;
  $('#bildirimler').append(d);
  setTimeout(() => d.remove(), tur === 'hata' ? 7000 : 4500);
}

function alanCiz(a) {
  const ad = esc(a.ad);
  const zor = a.zorunlu ? ' required' : '';
  const d = a.deger ?? '';
  let ic;
  if (a.tip === 'bilgi') return `<div class="bilgi">${a.html}</div>`;
  if (a.tip === 'select')
    ic = `<select name="${ad}"${zor}>${a.secenekler.map(([v, e]) => `<option value="${esc(v)}"${String(v) === String(d) ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select>`;
  else if (a.tip === 'textarea') ic = `<textarea name="${ad}" rows="3"${zor}>${esc(d)}</textarea>`;
  else if (a.tip === 'haklar')
    return `<fieldset class="secenekler alan"><legend class="soluk kucuk">${esc(a.etiket)}</legend>${a.secenekler
      .map(([v, e]) => `<label><input type="checkbox" name="${ad}" value="${esc(v)}"${d.includes(v) ? ' checked' : ''}> <span>${esc(e)}</span></label>`).join('')}</fieldset>`;
  else if (a.tip === 'onay') return `<div class="secenekler"><label><input type="checkbox" name="${ad}"${d ? ' checked' : ''}> <span>${esc(a.etiket)}</span></label></div>`;
  else {
    const tip = a.tip === 'para' ? 'text' : a.tip || 'text';
    const ek = a.tip === 'para' ? ' inputmode="decimal" placeholder="0,00"' : a.tip === 'number' ? ' inputmode="numeric"' : '';
    ic = `<input name="${ad}" type="${tip}" value="${esc(a.tip === 'para' ? paraYaz(d) : d)}"${zor}${ek}${a.otomatik ? ` autocomplete="${a.otomatik}"` : ''}${a.min !== undefined ? ` min="${a.min}"` : ''}${a.max !== undefined ? ` max="${a.max}"` : ''}>`;
  }
  return `<label class="alan"><span>${esc(a.etiket)}${a.zorunlu ? ' *' : ''}</span>${ic}${a.not ? `<small class="soluk">${esc(a.not)}</small>` : ''}</label>`;
}

function pencere(baslik, alanlar, gonder, { dugme = 'Kaydet', ikili = false } = {}) {
  const dlg = $('#pencere');
  const govde = ikili
    ? `<div class="iki">${alanlar.map(alanCiz).join('')}</div>`
    : alanlar.map(alanCiz).join('');
  dlg.innerHTML = `<form method="dialog" novalidate><h2>${esc(baslik)}</h2><div class="hata-yer"></div>${govde}
    <div class="alt"><button type="button" class="dugme" data-kapat>Vazgeç</button>${gonder ? `<button class="dugme ana" type="submit">${esc(dugme)}</button>` : ''}</div></form>`;
  const form = $('form', dlg);
  $('[data-kapat]', dlg).onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = {};
    for (const a of alanlar) {
      if (!a.ad) continue;
      if (a.tip === 'haklar') { v[a.ad] = [...form.querySelectorAll(`input[name="${a.ad}"]:checked`)].map((x) => x.value); continue; }
      if (a.tip === 'onay') { v[a.ad] = form.elements[a.ad].checked; continue; }
      v[a.ad] = form.elements[a.ad]?.value?.trim() ?? '';
    }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      for (const a of alanlar) {
        if (a.zorunlu && !v[a.ad]) throw new Error(`${a.etiket} boş bırakılamaz.`);
        if (a.tip === 'para') v[a.ad] = paraOku(v[a.ad]);
      }
      const r = await gonder(v);
      if (r !== false) dlg.close();
    } catch (err) {
      $('.hata-yer', form).innerHTML = `<div class="hata">${esc(err.message)}</div>`;
      $('.hata-yer', form).scrollIntoView({ block: 'nearest' });
    } finally { btn.disabled = false; }
  };
  dlg.showModal();
  setTimeout(() => form.querySelector('input:not([type=checkbox]),select,textarea')?.focus(), 30);
}
function onayla(metin, eylem) {
  pencere('Emin misiniz?', [{ tip: 'bilgi', html: esc(metin) }], async () => { await eylem(); }, { dugme: 'Evet' });
}

// ---------------------------------------------------------------------------
// Adlar ve süzgeçler
// ---------------------------------------------------------------------------
const subeAd = (id) => S.veri.subeler.find((s) => s.id === id)?.ad || '';
const kisiAd = (id) => S.veri.personel.find((p) => p.id === id)?.ad || '';
const ogr = (id) => S.veri.ogrenciler.find((o) => o.id === id);
const ogrAd = (id) => { const o = ogr(id); return o ? `${o.ad} ${o.soyad}` : '—'; };
const aracAd = (id) => S.veri.araclar.find((a) => a.id === id)?.plaka || '';
const cokSube = () => ben().rol === 'yonetici' && S.veri.subeler.length > 1;
const subeSuz = (l, alan = 'sube_id') => (S.sube ? l.filter((x) => x[alan] === S.sube) : l);
const varsayilanSube = () => S.sube || ben().sube_id || S.veri.subeler.find((s) => s.merkez)?.id || S.veri.subeler[0]?.id;
const subeSecenek = () => S.veri.subeler.filter((s) => s.aktif).map((s) => [s.id, s.ad]);
const egitmenSecenek = (subeId, bos = 'Seçilmedi') => [['', bos], ...S.veri.personel
  .filter((p) => (p.rol === 'egitmen' || p.rol === 'sube_muduru' || p.rol === 'yonetici') && (p.aktif ?? 1) && (p.rol === 'yonetici' || p.sube_id === subeId))
  .map((p) => [p.id, p.ad])];
const aracSecenek = (subeId) => [['', 'Seçilmedi'], ...S.veri.araclar.filter((a) => a.aktif && a.sube_id === subeId).map((a) => [a.id, `${a.plaka} · ${a.model} (${a.sinif})`])];
const sinifSecenek = () => Object.entries(S.veri.tanimlar.siniflar).map(([k, v]) => [k, v.ad]);
function ilerleme(o) {
  const g = S.veri.tanimlar.siniflar[o.sinif];
  if (!g) return '';
  return `<span class="kucuk">${o.dersler.direksiyon}/${g.direksiyon} dir.</span>`;
}

// ---------------------------------------------------------------------------
// Açılış: kurulum mu, giriş mi, ekran mı?
// ---------------------------------------------------------------------------
async function basla() {
  if (kaynak) { kaynak.close(); kaynak = null; }
  S.tur = null; S.veri = null; S.ogrenci = null;
  try {
    S.durum = await api('/api/durum');
    if (!S.durum.kurulu) return kurulumCiz();
    try {
      const b = await api('/api/ben');
      S.tur = b.tur;
      await yenile();
      if (S.tur === 'personel') { S.sekme = 'ozet'; canliBaglan(); ciz(); kuyrukGonder(); }
    } catch (e) {
      if (e.durum === 401) return girisCiz();
      throw e;
    }
  } catch (e) {
    $('#uygulama').innerHTML = `<div class="giris"><div class="kart"><div class="hata">${esc(e.message === 'Failed to fetch' ? 'Sunucuya ulaşılamadı.' : e.message)}</div><button class="dugme ana" id="tekrar">Tekrar dene</button></div></div>`;
    $('#tekrar').onclick = basla;
  }
}

function kurulumCiz() {
  $('#uygulama').innerHTML = `<div class="giris"><div class="logo"><img src="/simge.svg" alt=""><h1>DC Sürücü Kursu · İlk kurulum</h1>
    <p class="soluk">Kurumunuzu ve yönetici hesabınızı oluşturun. Şubeleri ve personeli sonra eklersiniz.</p></div>
    <form class="kart" id="kurulum"><div class="hata-yer"></div>
    ${[{ ad: 'kurumAdi', etiket: 'Kurum adı', zorunlu: true }, { ad: 'subeAdi', etiket: 'İlk (merkez) şube adı', deger: 'Merkez', zorunlu: true },
      { ad: 'ad', etiket: 'Adınız soyadınız', zorunlu: true }, { ad: 'kullaniciAdi', etiket: 'Kullanıcı adı', zorunlu: true, otomatik: 'username' },
      { ad: 'sifre', etiket: 'Şifre (en az 8 karakter)', tip: 'password', zorunlu: true, otomatik: 'new-password' }].map(alanCiz).join('')}
    <button class="dugme ana buyuk">Kurulumu tamamla</button></form></div>`;
  $('#kurulum').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/kurulum', Object.fromEntries(['kurumAdi', 'subeAdi', 'ad', 'kullaniciAdi', 'sifre'].map((k) => [k, f.elements[k].value.trim()])));
      basla();
    } catch (err) { $('.hata-yer', f).innerHTML = `<div class="hata">${esc(err.message)}</div>`; }
  };
}

function girisCiz() {
  const k = S.kapi;
  const aciklama = { yonetici: 'Kurum sahibi, merkez yöneticisi ve şube müdürleri.', personel: 'Büro personeli ve eğitmenler.', ogrenci: 'Kursiyerler: ders, sınav ve ödeme bilgilerinizi görün.' }[k];
  const alanlar = k === 'ogrenci'
    ? [{ ad: 'tc', etiket: 'T.C. kimlik no', zorunlu: true, tip: 'text', otomatik: 'username' }, { ad: 'sifre', etiket: 'Şifre', tip: 'password', zorunlu: true, otomatik: 'current-password' }]
    : [{ ad: 'kullaniciAdi', etiket: 'Kullanıcı adı', zorunlu: true, otomatik: 'username' }, { ad: 'sifre', etiket: 'Şifre', tip: 'password', zorunlu: true, otomatik: 'current-password' }];
  const demo = S.durum?.demo
    ? `<div class="bilgi kucuk"><b>Deneme kurumu açık (uydurma veriler).</b><br>Yetkili: <code>patron</code> veya <code>mudur</code> · Personel: <code>buro</code>, <code>egitmen1</code> · şifre <code>Deneme123!</code><br>Öğrenci: T.C. <code>10000000146</code> · şifre <code>ogrenci1</code></div>` : '';
  $('#uygulama').innerHTML = `<div class="giris"><div class="logo"><img src="/simge.svg" alt=""><h1>${esc(S.durum?.kurum || 'DC Sürücü Kursu')}</h1></div>
    <div class="kapilar" role="tablist">${[['yonetici', 'Yetkili girişi'], ['personel', 'Personel girişi'], ['ogrenci', 'Öğrenci girişi']]
      .map(([v, e]) => `<button type="button" data-kapi="${v}" class="${k === v ? 'secili' : ''}">${e}</button>`).join('')}</div>
    <form class="kart" id="giris"><p class="soluk kucuk">${aciklama}</p><div class="hata-yer"></div>${alanlar.map(alanCiz).join('')}
    <button class="dugme ana buyuk">Giriş yap</button></form>${demo}</div>`;
  document.querySelectorAll('[data-kapi]').forEach((b) => (b.onclick = () => { S.kapi = b.dataset.kapi; girisCiz(); }));
  $('#giris').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (k === 'ogrenci') await api('/api/ogrenci-giris', { tc: f.elements.tc.value.trim(), sifre: f.elements.sifre.value });
      else await api('/api/giris', { kullaniciAdi: f.elements.kullaniciAdi.value.trim(), sifre: f.elements.sifre.value, kapi: k });
      basla();
    } catch (err) { $('.hata-yer', f).innerHTML = `<div class="hata">${esc(err.message)}</div>`; }
  };
}

async function cikis() {
  try { await api('/api/cikis', {}); } catch { /* yine de çık */ }
  basla();
}

// ---------------------------------------------------------------------------
// Ana çizim
// ---------------------------------------------------------------------------
function sekmeler() {
  const l = [['ozet', ben().rol === 'egitmen' ? 'Sahada' : 'Özet'], ['ogrenciler', 'Öğrenciler'], ['dersler', 'Dersler'], ['sinavlar', 'Sınavlar']];
  if (hak('tahsilat') || hak('kasa')) l.push(['kasa', 'Kasa']);
  if (hak('rapor')) l.push(['raporlar', 'Raporlar']);
  if (hak('personel')) l.push(['yonetim', ben().rol === 'yonetici' ? 'Şubeler ve personel' : 'Personel ve araçlar']);
  l.push(['hesap', 'Hesabım']);
  return l;
}

function ciz() {
  if (S.tur === 'ogrenci') return ogrenciCiz();
  if (S.tur !== 'personel' || !S.veri) return;
  const v = S.veri;
  const kuyruk = kuyrukOku().length;
  const secili = S.sekme === 'ogrenci' ? 'ogrenciler' : S.sekme;
  const icerik = { ozet: ozetCiz, ogrenciler: ogrencilerCiz, ogrenci: ogrenciDetayCiz, dersler: derslerCiz, sinavlar: sinavlarCiz,
    kasa: kasaCiz, raporlar: raporlarCiz, yonetim: yonetimCiz, hesap: hesapCiz }[S.sekme] || ozetCiz;
  const kaydir = window.scrollY;
  $('#uygulama').innerHTML = `
  <header class="ust"><div><div class="kurum">${esc(v.kurum?.ad || '')}</div><div class="kim">${esc(v.ben.ad)} · ${esc(v.tanimlar.roller[v.ben.rol])}${v.ben.sube_id ? ' · ' + esc(subeAd(v.ben.sube_id)) : ''}</div></div>
    <div class="sag">${cokSube() ? `<select id="sube-sec" aria-label="Şube"><option value="">Bütün şubeler</option>${v.subeler.map((s) => `<option value="${esc(s.id)}"${S.sube === s.id ? ' selected' : ''}>${esc(s.ad)}</option>`).join('')}</select>` : ''}
    ${kuyruk ? `<span class="isaret kopuk">${kuyruk} kayıt gönderilmeyi bekliyor</span>` : ''}
    <span class="isaret ${S.canli ? '' : 'kopuk'}">${S.canli ? '● Canlı' : '○ Bağlantı yok'}</span></div></header>
  <nav class="menu">${sekmeler().map(([k, e]) => `<button data-sekme="${k}" class="${secili === k ? 'secili' : ''}">${e}</button>`).join('')}</nav>
  <main>${icerik()}</main>`;
  if (S.sekme === secili) window.scrollTo(0, kaydir);
  S.yeniOlay.clear();
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'sube-sec') { S.sube = e.target.value; ciz(); }
  const suz = e.target.dataset?.suz;
  if (suz) { S[suz] = e.target.value; if (suz === 'kasaBas' || suz === 'kasaBit' || suz === 'dersGunu' || suz === 'durumSuz') ciz(); }
  if (e.target.dataset?.rapor !== undefined) raporGetir();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'arama') {
    S.arama = e.target.value;
    const tbody = $('#ogr-liste');
    if (tbody) tbody.innerHTML = ogrenciSatirlari();
  }
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sekme],[data-is],tr[data-ogr]');
  if (!b) return;
  if (b.dataset.sekme) { S.sekme = b.dataset.sekme; if (S.sekme === 'raporlar' && !S.rapor) raporGetir(); ciz(); window.scrollTo(0, 0); return; }
  if (b.dataset.ogr) { S.ogrId = b.dataset.ogr; S.sekme = 'ogrenci'; ciz(); window.scrollTo(0, 0); return; }
  const f = EYLEMLER[b.dataset.is];
  if (!f) return;
  try { await f(b.dataset.id, b); } catch (err) { bildir(err.message, 'hata'); }
});

// ---------------------------------------------------------------------------
// ÖZET / SAHADA
// ---------------------------------------------------------------------------
function dersSonucDugmeleri(d) {
  const izin = (d.egitmen_id === ben().id && d.durum === 'planli') || hak('ders');
  if (!izin || d.durum !== 'planli') return '';
  return `<div class="dugmeler"><button class="dugme yesil kucuk" data-is="dersTamam" data-id="${d.id}">Tamamlandı</button><button class="dugme kucuk kirmizi" data-is="dersGelmedi" data-id="${d.id}">Gelmedi</button></div>`;
}
function dersTablosu(liste, { tarihGoster = false, ogrenciGoster = true } = {}) {
  if (!liste.length) return '<p class="bos">Kayıt yok.</p>';
  return `<div class="tablo-kutu"><table><thead><tr>${tarihGoster ? '<th>Tarih</th>' : ''}<th>Saat</th>${ogrenciGoster ? '<th>Öğrenci</th>' : ''}<th>Tür</th><th>Eğitmen</th><th>Araç</th>${cokSube() && !S.sube ? '<th>Şube</th>' : ''}<th>Durum</th><th></th></tr></thead><tbody>
  ${liste.map((d) => `<tr>${tarihGoster ? `<td>${tarih(d.tarih)}</td>` : ''}<td>${esc(d.saat)}</td>${ogrenciGoster ? `<td><a href="#" data-is="ogrAc" data-id="${d.ogrenci_id}">${esc(ogrAd(d.ogrenci_id))}</a></td>` : ''}
    <td>${DERS_AD[d.tur]}</td><td>${esc(kisiAd(d.egitmen_id))}</td><td>${esc(aracAd(d.arac_id))}</td>${cokSube() && !S.sube ? `<td>${esc(subeAd(d.sube_id))}</td>` : ''}
    <td>${rozet(DURUM_DERS, d.durum)}${d.notu ? `<div class="kucuk soluk">${esc(d.notu)}</div>` : ''}</td><td>${dersSonucDugmeleri(d)}</td></tr>`).join('')}</tbody></table></div>`;
}

function ozetCiz() {
  if (ben().rol === 'egitmen') return sahadaCiz();
  const v = S.veri, bugun = v.bugun;
  const ogrenciler = subeSuz(v.ogrenciler);
  const aktif = ogrenciler.filter((o) => o.durum === 'aktif');
  const bugunDers = subeSuz(v.dersler).filter((d) => d.tarih === bugun && d.durum !== 'iptal');
  const yaklasanSinav = subeSuz(v.sinavlar).filter((s) => s.sonuc === 'bekliyor' && s.tarih >= bugun && s.tarih <= gunEkle(bugun, 7)).sort((a, b) => (a.tarih > b.tarih ? 1 : -1));
  const geciken = hak('tahsilat') ? ogrenciler.filter((o) => o.hesap?.geciken > 0 && o.durum !== 'iptal') : [];
  const bugunTahsilat = hak('tahsilat') ? subeSuz(v.odemeler).filter((o) => o.tarih === bugun && !o.iptal).reduce((a, o) => a + o.tutar, 0) : 0;
  const olaylar = subeSuz(v.olaylar || []);
  return `
  <div class="sayilar">
    <div class="sayi"><div class="etiket">Aktif öğrenci</div><div class="deger">${aktif.length}</div></div>
    <div class="sayi"><div class="etiket">Bugünkü dersler</div><div class="deger">${bugunDers.filter((d) => d.durum === 'tamamlandi').length} / ${bugunDers.length}</div><div class="kucuk soluk">tamamlanan / toplam</div></div>
    <div class="sayi"><div class="etiket">7 gün içindeki sınavlar</div><div class="deger">${yaklasanSinav.length}</div></div>
    ${hak('tahsilat') ? `<div class="sayi"><div class="etiket">Bugünkü tahsilat</div><div class="deger">${tl(bugunTahsilat)}</div></div>
    <div class="sayi ${geciken.length ? 'uyari' : ''}"><div class="etiket">Ödemesi geciken</div><div class="deger">${geciken.length}</div><div class="kucuk soluk">${tl(geciken.reduce((a, o) => a + o.hesap.geciken, 0))}</div></div>` : ''}
  </div>
  <div class="izgara">
    <section class="kart"><div class="baslik-satir"><h2>Bugünkü dersler</h2><div class="sag">${hak('ders') ? '<button class="dugme kucuk" data-is="dersPlanla">+ Ders planla</button>' : ''}</div></div>${dersTablosu(bugunDers)}</section>
    ${v.olaylar ? `<section class="kart"><h2>Canlı akış</h2><p class="soluk kucuk">Sahadan ve şubelerden girilen kayıtlar burada anında görünür.</p>
      <ul class="akis">${olaylar.length ? olaylar.map((o) => `<li class="${S.yeniOlay.has(o.id) ? 'yeni' : ''}"><div>${esc(o.metin)}</div><div class="zaman">${zamanYaz(o.zaman)} · ${esc(o.kullanici)}${cokSube() && o.sube_id ? ' · ' + esc(subeAd(o.sube_id)) : ''}</div></li>`).join('') : '<li class="bos">Henüz hareket yok.</li>'}</ul></section>` : ''}
    <section class="kart"><h2>Yaklaşan sınavlar</h2>${yaklasanSinav.length ? `<div class="tablo-kutu"><table><tbody>${yaklasanSinav.map((s) => `<tr class="tikla" data-ogr="${s.ogrenci_id}"><td>${tarih(s.tarih)} ${esc(s.saat)}</td><td>${esc(ogrAd(s.ogrenci_id))}</td><td>${SINAV_AD[s.tur]} (${s.deneme}. hak)</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">7 gün içinde sınav yok.</p>'}</section>
    ${geciken.length ? `<section class="kart"><h2>Ödemesi gecikenler</h2><div class="tablo-kutu"><table><tbody>${geciken.sort((a, b) => b.hesap.geciken - a.hesap.geciken).slice(0, 15).map((o) => `<tr class="tikla" data-ogr="${o.id}"><td>${esc(o.ad)} ${esc(o.soyad)}<div class="kucuk soluk">${esc(o.telefon)}</div></td><td class="sayi-h">${tl(o.hesap.geciken)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </div>`;
}

function sahadaCiz() {
  const v = S.veri, bugun = v.bugun;
  const benim = v.dersler.filter((d) => d.egitmen_id === ben().id);
  const bugunDers = benim.filter((d) => d.tarih === bugun && d.durum !== 'iptal').sort((a, b) => (a.saat > b.saat ? 1 : -1));
  const yarin = benim.filter((d) => d.tarih > bugun && d.durum === 'planli').slice(0, 10);
  const ogrencilerim = v.ogrenciler.filter((o) => o.egitmen_id === ben().id && o.durum === 'aktif');
  const kart = (d) => `<div class="ders-kart"><div class="ust-bilgi"><div><div class="ad">${esc(ogrAd(d.ogrenci_id))}</div>
    <div class="soluk kucuk">${esc(d.saat)} · ${DERS_AD[d.tur]} · ${d.sure_dk} dk${d.arac_id ? ' · ' + esc(aracAd(d.arac_id)) : ''}</div></div><div>${rozet(DURUM_DERS, d.durum)}</div></div>
    ${d.durum === 'planli' ? `<div class="iki-dugme"><button class="dugme yesil buyuk" data-is="dersTamam" data-id="${d.id}">✓ Ders tamamlandı</button><button class="dugme kirmizi buyuk" data-is="dersGelmedi" data-id="${d.id}">Gelmedi</button></div>` : ''}
    ${ogr(d.ogrenci_id)?.telefon ? `<div class="kucuk"><a href="tel:${esc(ogr(d.ogrenci_id).telefon.replace(/\s/g, ''))}">📞 ${esc(ogr(d.ogrenci_id).telefon)}</a></div>` : ''}</div>`;
  return `
  <section class="kart"><div class="baslik-satir"><h2>Bugünkü derslerim · ${tarih(bugun)}</h2></div>
    ${bugunDers.length ? bugunDers.map(kart).join('') : '<p class="bos">Bugün planlı dersiniz yok.</p>'}
    <button class="dugme ana buyuk" data-is="dersSaha">+ Plansız ders gir (şimdi tamamlandı)</button>
    <p class="soluk kucuk">Girdiğiniz kayıt merkeze anında düşer. İnternet yoksa telefonunuzda bekler, bağlantı gelince kendiliğinden gönderilir.</p></section>
  <div class="izgara">
    <section class="kart"><div class="baslik-satir"><h2>Yaklaşan derslerim</h2><div class="sag"><button class="dugme kucuk" data-is="dersPlanla">+ Ders planla</button></div></div>${dersTablosu(yarin, { tarihGoster: true })}</section>
    <section class="kart"><h2>Öğrencilerim</h2>${ogrencilerim.length ? `<div class="tablo-kutu"><table><tbody>${ogrencilerim.map((o) => {
      const g = v.tanimlar.siniflar[o.sinif];
      return `<tr class="tikla" data-ogr="${o.id}"><td>${esc(o.ad)} ${esc(o.soyad)}<div class="kucuk soluk">${esc(o.sinif)}</div></td><td><progress max="${g?.direksiyon || 1}" value="${o.dersler.direksiyon}"></progress><div class="kucuk soluk">${o.dersler.direksiyon}/${g?.direksiyon ?? '?'} direksiyon</div></td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="bos">Size bağlı aktif öğrenci yok.</p>'}</section>
  </div>`;
}

// ---------------------------------------------------------------------------
// ÖĞRENCİLER
// ---------------------------------------------------------------------------
function ogrenciSatirlari() {
  const ara = S.arama.toLocaleLowerCase('tr-TR').trim();
  let l = subeSuz(S.veri.ogrenciler);
  if (S.durumSuz) l = l.filter((o) => o.durum === S.durumSuz);
  if (ara) l = l.filter((o) => `${o.ad} ${o.soyad} ${o.telefon} ${o.tc}`.toLocaleLowerCase('tr-TR').includes(ara));
  if (!l.length) return `<tr><td colspan="8" class="bos">Öğrenci bulunamadı.</td></tr>`;
  return l.map((o) => `<tr class="tikla" data-ogr="${o.id}"><td><b>${esc(o.ad)} ${esc(o.soyad)}</b><div class="kucuk soluk">${esc(o.telefon)}</div></td>
    <td>${esc(o.sinif)}</td>${cokSube() && !S.sube ? `<td>${esc(subeAd(o.sube_id))}</td>` : ''}<td>${esc(kisiAd(o.egitmen_id))}</td>
    <td>${ilerleme(o)}</td><td>${rozet(DURUM_OGR, o.durum)}</td>
    ${hak('tahsilat') ? `<td class="sayi-h">${tl(o.hesap.kalan)}${o.hesap.geciken ? `<div class="kucuk rozet kirmizi">gecikme ${tl(o.hesap.geciken)}</div>` : ''}</td>` : ''}</tr>`).join('');
}
function ogrencilerCiz() {
  return `<section class="kart"><div class="baslik-satir"><h1>Öğrenciler</h1><div class="sag">${hak('kayit') ? '<button class="dugme ana" data-is="ogrenciEkle">+ Yeni kayıt</button>' : ''}</div></div>
    <div class="suzgec"><input id="arama" type="search" placeholder="Ad, telefon veya kimlik no ile ara" value="${esc(S.arama)}">
      <select data-suz="durumSuz"><option value="">Bütün durumlar</option>${Object.entries(DURUM_OGR).map(([k, [e]]) => `<option value="${k}"${S.durumSuz === k ? ' selected' : ''}>${e}</option>`).join('')}</select></div>
    <div class="tablo-kutu"><table><thead><tr><th>Öğrenci</th><th>Sınıf</th>${cokSube() && !S.sube ? '<th>Şube</th>' : ''}<th>Eğitmen</th><th>Ders</th><th>Durum</th>${hak('tahsilat') ? '<th class="sayi-h">Kalan borç</th>' : ''}</tr></thead>
    <tbody id="ogr-liste">${ogrenciSatirlari()}</tbody></table></div></section>`;
}

function ogrenciDetayCiz() {
  const o = ogr(S.ogrId);
  if (!o) { S.sekme = 'ogrenciler'; return ogrencilerCiz(); }
  const v = S.veri, g = v.tanimlar.siniflar[o.sinif];
  const dersler = v.dersler.filter((d) => d.ogrenci_id === o.id).sort((a, b) => (a.tarih + a.saat < b.tarih + b.saat ? 1 : -1));
  const sinavlar = v.sinavlar.filter((s) => s.ogrenci_id === o.id);
  const odemeler = (v.odemeler || []).filter((x) => x.ogrenci_id === o.id);
  const aktif = o.durum === 'aktif';
  const d = (e, x) => `<div><span>${e}</span>${x || '—'}</div>`;
  return `
  <div class="baslik-satir"><button class="dugme kucuk" data-sekme="ogrenciler">← Öğrenciler</button></div>
  <section class="kart"><div class="baslik-satir"><h1>${esc(o.ad)} ${esc(o.soyad)}</h1>${rozet(DURUM_OGR, o.durum)}
    <div class="sag">${hak('kayit') ? '<button class="dugme kucuk" data-is="ogrenciDuzenle" data-id="' + o.id + '">Düzenle</button><button class="dugme kucuk" data-is="ogrenciDurum" data-id="' + o.id + '">Durum</button><button class="dugme kucuk" data-is="ogrenciPortal" data-id="' + o.id + '">Öğrenci girişi</button>' : ''}
    ${ben().rol === 'yonetici' && v.subeler.length > 1 ? `<button class="dugme kucuk" data-is="ogrenciNakil" data-id="${o.id}">Şube nakli</button>` : ''}</div></div>
    <div class="detay-bilgi">${d('Ehliyet sınıfı', esc(g?.ad || o.sinif))}${d('Şube', esc(subeAd(o.sube_id)))}${d('Eğitmen', esc(kisiAd(o.egitmen_id)))}${d('Kayıt tarihi', tarih(o.kayit_tarihi))}
      ${d('Telefon', o.telefon ? `<a href="tel:${esc(o.telefon.replace(/\s/g, ''))}">${esc(o.telefon)}</a>` : '')}${d('T.C. kimlik no', esc(o.tc))}
      ${o.dogum !== undefined ? d('Doğum tarihi', tarih(o.dogum)) + d('Adres', esc(o.adres)) : ''}${d('Öğrenci girişi', o.portal_acik ? 'Açık' : 'Kapalı')}</div>
    ${o.notlar ? `<p class="bilgi">${esc(o.notlar)}</p>` : ''}</section>
  <div class="izgara">
    <section class="kart"><div class="baslik-satir"><h2>Ders ilerlemesi</h2></div>
      ${g ? `<div class="ilerleme"><div class="satir"><span>Teorik</span><span>${o.dersler.teorik} / ${g.teorik}</span></div><progress max="${g.teorik}" value="${o.dersler.teorik}"></progress></div>
      <div class="ilerleme"><div class="satir"><span>Direksiyon</span><span>${o.dersler.direksiyon} / ${g.direksiyon}</span></div><progress max="${g.direksiyon}" value="${o.dersler.direksiyon}"></progress></div>` : ''}
      <div class="dugmeler">${aktif && (hak('ders') || o.egitmen_id === ben().id) ? `<button class="dugme kucuk" data-is="dersPlanla" data-id="${o.id}">+ Ders planla</button><button class="dugme kucuk" data-is="dersSaha" data-id="${o.id}">+ Yapılan ders gir</button>` : ''}</div></section>
    <section class="kart"><div class="baslik-satir"><h2>Sınavlar</h2><div class="sag">${aktif && hak('sinav') ? `<button class="dugme kucuk" data-is="sinavEkle" data-id="${o.id}">+ Sınava yaz</button>` : ''}</div></div>
      ${sinavlar.length ? `<div class="tablo-kutu"><table><tbody>${sinavlar.map((s) => `<tr><td>${tarih(s.tarih)} ${esc(s.saat)}</td><td>${SINAV_AD[s.tur]}<div class="kucuk soluk">${s.deneme}. hak</div></td><td>${rozet(DURUM_SINAV, s.sonuc)}${s.puan !== null && s.puan !== undefined ? ` <b>${s.puan}</b>` : ''}</td><td>${hak('sinav') ? `<button class="dugme kucuk" data-is="sinavSonuc" data-id="${s.id}">Sonuç</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Sınav kaydı yok.</p>'}</section>
    ${o.hesap ? `<section class="kart"><div class="baslik-satir"><h2>Ödeme durumu</h2><div class="sag">${o.hesap.kalan > 0 ? `<button class="dugme ana kucuk" data-is="odemeAl" data-id="${o.id}">Ödeme al</button>` : ''}${hak('kasa') ? `<button class="dugme kucuk" data-is="ogrenciUcret" data-id="${o.id}">Ücret / taksit</button>` : ''}</div></div>
      <div class="detay-bilgi">${d('Kurs ücreti', tl(o.hesap.ucret))}${d('Ödenen', tl(o.hesap.odenen))}${d('Kalan', `<b>${tl(o.hesap.kalan)}</b>`)}${d('Geciken', o.hesap.geciken ? `<span class="rozet kirmizi">${tl(o.hesap.geciken)}</span>` : 'Yok')}</div>
      <h3>Taksitler</h3>${o.hesap.taksitler.length ? `<div class="tablo-kutu"><table><tbody>${o.hesap.taksitler.map((t) => `<tr><td>${tarih(t.vade)}</td><td class="sayi-h">${tl(t.tutar)}</td><td>${rozet({ odendi: ['Ödendi', 'yesil'], gecikti: ['Gecikti', 'kirmizi'], bekliyor: ['Bekliyor', 'gri'] }, t.durum)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Taksit yok.</p>'}
      <h3>Ödemeler</h3>${odemeler.length ? `<div class="tablo-kutu"><table><tbody>${odemeler.map((x) => `<tr class="${x.iptal ? 'iptal' : ''}"><td>${tarih(x.tarih)}</td><td>${YONTEM[x.yontem]}<div class="kucuk soluk">${esc(x.aciklama)} · ${esc(x.kaydeden)}</div></td><td class="sayi-h">${tl(x.tutar)}</td><td>${!x.iptal && hak('kasa') ? `<button class="dugme kucuk kirmizi" data-is="odemeIptal" data-id="${x.id}">İptal</button>` : x.iptal ? `<span class="kucuk">${esc(x.iptal_nedeni)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Ödeme yok.</p>'}</section>` : ''}
  </div>
  <section class="kart"><h2>Dersler</h2>${dersTablosu(dersler, { tarihGoster: true, ogrenciGoster: false })}</section>`;
}

// ---------------------------------------------------------------------------
// DERSLER
// ---------------------------------------------------------------------------
function derslerCiz() {
  const g = S.dersGunu || S.veri.bugun;
  let l = subeSuz(S.veri.dersler).filter((d) => d.tarih === g).sort((a, b) => (a.saat > b.saat ? 1 : -1));
  const planYetki = hak('ders') || ben().rol === 'egitmen';
  return `<section class="kart"><div class="baslik-satir"><h1>Dersler</h1><div class="sag">${planYetki ? '<button class="dugme ana" data-is="dersPlanla">+ Ders planla</button>' : ''}</div></div>
    <div class="suzgec"><button class="dugme" data-is="gunKaydir" data-id="-1">← Önceki gün</button><input type="date" data-suz="dersGunu" value="${g}"><button class="dugme" data-is="gunKaydir" data-id="1">Sonraki gün →</button></div>
    <p class="soluk kucuk">${l.length} ders · ${l.filter((d) => d.durum === 'tamamlandi').length} tamamlandı · ${l.filter((d) => d.durum === 'gelmedi').length} gelmedi</p>
    ${dersTablosu(l)}</section>`;
}

// ---------------------------------------------------------------------------
// SINAVLAR
// ---------------------------------------------------------------------------
function sinavlarCiz() {
  const l = subeSuz(S.veri.sinavlar);
  const bekleyen = l.filter((s) => s.sonuc === 'bekliyor').sort((a, b) => (a.tarih > b.tarih ? 1 : -1));
  const biten = l.filter((s) => s.sonuc !== 'bekliyor').slice(0, 100);
  const satir = (s) => `<tr><td>${tarih(s.tarih)} ${esc(s.saat)}</td><td><a href="#" data-is="ogrAc" data-id="${s.ogrenci_id}">${esc(ogrAd(s.ogrenci_id))}</a></td><td>${SINAV_AD[s.tur]}<div class="kucuk soluk">${s.deneme}. hak</div></td>${cokSube() && !S.sube ? `<td>${esc(subeAd(s.sube_id))}</td>` : ''}<td>${rozet(DURUM_SINAV, s.sonuc)}${s.puan !== null && s.puan !== undefined ? ` <b>${s.puan}</b>` : ''}</td><td>${hak('sinav') ? `<button class="dugme kucuk" data-is="sinavSonuc" data-id="${s.id}">Sonuç gir</button>` : ''}</td></tr>`;
  const tablo = (x) => (x.length ? `<div class="tablo-kutu"><table><tbody>${x.map(satir).join('')}</tbody></table></div>` : '<p class="bos">Kayıt yok.</p>');
  const oran = (tur) => { const x = biten.filter((s) => s.tur === tur && ['gecti', 'kaldi'].includes(s.sonuc)); return x.length ? `%${Math.round((100 * x.filter((s) => s.sonuc === 'gecti').length) / x.length)}` : '—'; };
  return `<div class="sayilar"><div class="sayi"><div class="etiket">Sonuç bekleyen</div><div class="deger">${bekleyen.length}</div></div>
    <div class="sayi"><div class="etiket">E-sınav geçme oranı</div><div class="deger">${oran('e_sinav')}</div></div>
    <div class="sayi"><div class="etiket">Direksiyon geçme oranı</div><div class="deger">${oran('direksiyon')}</div></div></div>
    <section class="kart"><div class="baslik-satir"><h1>Sınavı yaklaşan / sonuç bekleyen</h1><div class="sag">${hak('sinav') ? '<button class="dugme ana" data-is="sinavEkle">+ Sınava yaz</button>' : ''}</div></div>${tablo(bekleyen)}</section>
    <section class="kart"><h2>Sonuçlanan sınavlar</h2>${tablo(biten)}</section>`;
}

// ---------------------------------------------------------------------------
// KASA
// ---------------------------------------------------------------------------
function kasaCiz() {
  const v = S.veri;
  const bas = S.kasaBas || v.bugun.slice(0, 8) + '01', bit = S.kasaBit || v.bugun;
  const ara = (x) => x.tarih >= bas && x.tarih <= bit;
  const odemeler = hak('tahsilat') ? subeSuz(v.odemeler).filter(ara) : [];
  const giderler = hak('kasa') ? subeSuz(v.giderler).filter(ara) : [];
  const gelir = odemeler.filter((x) => !x.iptal).reduce((a, x) => a + x.tutar, 0);
  const gider = giderler.filter((x) => !x.iptal).reduce((a, x) => a + x.tutar, 0);
  const yontemler = Object.keys(YONTEM).map((y) => [y, odemeler.filter((x) => !x.iptal && x.yontem === y).reduce((a, x) => a + x.tutar, 0)]);
  return `<div class="suzgec"><label class="alan"><span>Başlangıç</span><input type="date" data-suz="kasaBas" value="${bas}"></label><label class="alan"><span>Bitiş</span><input type="date" data-suz="kasaBit" value="${bit}"></label></div>
  <div class="sayilar"><div class="sayi"><div class="etiket">Tahsilat</div><div class="deger">${tl(gelir)}</div><div class="kucuk soluk">${yontemler.map(([y, t]) => `${YONTEM[y]}: ${tl(t)}`).join(' · ')}</div></div>
    ${hak('kasa') ? `<div class="sayi"><div class="etiket">Gider</div><div class="deger">${tl(gider)}</div></div><div class="sayi"><div class="etiket">Fark</div><div class="deger">${tl(gelir - gider)}</div></div>` : ''}</div>
  ${hak('tahsilat') ? `<section class="kart"><div class="baslik-satir"><h2>Tahsilatlar</h2><div class="sag"><button class="dugme ana" data-is="odemeAl">+ Ödeme al</button></div></div>
    ${odemeler.length ? `<div class="tablo-kutu"><table><thead><tr><th>Tarih</th><th>Öğrenci</th>${cokSube() && !S.sube ? '<th>Şube</th>' : ''}<th>Şekli</th><th>Kaydeden</th><th class="sayi-h">Tutar</th><th></th></tr></thead><tbody>
    ${odemeler.map((x) => `<tr class="${x.iptal ? 'iptal' : ''}"><td>${tarih(x.tarih)}</td><td><a href="#" data-is="ogrAc" data-id="${x.ogrenci_id}">${esc(ogrAd(x.ogrenci_id))}</a><div class="kucuk soluk">${esc(x.aciklama)}</div></td>${cokSube() && !S.sube ? `<td>${esc(subeAd(x.sube_id))}</td>` : ''}<td>${YONTEM[x.yontem]}</td><td>${esc(x.kaydeden)}</td><td class="sayi-h">${tl(x.tutar)}</td><td>${!x.iptal && hak('kasa') ? `<button class="dugme kucuk kirmizi" data-is="odemeIptal" data-id="${x.id}">İptal</button>` : esc(x.iptal_nedeni)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Bu aralıkta tahsilat yok.</p>'}</section>` : ''}
  ${hak('kasa') ? `<section class="kart"><div class="baslik-satir"><h2>Giderler</h2><div class="sag"><button class="dugme" data-is="giderEkle">+ Gider gir</button></div></div>
    ${giderler.length ? `<div class="tablo-kutu"><table><thead><tr><th>Tarih</th><th>Tür</th>${cokSube() && !S.sube ? '<th>Şube</th>' : ''}<th>Açıklama</th><th class="sayi-h">Tutar</th><th></th></tr></thead><tbody>
    ${giderler.map((x) => `<tr class="${x.iptal ? 'iptal' : ''}"><td>${tarih(x.tarih)}</td><td>${esc(x.kategori)}</td>${cokSube() && !S.sube ? `<td>${esc(subeAd(x.sube_id))}</td>` : ''}<td>${esc(x.aciklama)}<div class="kucuk soluk">${esc(x.kaydeden)}</div></td><td class="sayi-h">${tl(x.tutar)}</td><td>${x.iptal ? '' : `<button class="dugme kucuk kirmizi" data-is="giderIptal" data-id="${x.id}">İptal</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Bu aralıkta gider yok.</p>'}</section>` : ''}`;
}

// ---------------------------------------------------------------------------
// RAPORLAR
// ---------------------------------------------------------------------------
async function raporGetir() {
  const bas = $('#r-bas')?.value || S.veri.bugun.slice(0, 8) + '01', bit = $('#r-bit')?.value || S.veri.bugun;
  try { S.rapor = await api(`/api/rapor?bas=${bas}&bit=${bit}`); ciz(); } catch (e) { bildir(e.message, 'hata'); }
}
const oranYaz = (x) => (x.giren ? `${x.gecen}/${x.giren} (%${Math.round((100 * x.gecen) / x.giren)})` : '—');
function raporlarCiz() {
  const r = S.rapor;
  const bas = r?.bas || S.veri.bugun.slice(0, 8) + '01', bit = r?.bit || S.veri.bugun;
  const satir = (x, cls = '') => `<tr class="${cls}"><td>${esc(x.sube)}</td><td class="sayi-h">${x.yeniKayit}</td><td class="sayi-h">${x.aktifOgrenci}</td><td class="sayi-h">${x.tamamlananDers}</td><td class="sayi-h">${x.gelmeyen}</td><td class="sayi-h">${oranYaz(x.eSinav)}</td><td class="sayi-h">${oranYaz(x.direksiyonSinav)}</td><td class="sayi-h">${tl(x.tahsilat)}</td><td class="sayi-h">${tl(x.gider)}</td><td class="sayi-h">${tl(x.net)}</td><td class="sayi-h">${tl(x.alacak)}</td><td class="sayi-h">${tl(x.geciken)}</td></tr>`;
  return `<section class="kart"><div class="baslik-satir"><h1>Raporlar</h1><div class="sag"><button class="dugme" data-is="raporCsv">Excel'e aktar (CSV)</button><button class="dugme" data-is="yazdir">Yazdır</button></div></div>
    <div class="suzgec"><label class="alan"><span>Başlangıç</span><input id="r-bas" type="date" value="${bas}" data-rapor></label><label class="alan"><span>Bitiş</span><input id="r-bit" type="date" value="${bit}" data-rapor></label></div>
    ${r ? `<h2>Şube karşılaştırması</h2><div class="tablo-kutu"><table><thead><tr><th>Şube</th><th class="sayi-h">Yeni kayıt</th><th class="sayi-h">Aktif öğr.</th><th class="sayi-h">Yapılan ders</th><th class="sayi-h">Gelmeyen</th><th class="sayi-h">E-sınav geçen</th><th class="sayi-h">Direksiyon geçen</th><th class="sayi-h">Tahsilat</th><th class="sayi-h">Gider</th><th class="sayi-h">Net</th><th class="sayi-h">Toplam alacak</th><th class="sayi-h">Geciken</th></tr></thead>
      <tbody>${r.satirlar.map((x) => satir(x)).join('')}${r.satirlar.length > 1 ? satir(r.toplam, 'toplam') : ''}</tbody></table></div>
      <p class="soluk kucuk">Aktif öğrenci, toplam alacak ve geciken bugünkü durumu gösterir; diğer sütunlar seçilen tarih aralığına göredir.</p>
      <h2>Eğitmenler</h2>${r.egitmenler.length ? `<div class="tablo-kutu"><table><thead><tr><th>Eğitmen</th><th>Şube</th><th class="sayi-h">Tamamlanan ders</th><th class="sayi-h">Toplam saat</th><th class="sayi-h">Gelmeyen</th></tr></thead><tbody>${r.egitmenler.map((e) => `<tr><td>${esc(e.ad)}</td><td>${esc(subeAd(e.sube_id) || 'Merkez yönetimi')}</td><td class="sayi-h">${e.tamamlanan}</td><td class="sayi-h">${(e.dakika / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</td><td class="sayi-h">${e.gelmeyen}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Bu aralıkta ders yok.</p>'}` : '<p class="bos">Yükleniyor…</p>'}</section>`;
}

// ---------------------------------------------------------------------------
// YÖNETİM
// ---------------------------------------------------------------------------
function yonetimCiz() {
  const v = S.veri, yon = ben().rol === 'yonetici';
  const personel = subeSuz(v.personel.filter((p) => yon || p.rol !== 'yonetici'));
  return `
  ${yon ? `<section class="kart"><div class="baslik-satir"><h1>Şubeler</h1><div class="sag"><button class="dugme ana" data-is="subeEkle">+ Şube aç</button></div></div>
    <div class="tablo-kutu"><table><thead><tr><th>Şube</th><th>Adres / telefon</th><th class="sayi-h">Aktif öğrenci</th><th class="sayi-h">Personel</th><th>Durum</th><th></th></tr></thead><tbody>
    ${v.subeler.map((s) => `<tr><td><b>${esc(s.ad)}</b>${s.merkez ? ' <span class="rozet">Merkez</span>' : ''}</td><td>${esc(s.adres)}<div class="kucuk soluk">${esc(s.telefon)}</div></td>
      <td class="sayi-h">${v.ogrenciler.filter((o) => o.sube_id === s.id && o.durum === 'aktif').length}</td><td class="sayi-h">${v.personel.filter((p) => p.sube_id === s.id && p.aktif).length}</td>
      <td>${s.aktif ? '<span class="rozet yesil">Açık</span>' : '<span class="rozet gri">Kapalı</span>'}</td><td><button class="dugme kucuk" data-is="subeDuzenle" data-id="${s.id}">Düzenle</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
  <section class="kart"><div class="baslik-satir"><h1>Personel</h1><div class="sag"><button class="dugme ana" data-is="personelEkle">+ Personel ekle</button></div></div>
    <p class="soluk kucuk">Yetkili (yönetici, şube müdürü) "Yetkili girişi"nden, büro personeli ve eğitmenler "Personel girişi"nden girer. Şube müdürü ve personel yalnız kendi şubesini görür.</p>
    <div class="tablo-kutu"><table><thead><tr><th>Ad</th><th>Kullanıcı adı</th><th>Görev</th><th>Şube</th><th>Yetkiler</th><th>Durum</th><th></th></tr></thead><tbody>
    ${personel.map((p) => `<tr class="${p.aktif ? '' : 'iptal'}"><td><b>${esc(p.ad)}</b><div class="kucuk soluk">${esc(p.telefon)}</div></td><td>${esc(p.kullanici_adi)}</td><td>${esc(v.tanimlar.roller[p.rol])}</td><td>${esc(p.sube_id ? subeAd(p.sube_id) : 'Bütün şubeler')}</td>
      <td class="kucuk">${['yonetici', 'sube_muduru'].includes(p.rol) ? 'Hepsi' : p.haklar.length ? p.haklar.map((h) => esc(v.tanimlar.haklar[h])).join(', ') : 'Yalnız kendi öğrencileri ve dersleri'}</td>
      <td>${p.aktif ? '<span class="rozet yesil">Açık</span>' : '<span class="rozet gri">Kapalı</span>'}</td><td><button class="dugme kucuk" data-is="personelDuzenle" data-id="${p.id}">Düzenle</button></td></tr>`).join('')}</tbody></table></div></section>
  <section class="kart"><div class="baslik-satir"><h1>Araçlar</h1><div class="sag"><button class="dugme" data-is="aracEkle">+ Araç ekle</button></div></div>
    ${subeSuz(v.araclar).length ? `<div class="tablo-kutu"><table><thead><tr><th>Plaka</th><th>Model</th><th>Sınıf</th><th>Şube</th><th>Durum</th><th></th></tr></thead><tbody>
    ${subeSuz(v.araclar).map((a) => `<tr><td><b>${esc(a.plaka)}</b></td><td>${esc(a.model)}</td><td>${esc(a.sinif)}</td><td>${esc(subeAd(a.sube_id))}</td><td>${a.aktif ? '<span class="rozet yesil">Kullanımda</span>' : '<span class="rozet gri">Kullanım dışı</span>'}</td><td><button class="dugme kucuk" data-is="aracDuzenle" data-id="${a.id}">Düzenle</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="bos">Araç yok.</p>'}</section>`;
}

function hesapCiz() {
  const b = ben();
  return `<section class="kart"><h1>Hesabım</h1><div class="detay-bilgi"><div><span>Ad</span>${esc(b.ad)}</div><div><span>Kullanıcı adı</span>${esc(b.kullanici_adi)}</div>
    <div><span>Görev</span>${esc(S.veri.tanimlar.roller[b.rol])}</div><div><span>Şube</span>${esc(b.sube_id ? subeAd(b.sube_id) : 'Bütün şubeler')}</div></div>
    <h3>Yetkilerim</h3><p class="kucuk">${b.haklar.length ? b.haklar.map((h) => esc(S.veri.tanimlar.haklar[h])).join(' · ') : 'Yalnız kendi öğrencileriniz ve dersleriniz.'}</p>
    <div class="dugmeler"><button class="dugme" data-is="sifreDegistir">Şifremi değiştir</button><button class="dugme kirmizi" data-is="cikis">Çıkış yap</button></div></section>`;
}

// ---------------------------------------------------------------------------
// EYLEMLER (düğmeler)
// ---------------------------------------------------------------------------
const ogrenciSecenek = (sadeceAktif = true, filtre = () => true) =>
  subeSuz(S.veri.ogrenciler).filter((o) => (!sadeceAktif || o.durum === 'aktif') && filtre(o)).map((o) => [o.id, `${o.ad} ${o.soyad} (${o.sinif})`]);
function ogrenciSorVeyaKullan(id, baslik, filtre, devam) {
  if (id) return devam(id);
  const l = ogrenciSecenek(true, filtre);
  if (!l.length) throw new Error('Uygun aktif öğrenci yok.');
  pencere(baslik, [{ ad: 'ogrenciId', etiket: 'Öğrenci', tip: 'select', secenekler: l, zorunlu: true }], async (v) => { setTimeout(() => devam(v.ogrenciId), 0); }, { dugme: 'Devam' });
}

const EYLEMLER = {
  ogrAc(id) { S.ogrId = id; S.sekme = 'ogrenci'; ciz(); window.scrollTo(0, 0); },
  cikis,
  yazdir() { window.print(); },
  gunKaydir(n) { S.dersGunu = gunEkle(S.dersGunu || S.veri.bugun, Number(n)); ciz(); },

  async dersTamam(id) {
    const d = S.veri.dersler.find((x) => x.id === id);
    const r = await islem('ders_sonuc', { id, durum: 'tamamlandi' }, { kuyruk: true, aciklama: `${ogrAd(d?.ogrenci_id)} dersi tamamlandı` });
    if (r.sirada && d) { d.durum = 'tamamlandi'; ciz(); } else bildir('Ders tamamlandı olarak kaydedildi.', 'tamam');
  },
  async dersGelmedi(id) {
    const d = S.veri.dersler.find((x) => x.id === id);
    pencere('Öğrenci gelmedi', [{ ad: 'notu', etiket: 'Not (isteğe bağlı)', tip: 'textarea' }], async (v) => {
      const r = await islem('ders_sonuc', { id, durum: 'gelmedi', notu: v.notu }, { kuyruk: true, aciklama: `${ogrAd(d?.ogrenci_id)} gelmedi` });
      if (r.sirada && d) { d.durum = 'gelmedi'; ciz(); }
    });
  },
  dersSaha(id) {
    const filtre = (o) => hak('ders') || o.egitmen_id === ben().id;
    ogrenciSorVeyaKullan(id, 'Yapılan ders', filtre, (ogrenciId) => {
      const o = ogr(ogrenciId);
      pencere(`Yapılan ders · ${o.ad} ${o.soyad}`, [
        { tip: 'bilgi', html: 'Ders şu anki saatle <b>tamamlandı</b> olarak kaydedilir ve merkeze anında düşer.' },
        { ad: 'dersTuru', etiket: 'Ders türü', tip: 'select', secenekler: [['direksiyon', 'Direksiyon'], ['teorik', 'Teorik']] },
        { ad: 'aracId', etiket: 'Araç', tip: 'select', secenekler: aracSecenek(o.sube_id) },
        { ad: 'sureDk', etiket: 'Süre (dakika)', tip: 'number', deger: 50 },
        { ad: 'notu', etiket: 'Not', tip: 'textarea' },
      ], async (v) => {
        const r = await islem('ders_saha', { ogrenciId, ...v, sureDk: Number(v.sureDk) }, { kuyruk: true, aciklama: `${o.ad} ${o.soyad} yapılan ders` });
        if (!r.sirada) bildir('Ders kaydedildi, merkeze iletildi.', 'tamam');
      });
    });
  },
  dersPlanla(id) {
    const filtre = (o) => hak('ders') || o.egitmen_id === ben().id;
    ogrenciSorVeyaKullan(id, 'Ders planla', filtre, (ogrenciId) => {
      const o = ogr(ogrenciId);
      const alanlar = [
        { ad: 'dersTuru', etiket: 'Ders türü', tip: 'select', secenekler: [['direksiyon', 'Direksiyon'], ['teorik', 'Teorik']] },
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: S.dersGunu || S.veri.bugun, zorunlu: true },
        { ad: 'saat', etiket: 'Saat', tip: 'time', deger: '09:00', zorunlu: true },
        { ad: 'sureDk', etiket: 'Süre (dakika)', tip: 'number', deger: 50 },
        { ad: 'aracId', etiket: 'Araç (direksiyon için)', tip: 'select', secenekler: aracSecenek(o.sube_id) },
      ];
      if (hak('ders')) alanlar.splice(1, 0, { ad: 'egitmenId', etiket: 'Eğitmen', tip: 'select', secenekler: egitmenSecenek(o.sube_id), deger: o.egitmen_id || '' });
      pencere(`Ders planla · ${o.ad} ${o.soyad}`, alanlar, async (v) => {
        await islem('ders_planla', { ogrenciId, ...v, sureDk: Number(v.sureDk) });
        bildir('Ders planlandı.', 'tamam');
      }, { ikili: true });
    });
  },

  ogrenciEkle() {
    const sube = varsayilanSube();
    const alanlar = [
      ...(cokSube() || ben().rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: subeSecenek(), deger: sube }] : []),
      { ad: 'sinif', etiket: 'Ehliyet sınıfı', tip: 'select', secenekler: sinifSecenek(), deger: 'B' },
      { ad: 'ad', etiket: 'Ad', zorunlu: true }, { ad: 'soyad', etiket: 'Soyad', zorunlu: true },
      { ad: 'tc', etiket: 'T.C. kimlik no', zorunlu: true }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel' },
      { ad: 'dogum', etiket: 'Doğum tarihi', tip: 'date' }, { ad: 'kayitTarihi', etiket: 'Kayıt tarihi', tip: 'date', deger: S.veri.bugun },
      { ad: 'egitmenId', etiket: 'Eğitmen', tip: 'select', secenekler: egitmenSecenek(sube), not: 'Şube değiştirirseniz eğitmeni sonra atayın.' },
      { ad: 'adres', etiket: 'Adres' },
      { ad: 'ucret', etiket: 'Kurs ücreti (₺)', tip: 'para' },
      ...(hak('tahsilat') ? [{ ad: 'pesinat', etiket: 'Peşinat, şimdi alınan (₺)', tip: 'para' }, { ad: 'pesinatYontem', etiket: 'Peşinat ödeme şekli', tip: 'select', secenekler: Object.entries(YONTEM) }] : []),
      { ad: 'taksitSayisi', etiket: 'Kalan kaç taksit?', tip: 'number', deger: 1, min: 1, max: 24 },
      { ad: 'ilkVade', etiket: 'İlk taksit tarihi', tip: 'date', deger: gunEkle(S.veri.bugun, 30) },
      { ad: 'portalSifre', etiket: 'Öğrenci giriş şifresi (isteğe bağlı)', tip: 'text', not: 'En az 6 karakter. Öğrenci kimlik no ve bu şifre ile girer.' },
      { ad: 'notlar', etiket: 'Not', tip: 'textarea' },
    ];
    pencere('Yeni öğrenci kaydı', alanlar, async (v) => {
      if (!v.subeId) v.subeId = sube;
      if (v.egitmenId && !egitmenSecenek(v.subeId).some(([id]) => id === v.egitmenId)) v.egitmenId = '';
      const r = await islem('ogrenci_ekle', { ...v, taksitSayisi: Number(v.taksitSayisi || 1) });
      bildir('Öğrenci kaydedildi.', 'tamam');
      S.ogrId = r.id; S.sekme = 'ogrenci'; ciz();
    }, { ikili: true });
  },
  ogrenciDuzenle(id) {
    const o = ogr(id), hassas = hak('hassas');
    pencere('Öğrenci bilgisi', [
      { ad: 'ad', etiket: 'Ad', deger: o.ad, zorunlu: true }, { ad: 'soyad', etiket: 'Soyad', deger: o.soyad, zorunlu: true },
      ...(hassas ? [{ ad: 'tc', etiket: 'T.C. kimlik no', deger: o.tc, zorunlu: true }, { ad: 'dogum', etiket: 'Doğum tarihi', tip: 'date', deger: o.dogum }] : []),
      { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: o.telefon },
      { ad: 'sinif', etiket: 'Ehliyet sınıfı', tip: 'select', secenekler: sinifSecenek(), deger: o.sinif },
      { ad: 'egitmenId', etiket: 'Eğitmen', tip: 'select', secenekler: egitmenSecenek(o.sube_id), deger: o.egitmen_id || '' },
      ...(hassas ? [{ ad: 'adres', etiket: 'Adres', deger: o.adres }] : []),
      { ad: 'notlar', etiket: 'Not', tip: 'textarea', deger: o.notlar },
    ], async (v) => { await islem('ogrenci_duzenle', { id, ...v }); bildir('Kaydedildi.', 'tamam'); }, { ikili: true });
  },
  ogrenciDurum(id) {
    const o = ogr(id);
    pencere('Kayıt durumu', [{ ad: 'durum', etiket: 'Durum', tip: 'select', secenekler: Object.entries(DURUM_OGR).map(([k, [e]]) => [k, e]), deger: o.durum },
      { tip: 'bilgi', html: 'Donduruldu veya İptal seçilirse öğrencinin planlı dersleri iptal edilir. Geçmiş kayıtlar silinmez.' }],
    async (v) => { await islem('ogrenci_durum', { id, durum: v.durum }); });
  },
  ogrenciPortal(id) {
    const o = ogr(id);
    pencere('Öğrenci girişi', [
      { tip: 'bilgi', html: `Öğrenci, <b>T.C. kimlik numarası</b> ve buraya yazdığınız şifre ile "Öğrenci girişi"nden girer; ders, sınav ve ödeme bilgilerini görür. Şu an: <b>${o.portal_acik ? 'açık' : 'kapalı'}</b>.` },
      { ad: 'sifre', etiket: 'Yeni şifre (en az 6 karakter). Boş bırakırsanız giriş kapatılır.', tip: 'text', deger: Math.random().toString(36).slice(2, 8) },
    ], async (v) => { await islem('ogrenci_portal', { id, sifre: v.sifre }); bildir(v.sifre ? `Şifre kaydedildi: ${v.sifre} · öğrenciye iletin.` : 'Öğrenci girişi kapatıldı.', 'tamam'); });
  },
  ogrenciNakil(id) {
    const o = ogr(id);
    pencere('Şubeler arası nakil', [
      { tip: 'bilgi', html: 'Öğrenci yeni şubeye geçer; eğitmeni boşaltılır ve planlı dersleri iptal edilir. Geçmiş ödeme, ders ve sınavlar eski şubenin hesabında kalır.' },
      { ad: 'subeId', etiket: 'Yeni şube', tip: 'select', secenekler: subeSecenek().filter(([sid]) => sid !== o.sube_id) },
    ], async (v) => { await islem('ogrenci_nakil', { id, subeId: v.subeId }); bildir('Nakil yapıldı.', 'tamam'); });
  },
  ogrenciUcret(id) {
    const o = ogr(id);
    pencere('Ücret ve taksit planı', [
      { tip: 'bilgi', html: `Ödenen: <b>${tl(o.hesap.odenen)}</b>. Kalan tutar yeni taksit sayısına eşit bölünür.` },
      { ad: 'ucret', etiket: 'Toplam kurs ücreti (₺)', tip: 'para', deger: o.hesap.ucret, zorunlu: true },
      { ad: 'taksitSayisi', etiket: 'Kalan kaç taksit?', tip: 'number', deger: Math.max(1, o.hesap.taksitler.filter((t) => t.durum !== 'odendi').length) },
      { ad: 'ilkVade', etiket: 'İlk taksit tarihi', tip: 'date', deger: o.hesap.siradaki?.vade || gunEkle(S.veri.bugun, 30) },
    ], async (v) => { await islem('ogrenci_ucret', { id, ...v, taksitSayisi: Number(v.taksitSayisi || 1) }); });
  },

  odemeAl(id) {
    ogrenciSorVeyaKullan(id, 'Ödeme al', (o) => o.hesap?.kalan > 0, (ogrenciId) => {
      const o = ogr(ogrenciId);
      pencere(`Ödeme al · ${o.ad} ${o.soyad}`, [
        { tip: 'bilgi', html: `Kalan borç: <b>${tl(o.hesap.kalan)}</b>${o.hesap.geciken ? ` · geciken <b>${tl(o.hesap.geciken)}</b>` : ''}${o.hesap.siradaki ? ` · sıradaki taksit ${tarih(o.hesap.siradaki.vade)} ${tl(o.hesap.siradaki.tutar - o.hesap.siradaki.odenen)}` : ''}` },
        { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', deger: o.hesap.geciken || (o.hesap.siradaki ? o.hesap.siradaki.tutar - o.hesap.siradaki.odenen : o.hesap.kalan), zorunlu: true },
        { ad: 'yontem', etiket: 'Ödeme şekli', tip: 'select', secenekler: Object.entries(YONTEM) },
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: S.veri.bugun },
        { ad: 'aciklama', etiket: 'Açıklama' },
      ], async (v) => { await islem('odeme_al', { ogrenciId, ...v }); bildir('Ödeme kaydedildi.', 'tamam'); });
    });
  },
  odemeIptal(id) {
    pencere('Ödeme iptali', [{ tip: 'bilgi', html: 'Ödeme silinmez; iptal edildi olarak işaretlenir ve kasadan düşer.' }, { ad: 'neden', etiket: 'İptal nedeni', zorunlu: true }],
      async (v) => { await islem('odeme_iptal', { id, neden: v.neden }); }, { dugme: 'İptal et' });
  },
  giderEkle() {
    pencere('Gider gir', [
      ...(cokSube() ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: subeSecenek(), deger: varsayilanSube() }] : []),
      { ad: 'kategori', etiket: 'Gider türü', tip: 'select', secenekler: ['Yakıt', 'Araç bakım', 'Kira', 'Maaş', 'Fatura', 'Sınav ücreti', 'Kırtasiye', 'Diğer'].map((x) => [x, x]) },
      { ad: 'tutar', etiket: 'Tutar (₺)', tip: 'para', zorunlu: true }, { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: S.veri.bugun }, { ad: 'aciklama', etiket: 'Açıklama' },
    ], async (v) => { await islem('gider_ekle', { subeId: v.subeId || varsayilanSube(), ...v }); });
  },
  giderIptal(id) { onayla('Bu gider iptal edilsin mi?', () => islem('gider_iptal', { id })); },

  sinavEkle(id) {
    ogrenciSorVeyaKullan(id, 'Sınava yaz', () => true, (ogrenciId) => {
      const o = ogr(ogrenciId);
      const esGecti = S.veri.sinavlar.some((s) => s.ogrenci_id === ogrenciId && s.tur === 'e_sinav' && s.sonuc === 'gecti');
      pencere(`Sınava yaz · ${o.ad} ${o.soyad}`, [
        { ad: 'sinavTuru', etiket: 'Sınav türü', tip: 'select', secenekler: [['e_sinav', 'E-sınav (teorik)'], ['direksiyon', 'Direksiyon sınavı']], deger: esGecti ? 'direksiyon' : 'e_sinav' },
        { ad: 'tarih', etiket: 'Tarih', tip: 'date', deger: gunEkle(S.veri.bugun, 7), zorunlu: true }, { ad: 'saat', etiket: 'Saat', tip: 'time' },
      ], async (v) => { await islem('sinav_ekle', { ogrenciId, ...v }); bildir('Sınav kaydı yapıldı.', 'tamam'); });
    });
  },
  sinavSonuc(id) {
    const s = S.veri.sinavlar.find((x) => x.id === id);
    pencere(`${SINAV_AD[s.tur]} sonucu · ${ogrAd(s.ogrenci_id)}`, [
      { ad: 'sonuc', etiket: 'Sonuç', tip: 'select', secenekler: Object.entries(DURUM_SINAV).map(([k, [e]]) => [k, e]), deger: s.sonuc },
      ...(s.tur === 'e_sinav' ? [{ ad: 'puan', etiket: 'Puan (0-100)', tip: 'number', deger: s.puan ?? '', not: 'Puan girilirse 70 ve üstü "Geçti" sayılır.' }] : [{ tip: 'bilgi', html: 'Direksiyon sınavını geçen öğrencinin kaydı "Tamamlandı" olur.' }]),
      { ad: 'notu', etiket: 'Not', deger: s.notu },
    ], async (v) => { await islem('sinav_sonuc', { id, ...v }); });
  },

  subeEkle() {
    pencere('Yeni şube', [{ ad: 'ad', etiket: 'Şube adı', zorunlu: true }, { ad: 'adres', etiket: 'Adres' }, { ad: 'telefon', etiket: 'Telefon', tip: 'tel' }],
      async (v) => { await islem('sube_ekle', v); bildir('Şube açıldı. Şimdi şube müdürü ve personel ekleyebilirsiniz.', 'tamam'); });
  },
  subeDuzenle(id) {
    const s = S.veri.subeler.find((x) => x.id === id);
    pencere('Şube bilgisi', [{ ad: 'ad', etiket: 'Şube adı', deger: s.ad, zorunlu: true }, { ad: 'adres', etiket: 'Adres', deger: s.adres }, { ad: 'telefon', etiket: 'Telefon', deger: s.telefon },
      ...(s.merkez ? [] : [{ ad: 'aktif', etiket: 'Şube açık (kapatılırsa o şubenin personeli giriş yapamaz)', tip: 'onay', deger: !!s.aktif }])],
    async (v) => { await islem('sube_duzenle', { id, ...v }); });
  },
  personelEkle() { personelPenceresi(null); },
  personelDuzenle(id) { personelPenceresi(S.veri.personel.find((p) => p.id === id)); },
  aracEkle() {
    pencere('Araç ekle', [
      ...(cokSube() || ben().rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: subeSecenek(), deger: varsayilanSube() }] : []),
      { ad: 'plaka', etiket: 'Plaka', zorunlu: true }, { ad: 'model', etiket: 'Marka / model' }, { ad: 'sinif', etiket: 'Sınıf', tip: 'select', secenekler: sinifSecenek(), deger: 'B' },
    ], async (v) => { await islem('arac_ekle', { subeId: v.subeId || varsayilanSube(), ...v }); });
  },
  aracDuzenle(id) {
    const a = S.veri.araclar.find((x) => x.id === id);
    pencere(`Araç · ${a.plaka}`, [
      ...(ben().rol === 'yonetici' ? [{ ad: 'subeId', etiket: 'Şube', tip: 'select', secenekler: subeSecenek(), deger: a.sube_id }] : []),
      { ad: 'model', etiket: 'Marka / model', deger: a.model }, { ad: 'sinif', etiket: 'Sınıf', tip: 'select', secenekler: sinifSecenek(), deger: a.sinif },
      { ad: 'aktif', etiket: 'Kullanımda', tip: 'onay', deger: !!a.aktif },
    ], async (v) => { await islem('arac_duzenle', { id, ...v }); });
  },
  sifreDegistir() {
    pencere('Şifre değiştir', [{ ad: 'eskiSifre', etiket: 'Mevcut şifre', tip: 'password', zorunlu: true, otomatik: 'current-password' },
      { ad: 'yeniSifre', etiket: 'Yeni şifre (en az 8 karakter)', tip: 'password', zorunlu: true, otomatik: 'new-password' }],
    async (v) => { await islem('sifre_degistir', v); bildir('Şifreniz değiştirildi.', 'tamam'); });
  },
  raporCsv() {
    const r = S.rapor;
    if (!r) return;
    const tlc = (k) => (k / 100).toFixed(2).replace('.', ',');
    const satir = (x) => [x.sube, x.yeniKayit, x.aktifOgrenci, x.tamamlananDers, x.gelmeyen, x.eSinav.gecen, x.eSinav.giren, x.direksiyonSinav.gecen, x.direksiyonSinav.giren, tlc(x.tahsilat), tlc(x.gider), tlc(x.net), tlc(x.alacak), tlc(x.geciken)];
    const l = [['Şube', 'Yeni kayıt', 'Aktif öğrenci', 'Yapılan ders', 'Gelmeyen', 'E-sınav geçen', 'E-sınava giren', 'Direksiyon geçen', 'Direksiyona giren', 'Tahsilat', 'Gider', 'Net', 'Toplam alacak', 'Geciken'], ...r.satirlar.map(satir), satir(r.toplam)];
    const csv = '﻿' + l.map((s) => s.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `sube-raporu-${r.bas}-${r.bit}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

function personelPenceresi(p) {
  const yon = ben().rol === 'yonetici';
  const roller = Object.entries(S.veri.tanimlar.roller).filter(([k]) => yon || ['buro', 'egitmen'].includes(k));
  const haklar = Object.entries(S.veri.tanimlar.haklar).filter(([k]) => k !== 'personel');
  const kendisi = p && p.id === ben().id;
  const alanlar = [
    { ad: 'ad', etiket: 'Ad soyad', deger: p?.ad, zorunlu: true },
    ...(p ? [] : [{ ad: 'kullaniciAdi', etiket: 'Kullanıcı adı', zorunlu: true }]),
    { ad: 'telefon', etiket: 'Telefon', tip: 'tel', deger: p?.telefon },
    ...(kendisi ? [] : [
      { ad: 'rol', etiket: 'Görev', tip: 'select', secenekler: roller, deger: p?.rol || 'egitmen' },
      ...(yon ? [{ ad: 'subeId', etiket: 'Şube (yönetici için önemsiz)', tip: 'select', secenekler: subeSecenek(), deger: p?.sube_id || varsayilanSube() }] : []),
      { tip: 'bilgi', html: 'Aşağıdaki yetkiler yalnız <b>büro personeli</b> ve <b>eğitmen</b> için geçerlidir. Yönetici ve şube müdürü her şeyi yapar. Hiçbir kutu işaretli olmayan eğitmen yalnız kendi öğrencilerini ve derslerini görür, para bilgisi görmez.' },
      { ad: 'yetkiler', etiket: 'Yetkiler', tip: 'haklar', secenekler: haklar, deger: p ? p.haklar : ['ders'].filter(() => false) },
    ]),
    { ad: p ? 'yeniSifre' : 'sifre', etiket: p ? 'Yeni şifre (değiştirmeyecekseniz boş bırakın)' : 'Şifre (en az 8 karakter)', tip: 'text', zorunlu: !p },
    ...(p && !kendisi ? [{ ad: 'aktif', etiket: 'Giriş açık', tip: 'onay', deger: !!p.aktif }] : []),
  ];
  pencere(p ? `Personel · ${p.ad}` : 'Personel ekle', alanlar, async (v) => {
    if (!yon) v.subeId = ben().sube_id;
    if (p) await islem('personel_duzenle', { id: p.id, ...v, yeniSifre: v.yeniSifre || undefined });
    else await islem('personel_ekle', v);
    bildir('Kaydedildi.', 'tamam');
  });
}

// ---------------------------------------------------------------------------
// ÖĞRENCİ EKRANI
// ---------------------------------------------------------------------------
function ogrenciCiz() {
  const v = S.ogrenci;
  if (!v) return;
  const b = v.ben, g = v.gerekli, h = v.hesap;
  const yaklasan = v.dersler.filter((d) => d.durum === 'planli' && d.tarih >= v.bugun).reverse();
  const yapilan = v.dersler.filter((d) => d.durum !== 'planli');
  $('#uygulama').innerHTML = `
  <header class="ust"><div><div class="kurum">${esc(v.kurum?.ad || '')}</div><div class="kim">${esc(b.ad)} ${esc(b.soyad)} · Öğrenci</div></div>
    <div class="sag"><button class="dugme kucuk" id="ogr-cikis">Çıkış</button></div></header>
  <main>
    <section class="kart"><h1>Merhaba ${esc(b.ad)}</h1><div class="detay-bilgi">
      <div><span>Ehliyet sınıfı</span>${esc(b.sinif_ad)}</div><div><span>Şube</span>${esc(b.sube)}${b.sube_telefon ? `<div><a href="tel:${esc(b.sube_telefon.replace(/\s/g, ''))}">${esc(b.sube_telefon)}</a></div>` : ''}</div>
      <div><span>Eğitmenim</span>${esc(b.egitmen || 'Henüz atanmadı')}</div><div><span>Kayıt durumu</span>${rozet(DURUM_OGR, b.durum)}</div></div></section>
    <div class="izgara">
      <section class="kart"><h2>Ders ilerlemem</h2>${g ? `
        <div class="ilerleme"><div class="satir"><span>Teorik</span><span>${v.sayac.teorik} / ${g.teorik} ders</span></div><progress max="${g.teorik}" value="${v.sayac.teorik}"></progress></div>
        <div class="ilerleme"><div class="satir"><span>Direksiyon</span><span>${v.sayac.direksiyon} / ${g.direksiyon} ders</span></div><progress max="${g.direksiyon}" value="${v.sayac.direksiyon}"></progress></div>` : ''}
        <h3>Yaklaşan derslerim</h3>${yaklasan.length ? `<table><tbody>${yaklasan.map((d) => `<tr><td>${tarih(d.tarih)} ${esc(d.saat)}</td><td>${DERS_AD[d.tur]}</td><td>${d.sure_dk} dk</td></tr>`).join('')}</tbody></table>` : '<p class="bos">Planlı ders yok.</p>'}</section>
      <section class="kart"><h2>Sınav sonuçlarım</h2>${v.sinavlar.length ? `<table><tbody>${v.sinavlar.map((s) => `<tr><td>${tarih(s.tarih)} ${esc(s.saat)}</td><td>${SINAV_AD[s.tur]}<div class="kucuk soluk">${s.deneme}. hak (en fazla ${v.sinavHakki})</div></td><td>${rozet(DURUM_SINAV, s.sonuc)}${s.puan !== null ? ` <b>${s.puan} puan</b>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="bos">Henüz sınav kaydınız yok.</p>'}</section>
      <section class="kart"><h2>Ödeme durumum</h2><div class="detay-bilgi"><div><span>Kurs ücreti</span>${tl(h.ucret)}</div><div><span>Ödenen</span>${tl(h.odenen)}</div><div><span>Kalan</span><b>${tl(h.kalan)}</b></div>
        ${h.geciken ? `<div><span>Geciken</span><span class="rozet kirmizi">${tl(h.geciken)}</span></div>` : ''}</div>
        ${h.taksitler.length ? `<h3>Taksitlerim</h3><table><tbody>${h.taksitler.map((t) => `<tr><td>${tarih(t.vade)}</td><td class="sayi-h">${tl(t.tutar)}</td><td>${rozet({ odendi: ['Ödendi', 'yesil'], gecikti: ['Gecikti', 'kirmizi'], bekliyor: ['Bekliyor', 'gri'] }, t.durum)}</td></tr>`).join('')}</tbody></table>` : ''}</section>
      <section class="kart"><h2>Yapılan derslerim</h2>${yapilan.length ? `<table><tbody>${yapilan.slice(0, 50).map((d) => `<tr><td>${tarih(d.tarih)} ${esc(d.saat)}</td><td>${DERS_AD[d.tur]}</td><td>${rozet(DURUM_DERS, d.durum)}</td></tr>`).join('')}</tbody></table>` : '<p class="bos">Henüz ders yok.</p>'}</section>
    </div>
  </main>`;
  $('#ogr-cikis').onclick = cikis;
}
setInterval(() => { if (S.tur === 'ogrenci' && document.visibilityState === 'visible') yenile(); }, 60000);

basla();
