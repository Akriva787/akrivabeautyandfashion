const CACHE_NAME = 'akriva-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetched = fetch(request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});