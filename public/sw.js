// Brick Track Designer's service worker: the app works offline once it has
// been opened (installed to the home screen or not). The page itself is
// fetched fresh when there's a network (so a new version shows up), and kept
// for when there isn't; so is everything else whose name doesn't change with
// what's in it (the settings' pictures and their list, the icons, the
// manifest: a new version's would never show otherwise). The scripts and the
// geometry kernel (assets/, each named by its content) are kept the first
// time they're fetched, and served from there.
const CACHE = 'btd-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const keep = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => keep(req, res)).catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))));
    return;
  }
  if (!url.pathname.includes('/assets/')) {
    e.respondWith(fetch(req).then((res) => keep(req, res)).catch(() => caches.match(req).then((hit) => hit ?? Response.error())));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => keep(req, res))));
});
