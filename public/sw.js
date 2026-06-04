// Minimal pass-through service worker for Fique Por Dentro Sergipe PWA installability.
// Does NOT cache responses to avoid serving stale content.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Required for installability on Chrome/Android — no-op fetch handler.
self.addEventListener("fetch", (event) => {
  // Let the browser handle everything normally.
});
