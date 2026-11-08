// Network-first service worker: always fresh when online, works offline for pages already visited.
// Only the reader app itself is cached: comic images (catbox or pages/) rely on the normal browser
// cache, and the admin page always talks to the network directly.
const CACHE = 'jfc-shell-v5';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'assets/icon.svg', 'js/boot.js',
  'data/catalog.js',
  'js/main.js', 'js/ui.js', 'js/i18n.js', 'js/store.js', 'js/data.js', 'js/router.js', 'js/components.js', 'js/themes.js',
  'js/views/home.js', 'js/views/catalog.js', 'js/views/series.js', 'js/views/reader.js',
  'js/views/library.js', 'js/views/settings.js', 'js/views/builder.js', 'js/telegram.js',
];

self.addEventListener('install', (e) => {
  // Cache files one by one so a single missing file doesn't void the rest.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.destination === 'image') return;
  if (/\/pages\/|\/admin\.html$|\/js\/admin\/|\/admin-keys\.json$/.test(url.pathname)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((r) => r || (req.mode === 'navigate' ? offlinePage(url) : Response.error()))),
  );
});

// Offline and not cached: the app's own page opens the cached app; a share page (s/<series>/<episode>/)
// forwards to that series or episode in it (serving index.html at that address would break its paths).
function offlinePage(url) {
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (rel === '' || rel === 'index.html') return caches.match('index.html');
  const m = /^s\/([^/]+)\/(?:([^/]+)\/)?/.exec(rel);
  const hash = m ? (m[2] ? `#/read/${m[1]}/${m[2]}` : `#/series/${m[1]}`) : '#/';
  return Response.redirect(`${self.registration.scope}${hash}`, 302);
}
