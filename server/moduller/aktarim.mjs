// Kurumun bütün verisini dışarı alması (kurum sahibi): sözleşme bitince ya da kendi arşivi için.
// Şifreler, oturumlar, doğrulama anahtarları ve sanal POS / SMS gizli bilgileri verilmez; evrak dosyaları
// (şifreli saklananlar dahil) açılmış olarak eklenir. Her dışa aktarma kişisel veri erişim kaydına yazılır.
import { fail } from '../domain.mjs';

const VERILMEZ = new Set(['oturumlar', 'giris_denemeleri', 'islem_kayit', 'sistem_anahtarlari', 'sifre_talepleri', 'test_oturumlari']);
const GIZLI_SUTUN = { kullanicilar: ['sifre', 'totp_gizli', 'totp_bekleyen', 'totp_kurtarma', 'totp_son_adim'], ogrenciler: ['portal_sifre'] };

export default {
  ad: 'aktarim',
  yol(c, k, { yontem, yol }) {
    if (yol !== '/api/disa-aktar' || yontem !== 'GET') return null;
    if (k.rol !== 'yonetici') fail('Bütün veriyi yalnız yönetici dışarı alır.', 403);
    const tablolar = c.q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map((x) => x.name);
    const veri = { surum: 1, kurum: c.q1('SELECT ad FROM kurum')?.ad || '', tarih: new Date().toISOString(), tablolar: {} };
    for (const t of tablolar) {
      if (VERILMEZ.has(t)) continue;
      let satirlar = c.q(`SELECT * FROM "${t}"`);
      if (GIZLI_SUTUN[t]) satirlar = satirlar.map((r) => { const x = { ...r }; for (const s of GIZLI_SUTUN[t]) delete x[s]; return x; });
      if (t === 'evrak_dosyalari') satirlar = satirlar.map((r) => ({ evrak_id: r.evrak_id, veri: c.sifre.coz(r.veri).toString('base64') }));
      if (t === 'ayarlar') satirlar = satirlar.map((r) => {
        if (r.anahtar !== 'pos' && r.anahtar !== 'sms') return r;
        try { const d = JSON.parse(r.deger); delete d.gizli; delete d.anahtar; delete d.sifre; return { ...r, deger: JSON.stringify(d) }; } catch { return r; }
      });
      veri.tablolar[t] = satirlar.map((r) => Object.fromEntries(Object.entries(r).map(([a, v]) => [a, v instanceof Uint8Array || v instanceof ArrayBuffer ? Buffer.from(v).toString('base64') : v])));
    }
    c.erisimYaz(k, null, 'disa_aktar', 'Kurumun bütün verisi dışarı alındı');
    c.olayYayinla(k, null, 'guvenlik', `${k.ad} kurumun bütün verisini dışarı aldı`);
    return { durum: 200, ham: { basliklar: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="dc-kurs-verileri-${c.bugunStr()}.json"` }, govde: JSON.stringify(veri) } };
  },
};
