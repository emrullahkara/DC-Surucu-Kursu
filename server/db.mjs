// Veritabanı ara katmanı. İş kuralları yalnız bu dört işlevi kullanır (q, q1, run, islemde);
// böylece aynı kurallar bilgisayardaki sunucuda (node:sqlite) ve bulutta (Cloudflare Durable Object)
// değişmeden çalışır.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function nodeVeritabani(yol) {
  if (yol !== ':memory:') mkdirSync(dirname(yol), { recursive: true });
  const db = new DatabaseSync(yol);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const hazir = new Map();
  const st = (sql) => {
    let s = hazir.get(sql);
    if (!s) { s = db.prepare(sql); hazir.set(sql, s); }
    return s;
  };
  let derinlik = 0;
  return {
    q: (sql, ...p) => st(sql).all(...p),
    q1: (sql, ...p) => st(sql).get(...p),
    run: (sql, ...p) => st(sql).run(...p),
    exec: (sql) => db.exec(sql),
    islemde(fn) {
      // İç içe çağrıda dıştaki işlem geçerlidir.
      if (derinlik > 0) return fn();
      derinlik++;
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      finally { derinlik--; }
    },
    kapat: () => db.close(),
  };
}

export { sutunEkle } from './db-ortak.mjs';
