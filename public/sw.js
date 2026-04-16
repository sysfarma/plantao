const CACHE_NAME = 'farmacias-plantao-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Exclude external API requests from generic catching to avoid breaking them
  if (url.origin !== location.origin) {
    return;
  }

  // Network First strategy for the SPA
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      return caches.open(CACHE_NAME).then((cache) => {
        // Cache successful GET requests for same origin
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      });
    }).catch(async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      // If no cache, try serving the root index.html to allow SPA routing
      if (event.request.mode === 'navigate') {
        const rootCache = await caches.match('/');
        if (rootCache) return rootCache;
      }
      throw new Error('Network error and no cache available.');
    })
  );
});
