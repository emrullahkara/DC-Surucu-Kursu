// Yerel çalıştırma: npm start   (örnek kurumla: npm run demo)
import { createServer } from 'node:http';
import { platformAc } from './platform.mjs';

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const platform = platformAc(process.env.VERI_DIZINI ? { veriDizini: process.env.VERI_DIZINI } : {});
const sunucu = createServer((req, res) => platform.handler(req, res));
sunucu.listen(port, host, () => {
  console.log(`DC Sürücü Kursu çalışıyor: http://localhost:${port}`);
  if (process.env.ENABLE_DEMO === '1')
    console.log('Örnek kurum açık. Kurum kodu: ornek · yetkili: patron / Deneme123! · platform: /platform (dc / Deneme123!)');
});
const kapat = () => { sunucu.close(); platform.kapat(); process.exit(0); };
process.on('SIGINT', kapat);
process.on('SIGTERM', kapat);
