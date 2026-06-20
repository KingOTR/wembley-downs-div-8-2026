/* Minimal service worker for fast repeat loads + offline resilience. */
/* global self */

const CACHE_VERSION = "v150";
const PRECACHE = `sv-precache-${CACHE_VERSION}`;
const RUNTIME = `sv-runtime-${CACHE_VERSION}`;

// Keep this list small. Versioned JS/CSS use network-first (not precached).
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/wembley-downs-logo.png",
];

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch { return false; }
}

function isVersionedDistAsset(url) {
  return url.pathname.startsWith("/dist/") &&
    (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"));
}

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error("offline");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k === PRECACHE || k === RUNTIME) return null;
      return caches.delete(k);
    }));
    // Drop stale runtime entries from prior deploys (e.g. old ?tag=v116 bundles).
    try {
      const runtime = await caches.open(RUNTIME);
      const stale = await runtime.keys();
      await Promise.all(stale.map((r) => runtime.delete(r)));
    } catch { /* ignore */ }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!isSameOrigin(req.url)) return;

  // HTML + service worker script: network-first so updates roll out.
  if (
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(PRECACHE);
          cache.put("/index.html", fresh.clone());
        }
        return fresh;
      } catch {
        return (await caches.match("/index.html")) || (await caches.match("/"));
      }
    })());
    return;
  }

  // Versioned bundles: network-first so ?tag=v118 always wins over stale cache.
  if (isVersionedDistAsset(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Other static assets: cache-first.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(RUNTIME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached;
    }
  })());
});
