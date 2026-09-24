import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ekran: istemci/ klasörü. "npm run build" çıktısı istemci/dist; sunucu bu klasörü yayınlar.
export default defineConfig({
  root: 'istemci',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8090', changeOrigin: false } } },
});
