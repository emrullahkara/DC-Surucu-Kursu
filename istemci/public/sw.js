// Telefona kurulan uygulamanın internetsiz de açılabilmesi için ekran dosyalarını saklar.
// Veri istekleri (/api/) hiçbir zaman saklanmaz; her zaman sunucudan gelir.
const SURUM = 'dc-kurs-2';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(['/', '/simge.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((l) => Promise.all(l.filter((k) => k !== SURUM).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Sayfa: önce ağ, olmazsa saklanan. Dosyalar (assets): önce saklanan.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const k = r.clone(); caches.open(SURUM).then((c) => c.put('/', k)); return r; }).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(e.request).then((v) => v || fetch(e.request).then((r) => {
    if (r.ok && u.pathname.startsWith('/assets/')) { const k = r.clone(); caches.open(SURUM).then((c) => c.put(e.request, k)); }
    return r;
  })));
});
