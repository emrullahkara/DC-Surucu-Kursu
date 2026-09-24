// Her iki veritabanı ara katmanında (bilgisayar ve bulut) ortak yardımcılar. node:sqlite'a bağlı değildir.

// Tabloya sonradan eklenen sütunlar için: sütun yoksa ekler, varsa dokunmaz.
// Eski firma kayıtları hiçbir dönüşüm gerektirmeden açılmaya devam eder.
export function sutunEkle(db, tablo, sutun, tanim) {
  const var_ = db.q(`PRAGMA table_info(${tablo})`).some((c) => c.name === sutun);
  if (!var_) db.exec(`ALTER TABLE ${tablo} ADD COLUMN ${sutun} ${tanim}`);
}
