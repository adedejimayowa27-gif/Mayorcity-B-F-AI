// Minimal service worker — exists only to satisfy Android/Chrome's "installable app" requirement.
// Deliberately does NOT cache anything: every request just passes straight through to the network.
// This avoids the classic PWA problem of users getting stuck on a stale cached version after you
// deploy an update. If you ever want offline support later, this is the file to extend.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
