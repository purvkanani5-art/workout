/* Service worker: cache-first for the app shell so the app opens with no signal.
   Bump CACHE_VERSION on every deploy; old caches are deleted on activate. */
const CACHE_VERSION = 'wt-v16';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './progress.js',
  './body.js',
  './muscles.js',
  './charts.js',
  './vault.js',
  './track.js',
  './picker.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Requests to Google must never be cached or intercepted: the Sheet is the source of truth and the
// Apps Script reply must always be live.
const BYPASS_HOSTS = ['script.google.com', 'script.googleusercontent.com', 'googleusercontent.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // cache: 'reload' skips the browser's HTTP cache. GitHub Pages lets browsers keep files for 10 minutes,
      // so without it a release pushed soon after another could be installed with the older files.
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache same-origin files we did not know about (nothing from other origins).
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
