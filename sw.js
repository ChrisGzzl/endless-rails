"use strict";
// Service worker for the PWA. All app resources are ?v=-versioned, so a
// cache-first strategy is always correct within one release; the release tag
// in the worker's own URL (sw.js?v=…, kept in sync with index.html) names the
// cache, and activating a new release drops every previous cache. Page
// navigations stay network-first so deploys are picked up immediately while
// an offline launch still falls back to the cached shell.
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const CACHE = "endless-rails-" + VERSION;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("endless-rails-") && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put("index.html", copy));
      return response;
    }).catch(() => caches.match("index.html", { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
