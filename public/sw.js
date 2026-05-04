// Service worker — network-first for JS/CSS to ensure deploys take effect.
// No offline cache — the app requires the API for all data.

const CACHE_VERSION = 'v3';

self.addEventListener('install', e => {
  self.skipWaiting();
  // Clear all old caches on install so stale modules don't persist
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.map(k => caches.delete(k)))
  ));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for JS and CSS — guarantees fresh modules after deploy.
// All other requests pass through to the network unmodified.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
