// Yerel çalıştırma: node server/index.mjs  (örnek kurumla: ENABLE_DEMO=1)
import { createServer } from 'node:http';
import { createApp } from './app.mjs';

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const app = createApp(process.env.DB_PATH ? { dbPath: process.env.DB_PATH } : {});
const sunucu = createServer((req, res) => app.handler(req, res));
sunucu.listen(port, host, () => {
  console.log(`DC Sürücü Kursu çalışıyor: http://localhost:${port}`);
  if (process.env.ENABLE_DEMO === '1') console.log('Örnek kurum açık. Giriş: patron / Deneme123!  (öğrenci: kimlik no ekrandaki ipucunda, şifre ogrenci1)');
});
const kapat = () => { sunucu.close(); app.kapat(); process.exit(0); };
process.on('SIGINT', kapat);
process.on('SIGTERM', kapat);
