// Ekranın ortak küçük işlevleri: para, tarih, adlar.
export const tl = (k: number | undefined | null) =>
  ((k || 0) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
export const paraYaz = (k: number | undefined | null) =>
  k ? (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
export function paraOku(s: string): number {
  let t = String(s ?? '').trim().replace(/[\s₺]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error('Tutar geçersiz. Örnek: 1.500,00');
  return Math.round(n * 100);
}
export const tarih = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');
export const zamanYaz = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const gunEkle = (g: string, n: number) => {
  const d = new Date(g + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const gunFarki = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
export const ayBasi = (g: string) => g.slice(0, 8) + '01';
export const gunAdi = (g: string) => new Date(g + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', timeZone: 'UTC' });
export const yeniNo = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
export const telLink = (t: string) => 'tel:' + t.replace(/[^\d+]/g, '');
// WhatsApp'ta hazır mesaj açar (karar 14). Türkiye numarası 0 ile başlıyorsa 90 eklenir.
export function whatsapp(telefon: string, mesaj: string) {
  let n = telefon.replace(/\D/g, '');
  if (n.startsWith('0')) n = '9' + n;
  else if (n.length === 10) n = '90' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(mesaj)}`;
}
export const kucukHarf = (s: string) => s.toLocaleLowerCase('tr-TR');

export const DURUM_OGR: Record<string, [string, string]> = { aktif: ['Aktif', 'yesil'], dondu: ['Donduruldu', 'sari'], tamamlandi: ['Tamamlandı', ''], iptal: ['İptal', 'gri'] };
export const DURUM_DERS: Record<string, [string, string]> = { planli: ['Planlı', ''], tamamlandi: ['Tamamlandı', 'yesil'], gelmedi: ['Gelmedi', 'kirmizi'], iptal: ['İptal', 'gri'] };
export const DURUM_SINAV: Record<string, [string, string]> = { bekliyor: ['Sonuç bekleniyor', 'sari'], gecti: ['Geçti', 'yesil'], kaldi: ['Kaldı', 'kirmizi'], girmedi: ['Girmedi', 'gri'] };
export const DURUM_TAKSIT: Record<string, [string, string]> = { odendi: ['Ödendi', 'yesil'], gecikti: ['Gecikti', 'kirmizi'], bekliyor: ['Bekliyor', 'gri'] };
export const SINAV_AD: Record<string, string> = { e_sinav: 'E-sınav', direksiyon: 'Direksiyon sınavı' };
export const DERS_AD: Record<string, string> = { teorik: 'Teorik', direksiyon: 'Direksiyon' };
export const YONTEM: Record<string, string> = { nakit: 'Nakit', kart: 'Kredi kartı', havale: 'Havale / EFT', internet: 'İnternetten kart', veresiye: 'Veresiye' };

// Excel'in doğrudan açtığı, Türkçe karakterleri bozmayan CSV (noktalı virgül ayraçlı).
// "=", "+", "-", "@" ile başlayan yazılar Excel'de formül gibi çalışabilir; başına ' eklenir (sayılar hariç).
function csvHucre(h: string | number) {
  let t = String(h ?? '');
  if (/^[=+\-@\t\r]/.test(t) && !/^-?[\d.,]+$/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}
export function csvIndir(ad: string, satirlar: (string | number)[][]) {
  const csv = '﻿' + satirlar.map((s) => s.map(csvHucre).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = ad;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const tlCsv = (k: number) => (k / 100).toFixed(2).replace('.', ',');
