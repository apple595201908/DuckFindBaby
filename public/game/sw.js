// Increment this name whenever a shipped URL or asset changes. Keeping it in
// sync with query versions prevents stale art or logic on mobile browsers.
const CACHE_NAME = "duck-gene-lab-v26";
const ASSETS = [
  "./index.html",
  "./game.css?v=duck-gene-lab-r23",
  "./engine.js?v=duck-gene-lab-r23",
  "./analytics.js?v=duck-gene-lab-r23",
  "./game.js?v=duck-gene-lab-r23",
  "./manifest.webmanifest?v=duck-gene-lab-r23",
  "./assets/duck-gene-palette-sheet.png?v=duck-gene-lab-r23",
  "./assets/duck-mascot-yellow.png?v=duck-gene-lab-r23",
  "./assets/gene-lab-night-bg.webp?v=duck-gene-lab-r23",
];

self.addEventListener("install", (event) => {
  // Pre-cache the complete playable shell so the game can reopen offline.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    // Navigation is network-first for fast updates, with the cached game page
    // as a fallback when the device has no connection.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
    );
    return;
  }
  // Versioned static files are cache-first for repeat-play performance. Cache a
  // successful miss so optional resources are also ready for offline use.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
