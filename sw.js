/* Parkplatz - service worker for offline play (PWA).
   Cache-first for the app shell so the game works with no network. Bump
   CACHE_VERSION whenever assets change to roll the cache. */
const CACHE_VERSION = 'parkplatz-v12';

const ASSETS = [
  './',
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/puzzles-data.js',
  'js/i18n.js',
  'js/storage.js',
  'js/audio.js',
  'js/solver.js',
  'js/puzzlegen.js',
  'js/game.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // No catch here: addAll is atomic, and swallowing its rejection would mark
  // a completely EMPTY cache as successfully installed — the app would claim
  // to work offline while nothing is cached. Failing lets the browser retry.
  e.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations (incl. deep links like ?level=5 or ?daily) always get the app
  // shell: match ignoring the query, fall back to index.html when offline.
  // They are never runtime-cached — that used to store one stale copy of
  // index.html per query URL.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then((c) => c || caches.match('index.html'))
      )
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // runtime-cache successful same-origin GETs
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || Response.error());
    })
  );
});
