/* Workly Service Worker - Offline Cache & PWA Support (Phase 8) */

const CACHE_NAME = 'workly-cache-v3';

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

// Fetch Event - Network-first so new versions show at once; cache is the offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((cached) => cached || caches.match('./index.html')))
  );
});
