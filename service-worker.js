/* Workly Service Worker - Offline Cache & PWA Support (Phase 8) */

const CACHE_NAME = 'workly-cache-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './manifest.webmanifest',
  './css/reset.css',
  './css/variables.css',
  './css/components.css',
  './css/app.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/utils.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Install Event - Pre-cache core application shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.warn('[ServiceWorker] Pre-cache failed during install:', error);
      })
  );
});

// Activate Event - Clean up any old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate strategy for local static assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Ignore non-http/https schemes (e.g. chrome-extension://)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Background network fetch to revalidate and update cache
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is not in cache, return fallback if possible
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
