// E-sınav deneme testi soru bankası (yönetici): soru ekleme, düzenleme, kaldırma, Excel'den toplu yükleme.
// Pencere ekran bağlamının dışında çizilir; gerekenler dışarıdan verilir.
import { useState } from 'react';
import { islem } from '../api';
import { excelIndir, tabloOku, baslikSade } from '../excel';
import type { Soru } from '../tipler';
import { IsDugmesi, bildir, pencereKapat } from './ortak';

const bos = (konu: string) => ({ id: '', konu, metin: '', secenekler: ['', '', '', ''], dogru: 0, aciklama: '' });

export function SoruBankasi({ sorular, konular, yenile }: { sorular: Soru[]; konular: string[]; yenile: () => Promise<void> }) {
  const [liste, setListe] = useState(sorular);
  const [konu, setKonu] = useState('');
  const [form, setForm] = useState<ReturnType<typeof bos> | null>(null);
  const [hata, setHata] = useState('');
  const gorunen = liste.filter((q) => !konu || q.konu === konu);
  const tazele = async () => { await yenile(); };
  const kaydet = async () => {
    if (!form) return;
    const secenekler = form.secenekler.map((x) => x.trim()).filter(Boolean);
    const r = await islem<{ id?: string }>('soru_kaydet', { id: form.id || undefined, konu: form.konu, metin: form.metin, secenekler, dogru: form.dogru, aciklama: form.aciklama });
    const yeni = { ...form, id: form.id || r.id || String(Math.random()), secenekler, kaynak: 'kurum' } as Soru;
    setListe((l) => (form.id ? l.map((q) => (q.id === form.id ? yeni : q)) : [...l, yeni]));
    setForm(null); await tazele(); bildir('Soru kaydedildi.', 'tamam');
  };
  const sablon = () => excelIndir('soru-sablonu.xlsx', [['Konu', 'Soru', 'A', 'B', 'C', 'D', 'Doğru (A/B/C/D)', 'Açıklama'], [konular[0], 'Örnek soru metni?', 'Birinci seçenek', 'İkinci seçenek', 'Üçüncü', 'Dördüncü', 'A', '']], 'Sorular');
  const yukle = async (f: File) => {
    setHata('');
    try {
      const t = await tabloOku(f);
      const b = t[0].map(baslikSade);
      const i = (ad: string[]) => b.findIndex((x) => ad.includes(x));
      const ik = i(['konu']), is = i(['soru', 'sorumetni']), idg = i(['dogru', 'dogrucevap', 'dogruabcd', 'cevap']), ia = i(['aciklama']);
      const secSut = ['a', 'b', 'c', 'd', 'e'].map((h) => i([h, `secenek${h}`]));
      if (is < 0 || idg < 0 || secSut[0] < 0 || secSut[1] < 0) throw new Error('Başlıklar: Konu, Soru, A, B, C, D, Doğru (A/B/C/D), Açıklama olmalı. Şablonu indirip kullanın.');
      const satirlar = t.slice(1).map((r, n) => {
        const sec = secSut.filter((x) => x >= 0).map((x) => String(r[x] ?? '').trim()).filter(Boolean);
        const harf = String(r[idg] ?? '').trim().toLocaleUpperCase('tr-TR');
        return { satirNo: n + 2, konu: ik >= 0 ? String(r[ik] || '').trim() : konular[0], metin: String(r[is] || '').trim(), secenekler: sec, dogru: 'ABCDE'.indexOf(harf), aciklama: ia >= 0 ? String(r[ia] || '') : '' };
      });
      const s = await islem<{ eklenen: number; hatalar: { satir: number; hata: string }[] }>('soru_toplu_ekle', { sorular: satirlar });
      await tazele();
      bildir(`${s.eklenen} soru yüklendi.${s.hatalar.length ? ` ${s.hatalar.length} satır atlandı.` : ''}`, s.hatalar.length ? 'hata' : 'tamam');
      if (s.hatalar.length) setHata(s.hatalar.slice(0, 10).map((x) => `Satır ${x.satir}: ${x.hata}`).join(' · '));
      pencereKapat();
    } catch (e) { setHata((e as Error).message); }
  };
  if (form) return (
    <div>
      {hata && <div className="hata">{hata}</div>}
      <label className="alan"><span>Konu</span><select value={form.konu} onChange={(e) => setForm({ ...form, konu: e.target.value })}>{konular.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="alan"><span>Soru</span><textarea rows={3} value={form.metin} onChange={(e) => setForm({ ...form, metin: e.target.value })} /></label>
      {form.secenekler.map((x, i) => (
        <label key={i} className="alan"><span>{'ABCDE'[i]} seçeneği {i === form.dogru ? '(doğru cevap)' : ''}</span>
          <div style={{ display: 'flex', gap: 6 }}><input value={x} onChange={(e) => setForm({ ...form, secenekler: form.secenekler.map((y, j) => (j === i ? e.target.value : y)) })} />
            <button type="button" className={'dugme kucuk' + (i === form.dogru ? ' secili-d' : '')} onClick={() => setForm({ ...form, dogru: i })}>Doğru</button></div></label>
      ))}
      <label className="alan"><span>Açıklama (test bitince gösterilir)</span><input value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} /></label>
      <div className="alt"><button type="button" className="dugme" onClick={() => setForm(null)}>Vazgeç</button>
        <IsDugmesi className="dugme ana" is={async () => { try { await kaydet(); } catch (e) { setHata((e as Error).message); } }}>Kaydet</IsDugmesi></div>
    </div>
  );
  return (
    <div>
      {hata && <div className="hata">{hata}</div>}
      <div className="suzgec">
        <select value={konu} onChange={(e) => setKonu(e.target.value)}><option value="">Bütün konular ({liste.length})</option>{konular.map((k) => <option key={k} value={k}>{k} ({liste.filter((q) => q.konu === k).length})</option>)}</select>
        <button type="button" className="dugme" onClick={() => setForm(bos(konu || konular[0]))}>+ Soru</button>
        <button type="button" className="dugme" onClick={sablon}>Excel şablonu</button>
        <label className="dugme" style={{ textAlign: 'center' }}>Excel'den yükle<input type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) yukle(f); }} /></label>
      </div>
      <ul className="liste" style={{ maxHeight: 420, overflowY: 'auto' }}>{gorunen.map((q) => (
        <li key={q.id}><div style={{ flex: '1 1 300px' }}><b className="kucuk">{q.konu}</b>{q.kaynak === 'ornek' && <span className="rozet gri">örnek</span>}<div>{q.metin}</div>
          <div className="kucuk soluk">Doğru: {q.secenekler[q.dogru]}</div></div>
          <span className="dugmeler"><button type="button" className="dugme kucuk" onClick={() => setForm({ id: q.id, konu: q.konu, metin: q.metin, secenekler: [...q.secenekler, '', '', '', ''].slice(0, Math.max(4, q.secenekler.length)), dogru: q.dogru, aciklama: q.aciklama })}>Düzenle</button>
            <IsDugmesi className="dugme kucuk kirmizi" is={async () => { await islem('soru_sil', { id: q.id }); setListe((l) => l.filter((x) => x.id !== q.id)); await tazele(); }}>Kaldır</IsDugmesi></span></li>
      ))}</ul>
      <div className="alt"><button type="button" className="dugme" onClick={pencereKapat}>Kapat</button></div>
    </div>
  );
}
