// Brick Track Designer's service worker: the app works offline once it has
// been opened (installed to the home screen or not).
//
// The page itself is fetched fresh when there's a network (so a new version
// shows up), and kept for when there isn't; so is everything else whose name
// doesn't change with what's in it (the settings' pictures and their list,
// the icons, the manifest: a new version's would never show otherwise).
//
// The scripts and the geometry kernel (assets/, each named by its content)
// are kept the first time they're fetched and served from there. They're
// kept by version (the page's own script names it), and when a new version's
// page arrives the versions before it are dropped: or every version ever
// opened would be kept for good, a megabyte and a half each.
const CACHE = 'btd-v2', ASSETS = 'btd-assets-';
self.addEventListener('install', () => self.skipWaiting());
// (a new worker: caches that aren't its own kind, from the ones before it, dropped)
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE && !n.startsWith(ASSETS)).map((n) => caches.delete(n)))).then(() => self.clients.claim())));

// The version: the page's main script's name. Set as a page arrives (and the versions before it dropped), and kept
// for when this worker is started again.
let arriving;
async function arrived(res) {
  const id = (/assets\/index-([\w-]+)\.js/.exec(await res.text()) ?? [])[1] ?? 'none';
  await (await caches.open(CACHE)).put('__version', new Response(id));
  for (const n of await caches.keys()) if (n.startsWith(ASSETS) && n !== ASSETS + id) await caches.delete(n);
  return id;
}
const version = () => arriving ?? caches.open(CACHE).then((c) => c.match('__version')).then((hit) => (hit ? hit.text() : 'none'));
const assets = () => Promise.resolve(version()).catch(() => 'none').then((id) => caches.open(ASSETS + id));
const keep = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };

// (what the page had fetched before this worker was there, on the first visit: fetched again and kept, where it isn't)
self.addEventListener('message', (e) => {
  const urls = Array.isArray(e.data?.keep) ? e.data.keep.filter((u) => typeof u === 'string' && u.startsWith(location.origin + '/')) : [];
  e.waitUntil((async () => {
    // (the first visit: the page came without this worker, so its version is read from it now)
    const page = urls[0] && !(await caches.open(CACHE).then((c) => c.match('__version'))) ? await fetch(urls[0]).catch(() => undefined) : undefined;
    if (page?.ok) { arriving = arrived(page.clone()); await arriving; await (await caches.open(CACHE)).put(urls[0], page); }
    const a = await assets(), c = await caches.open(CACHE);
    await Promise.all(urls.map((u) => caches.match(u).then((hit) => hit ?? fetch(u).then((res) => { if (res.ok) return (u.includes('/assets/') ? a : c).put(u, res); })).catch(() => { /* (not kept: fetched when it's next asked for) */ })));
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { arriving = arrived(res.clone()); e.waitUntil(arriving.catch(() => { /* fine */ })); }
      return keep(req, res);
    }).catch(() => caches.match(req).then((hit) => hit ?? caches.match('./'))));
    return;
  }
  if (!url.pathname.includes('/assets/')) {
    e.respondWith(fetch(req).then((res) => keep(req, res)).catch(() => caches.match(req).then((hit) => hit ?? Response.error())));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(assets().then((a) => a.put(req, copy))); }
    return res;
  })));
});
