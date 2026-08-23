// Service worker for Mayorcity B&F AI.
//
// Every request still goes straight to the network first — this deliberately avoids the
// classic PWA problem of users getting stuck on a stale cached version after a deploy.
// The only thing cached is a single offline.html fallback page, served ONLY when a page
// navigation fails outright (i.e. the user has no connection). App code, the knowledge
// base, and API responses are never cached, so updates always reach users immediately.

const CACHE_NAME = 'mb-offline-v1';
const OFFLINE_URL = 'offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL))
      )
    );
    return;
  }
  event.respondWith(fetch(event.request));
});
