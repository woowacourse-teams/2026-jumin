const CACHE_NAME = 'jumin-runtime-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('jumin-') && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cachedResponse = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, cachedResponse));
          return response;
        })
        .catch(() => caches.match(request).then((response) => response ?? caches.match('/'))),
    );
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/vendor/')
  ) {
    event.respondWith(
      caches.match(request).then(
        (cachedResponse) =>
          cachedResponse ??
          fetch(request).then((response) => {
            const responseToCache = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
            return response;
          }),
      ),
    );
  }
});
