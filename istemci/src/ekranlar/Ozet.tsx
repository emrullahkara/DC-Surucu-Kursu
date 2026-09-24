// Özet (merkez ve şube) ve eğitmen için "Sahada" ekranı.
import { useY, type EkranP } from '../baglam';
import { DersTablosu } from '../bilesenler/DersTablosu';
import { Bos, IsDugmesi, Kart, Rozet, Sayi } from '../bilesenler/ortak';
import { eylemler } from '../eylemler';
import { DERS_AD, DURUM_DERS, SINAV_AD, gunEkle, gunFarki, tarih, telLink, tl, whatsapp, zamanYaz } from '../yardim';

export function Ozet(p: EkranP) {
  const y = useY();
  if (y.b.v.ben.rol === 'egitmen') return <Sahada />;
  const { v } = y.b;
  const E = eylemler(y.b);
  const bugun = v.bugun;
  const ogrenciler = y.subeSuz(v.ogrenciler);
  const aktif = ogrenciler.filter((o) => o.durum === 'aktif');
  const bugunDers = y.subeSuz(v.dersler).filter((d) => d.tarih === bugun && d.durum !== 'iptal').sort((a, b) => (a.saat > b.saat ? 1 : -1));
  const bugunTeorik = y.subeSuz(v.teorikOturumlar).filter((o) => o.tarih === bugun && o.durum !== 'iptal');
  const yaklasanSinav = y.subeSuz(v.sinavlar).filter((s) => s.sonuc === 'bekliyor' && s.tarih >= bugun && s.tarih <= gunEkle(bugun, 7)).sort((a, b) => (a.tarih > b.tarih ? 1 : -1));
  const sonucBekleyen = y.subeSuz(v.sinavlar).filter((s) => s.sonuc === 'bekliyor' && s.tarih < bugun);
  const geciken = y.hak('tahsilat') ? ogrenciler.filter((o) => (o.hesap?.geciken || 0) > 0 && o.durum !== 'iptal') : [];
  const bugunTahsilat = y.subeSuz(v.odemeler).filter((o) => o.tarih === bugun && !o.iptal).reduce((a, o) => a + (o.tur === 'iade' ? -o.tutar : o.tutar), 0);
  const olaylar = (v.olaylar || []).filter((o) => !y.b.sube || !o.sube_id || o.sube_id === y.b.sube);
  const aracUyari = y.subeSuz(v.araclar).filter((a) => a.aktif).flatMap((a) =>
    ([['muayene', 'Muayene'], ['sigorta', 'Trafik sigortası'], ['kasko', 'Kasko'], ['bakim', 'Bakım']] as const)
      .filter(([k]) => a[k] && gunFarki(bugun, a[k]!) <= 15).map(([k, ad]) => ({ a, ad, gun: gunFarki(bugun, a[k]!) })));
  const eksikEvrak = y.hak('evrak') ? aktif.filter((o) => (o.evrak?.eksik.length || 0) > 0) : [];

  return (
    <>
      <div className="sayilar">
        <Sayi etiket="Aktif öğrenci" deger={aktif.length} onClick={() => y.b.git('ogrenciler')} />
        <Sayi etiket="Bugünkü direksiyon" deger={`${bugunDers.filter((d) => d.durum === 'tamamlandi').length} / ${bugunDers.length}`} alt="tamamlanan / toplam" onClick={() => y.b.git('dersler')} />
        <Sayi etiket="Bugünkü teorik" deger={bugunTeorik.length} alt="ders oturumu" onClick={() => y.b.git('teorik')} />
        <Sayi etiket="7 gün içindeki sınav" deger={yaklasanSinav.length} onClick={() => y.b.git('sinavlar')} />
        {y.hak('tahsilat') && <Sayi etiket="Bugünkü tahsilat" deger={tl(bugunTahsilat)} onClick={() => y.b.git('kasa')} />}
        {y.hak('tahsilat') && <Sayi etiket="Ödemesi geciken" deger={geciken.length} alt={tl(geciken.reduce((a, o) => a + (o.hesap?.geciken || 0), 0))} uyari={geciken.length > 0} />}
      </div>
      <div className="izgara">
        <Kart baslik="Bugünkü direksiyon dersleri" sag={y.hak('ders') && <button className="dugme kucuk" onClick={() => E.dersPlanla()}>+ Ders planla</button>}>
          <DersTablosu liste={bugunDers} />
        </Kart>
        {v.olaylar && (
          <Kart baslik="Canlı akış">
            <p className="soluk kucuk">Sahadan ve şubelerden girilen kayıtlar burada anında görünür.</p>
            <ul className="akis">
              {olaylar.length ? olaylar.map((o) => (
                <li key={o.id} className={p.yeniOlay.has(o.id) ? 'yeni' : ''}>
                  <div>{o.metin}</div>
                  <div className="zaman">{zamanYaz(o.zaman)} · {o.kullanici}{y.cokSube && o.sube_id ? ' · ' + y.subeAd(o.sube_id) : ''}</div>
                </li>
              )) : <li className="bos">Henüz hareket yok.</li>}
            </ul>
          </Kart>
        )}
        <Kart baslik="Yaklaşan sınavlar">
          {yaklasanSinav.length ? (
            <div className="tablo-kutu"><table><tbody>
              {yaklasanSinav.map((s) => (
                <tr key={s.id} className="tikla" onClick={() => y.b.git('ogrenci', s.ogrenci_id)}>
                  <td>{tarih(s.tarih)} {s.saat}</td><td>{y.ogrAd(s.ogrenci_id)}</td><td>{SINAV_AD[s.tur]} ({s.deneme}. hak)</td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <Bos>7 gün içinde sınav yok.</Bos>}
          {sonucBekleyen.length > 0 && <p className="bilgi kucuk">Tarihi geçmiş, sonucu girilmemiş {sonucBekleyen.length} sınav var. <button className="baglanti" onClick={() => y.b.git('sinavlar')}>Sonuç gir</button></p>}
        </Kart>
        {geciken.length > 0 && (
          <Kart baslik="Ödemesi gecikenler">
            <div className="tablo-kutu"><table><tbody>
              {geciken.sort((a, b) => (b.hesap?.geciken || 0) - (a.hesap?.geciken || 0)).slice(0, 15).map((o) => (
                <tr key={o.id}>
                  <td className="tikla" onClick={() => y.b.git('ogrenci', o.id)}>{o.ad} {o.soyad}<div className="kucuk soluk">{o.telefon}</div></td>
                  <td className="sayi-h">{tl(o.hesap?.geciken)}</td>
                  <td>{o.telefon && <a className="dugme kucuk" target="_blank" rel="noopener noreferrer"
                    href={whatsapp(o.telefon, `Merhaba ${o.ad}, ${v.kurum.ad} kurs ödemenizde ${tl(o.hesap?.geciken)} gecikmiş taksit bulunmaktadır. Bilgilerinize sunarız.`)}>WhatsApp</a>}</td>
                </tr>
              ))}
            </tbody></table></div>
          </Kart>
        )}
        {aracUyari.length > 0 && (
          <Kart baslik="Araç uyarıları">
            <ul className="liste">{aracUyari.map((x, i) => (
              <li key={i}><b>{x.a.plaka}</b> · {x.ad}: {x.gun < 0 ? <span className="rozet kirmizi">{-x.gun} gün geçti</span> : <span className="rozet sari">{x.gun} gün kaldı</span>}</li>
            ))}</ul>
          </Kart>
        )}
        {eksikEvrak.length > 0 && (
          <Kart baslik="Evrakı eksik öğrenciler">
            <ul className="liste">{eksikEvrak.slice(0, 12).map((o) => (
              <li key={o.id} className="tikla" onClick={() => y.b.git('ogrenci', o.id)}>{o.ad} {o.soyad} <span className="soluk kucuk">· {o.evrak!.eksik.join(', ')}</span></li>
            ))}</ul>
          </Kart>
        )}
      </div>
    </>
  );
}

// Eğitmenin telefonda kullandığı ekran: bugünkü dersler büyük düğmelerle.
function Sahada() {
  const y = useY();
  const { v } = y.b;
  const E = eylemler(y.b);
  const benim = v.dersler.filter((d) => d.egitmen_id === v.ben.id);
  const bugunDers = benim.filter((d) => d.tarih === v.bugun && d.durum !== 'iptal').sort((a, b) => (a.saat > b.saat ? 1 : -1));
  const yaklasan = benim.filter((d) => d.tarih > v.bugun && d.durum === 'planli').slice(0, 10);
  const ogrencilerim = v.ogrenciler.filter((o) => o.egitmen_id === v.ben.id && o.durum === 'aktif');
  const teorik = v.teorikOturumlar.filter((o) => o.egitmen_id === v.ben.id && o.tarih === v.bugun && o.durum !== 'iptal');
  const gorev = v.gorevlendirmeler.filter((g) => g.kullanici_id === v.ben.id && g.sube_id !== v.ben.sube_id);
  return (
    <>
      {gorev.map((g) => <p key={g.id} className="bilgi">{tarih(g.bas)} ile {tarih(g.bit)} arasında <b>{y.subeAd(g.sube_id)}</b> şubesinde de görevlisiniz.</p>)}
      <Kart baslik={`Bugünkü derslerim · ${tarih(v.bugun)}`}>
        {bugunDers.length ? bugunDers.map((d) => {
          const o = y.ogr(d.ogrenci_id);
          return (
            <div key={d.id} className="ders-kart">
              <div className="ust-bilgi">
                <div><div className="ad">{y.ogrAd(d.ogrenci_id)}</div>
                  <div className="soluk kucuk">{d.saat} · {DERS_AD[d.tur]} · {d.sure_dk} dk{d.arac_id ? ' · ' + y.aracAd(d.arac_id) : ''}{d.sube_id !== v.ben.sube_id ? ' · ' + y.subeAd(d.sube_id) : ''}</div>
                  {o && <div className="kucuk soluk">Direksiyon: {o.dersler.direksiyon}/{v.tanimlar.siniflar[o.sinif]?.direksiyon ?? '?'}</div>}
                </div>
                <div><Rozet tablo={DURUM_DERS} d={d.durum} /></div>
              </div>
              {d.durum === 'planli' && (
                <div className="iki-dugme">
                  <IsDugmesi className="dugme yesil buyuk" is={() => E.dersTamam(d)}>✓ Ders tamamlandı</IsDugmesi>
                  <button className="dugme kirmizi buyuk" onClick={() => E.dersGelmedi(d)}>Gelmedi</button>
                </div>
              )}
              {o?.telefon && <div className="dugmeler kucuk"><a href={telLink(o.telefon)}>📞 {o.telefon}</a><a target="_blank" rel="noopener noreferrer" href={whatsapp(o.telefon, `Merhaba ${o.ad}, bugün saat ${d.saat} direksiyon dersimiz var.`)}>WhatsApp</a></div>}
            </div>
          );
        }) : <Bos>Bugün planlı dersiniz yok.</Bos>}
        <button className="dugme ana buyuk" onClick={() => E.dersSaha()}>+ Plansız ders gir (şimdi tamamlandı)</button>
        <p className="soluk kucuk">Girdiğiniz kayıt merkeze anında düşer. İnternet yoksa telefonunuzda bekler, bağlantı gelince kendiliğinden gönderilir.</p>
      </Kart>
      {teorik.length > 0 && (
        <Kart baslik="Bugünkü teorik derslerim">
          {teorik.map((t) => <p key={t.id}>{t.saat} · {v.teorikGruplar.find((g) => g.id === t.grup_id)?.ad} · {t.konu} <button className="dugme kucuk" onClick={() => y.b.git('teorik')}>Yoklama al</button></p>)}
        </Kart>
      )}
      <div className="izgara">
        <Kart baslik="Yaklaşan derslerim" sag={<button className="dugme kucuk" onClick={() => E.dersPlanla()}>+ Ders planla</button>}>
          <DersTablosu liste={yaklasan} tarihGoster />
        </Kart>
        <Kart baslik="Öğrencilerim">
          {ogrencilerim.length ? (
            <div className="tablo-kutu"><table><tbody>
              {ogrencilerim.map((o) => {
                const g = v.tanimlar.siniflar[o.sinif];
                return (
                  <tr key={o.id} className="tikla" onClick={() => y.b.git('ogrenci', o.id)}>
                    <td>{o.ad} {o.soyad}<div className="kucuk soluk">{o.sinif}</div></td>
                    <td><progress max={g?.direksiyon || 1} value={Math.min(o.dersler.direksiyon, g?.direksiyon || 1)} /><div className="kucuk soluk">{o.dersler.direksiyon}/{g?.direksiyon ?? '?'} direksiyon</div></td>
                  </tr>
                );
              })}
            </tbody></table></div>
          ) : <Bos>Size bağlı aktif öğrenci yok.</Bos>}
        </Kart>
      </div>
    </>
  );
}
