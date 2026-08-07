const CACHE_NAME = 'nymbox-shell-v5';
const APP_SHELL = [
  '/', '/index.html', '/style.css', '/config.js', '/auth.js',
  '/app1.js', '/app2.js', '/app3.js', '/app4.js', '/app5.js',
  '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/og-image.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/account') || url.pathname.startsWith('/dashboard')) {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => null);
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('/index.html');
      throw new Error('Offline and resource is not cached.');
    }
  })());
});
