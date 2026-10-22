// Brick Track Designer's service worker: the app works offline once it has
// been opened (installed to the home screen or not). The page itself is
// fetched fresh when there's a network (so a new version shows up), and kept
// for when there isn't; everything else (the scripts, the geometry kernel,
// icons) is kept the first time it's fetched, and served from there.
const CACHE = 'btd-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
