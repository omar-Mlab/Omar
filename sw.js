/* Service worker — makes the app work fully offline.
   When you upload a new version, change CACHE (e.g. v1.0.1) so phones pick it up. */
const CACHE = 'mlops-v1.0.0';
const FILES = ['./', './index.html', './styles.css', './manifest.webmanifest',
  './js/util.js', './js/store.js', './js/ui.js', './js/exporters.js', './js/geo.js', './js/mat.js',
  './js/views.js', './js/datamgmt.js', './js/settings.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Network first (so updates arrive when online), cache fallback (works offline) */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(t);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      return hit || Response.error();
    }
  })());
});
