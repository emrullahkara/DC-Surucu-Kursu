// Hesap ve doğrulama kuralları. Veritabanına dokunmaz, bu yüzden tek başına test edilebilir.
// Bütün tutarlar KURUŞ cinsindendir (tam sayı). 1.250,50 TL = 125050.

export class IsHatasi extends Error {
  constructor(mesaj, durum = 400) {
    super(mesaj);
    this.durum = durum;
  }
}
export const fail = (mesaj, durum = 400) => {
  throw new IsHatasi(mesaj, durum);
};

export function metin(v, max = 200, zorunlu = false, ad = 'Alan') {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') fail(`${ad} geçersiz.`);
  const s = String(v).trim();
  if (zorunlu && !s) fail(`${ad} boş bırakılamaz.`);
  if (s.length > max) fail(`${ad} en fazla ${max} karakter olabilir.`);
  return s;
}

export function kurus(v, ad = 'Tutar', sifirOlabilir = true) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000_00) fail(`${ad} geçersiz.`);
  if (!sifirOlabilir && n === 0) fail(`${ad} sıfır olamaz.`);
  return n;
}

export function tamSayi(v, min, max, ad = 'Sayı') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${ad} ${min} ile ${max} arasında olmalı.`);
  return n;
}

export function gun(v, ad = 'Tarih', zorunlu = true) {
  if (!v && !zorunlu) return '';
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) fail(`${ad} geçersiz.`);
  return s;
}

export function saat(v, zorunlu = false) {
  if (!v && !zorunlu) return '';
  const s = String(v || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) fail('Saat geçersiz (örnek 09:30).');
  return s;
}

export function secim(v, liste, ad = 'Seçim') {
  if (!liste.includes(v)) fail(`${ad} geçersiz.`);
  return v;
}

export const bugun = (d = new Date()) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
};

// T.C. kimlik numarası doğrulama (resmi algoritma).
export function tcGecerli(tc) {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = [...tc].map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  if ((((tek * 7 - cift) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}
export const tcMaskele = (tc) => (tc ? tc.slice(0, 3) + '******' + tc.slice(-2) : '');

// Ehliyet sınıfları ve zorunlu ders saatleri.
// DİKKAT: saatler yaygın uygulamaya göre yazıldı; kurumun kendi mevzuat bilgisiyle doğrulanmalı.
export const SINIFLAR = {
  B: { ad: 'B (Otomobil)', teorik: 34, direksiyon: 14 },
  'B Otomatik': { ad: 'B Otomatik', teorik: 34, direksiyon: 14 },
  A1: { ad: 'A1 (Motosiklet)', teorik: 34, direksiyon: 12 },
  A2: { ad: 'A2 (Motosiklet)', teorik: 34, direksiyon: 12 },
  A: { ad: 'A (Motosiklet)', teorik: 34, direksiyon: 12 },
  M: { ad: 'M (Motorlu bisiklet)', teorik: 34, direksiyon: 10 },
  C: { ad: 'C (Kamyon)', teorik: 34, direksiyon: 16 },
  D: { ad: 'D (Otobüs)', teorik: 34, direksiyon: 16 },
  CE: { ad: 'CE (Çekici)', teorik: 34, direksiyon: 16 },
};
export const SINAV_HAKKI = 4; // Her sınav türü için kurala göre en fazla deneme; doğrulanmalı.

// Taksit planı: kalan tutar eşit bölünür, kuruş artığı son taksite eklenir.
// Peşinat varsa kayıt günü vadeli ilk satır olarak eklenir.
export function taksitPlani(toplam, pesinat, sayi, ilkVade, kayitGunu) {
  if (pesinat > toplam) fail('Peşinat toplam ücretten büyük olamaz.');
  const satirlar = [];
  if (pesinat > 0) satirlar.push({ vade: kayitGunu, tutar: pesinat });
  const kalan = toplam - pesinat;
  if (kalan === 0) return satirlar;
  if (sayi < 1) fail('Taksit sayısı en az 1 olmalı.');
  const parca = Math.floor(kalan / sayi);
  const [y, a, g] = ilkVade.split('-').map(Number);
  for (let i = 0; i < sayi; i++) {
    const d = new Date(Date.UTC(y, a - 1 + i, 1));
    const ayinSonGunu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(g, ayinSonGunu));
    satirlar.push({ vade: d.toISOString().slice(0, 10), tutar: i === sayi - 1 ? kalan - parca * (sayi - 1) : parca });
  }
  return satirlar;
}

// Öğrencinin para durumu. Ödemeler vadesi en eski taksitten başlayarak kapatılır.
export function hesapDurumu(ucret, taksitler, odenen, gunStr = bugun()) {
  const kalan = ucret - odenen;
  const vadesiGelen = taksitler.filter((t) => t.vade <= gunStr).reduce((a, t) => a + t.tutar, 0);
  const geciken = Math.max(0, vadesiGelen - odenen);
  let dagit = odenen;
  const satirlar = taksitler
    .slice()
    .sort((x, y) => (x.vade < y.vade ? -1 : x.vade > y.vade ? 1 : 0))
    .map((t) => {
      const kapanan = Math.min(t.tutar, Math.max(0, dagit));
      dagit -= kapanan;
      return { ...t, odenen: kapanan, durum: kapanan === t.tutar ? 'odendi' : t.vade <= gunStr ? 'gecikti' : 'bekliyor' };
    });
  const siradaki = satirlar.find((t) => t.durum !== 'odendi') || null;
  return { ucret, odenen, kalan, geciken, taksitler: satirlar, siradaki };
}

export const tlYaz = (k) =>
  (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
