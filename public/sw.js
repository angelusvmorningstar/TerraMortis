// Minimal service worker for PWA installability.
// No offline caching — the app requires the API for all data.
// This file must live at the root of the served directory so its
// scope covers the entire origin.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
