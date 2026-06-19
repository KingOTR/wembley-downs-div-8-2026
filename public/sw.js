/* Minimal service worker for fast repeat loads + offline resilience. */
/* global self */

const CACHE_VERSION = "v6";
const ASSET_TAG = "v118";
const PRECACHE = `sv-precache-${CACHE_VERSION}`;
const RUNTIME = `sv-runtime-${CACHE_VERSION}`;

// Keep this list small + high impact. Use runtime caching for the rest.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  `/dist/app.min.js?tag=${ASSET_TAG}`,
  "/wembley-downs-logo.png",
];

async function precacheFresh(cache) {
  await Promise.all(PRECACHE_URLS.map(async (url) => {
    const req = new Request(url, { cache: "reload" });
    const res = await fetch(req);
    if (!res || !res.ok) throw new Error(`Precache failed for ${url}`);
    await cache.put(req, res);
  }));
}

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch { return false; }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await precacheFresh(cache);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== PRECACHE && k !== RUNTIME) return caches.delete(k);
      return null;
    }));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Don’t cache cross-origin (Firestore/Google) requests here.
  if (!isSameOrigin(req.url)) return;

  // HTML: network-first so updates come through; fall back to cache for offline.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(PRECACHE);
        cache.put("/index.html", fresh.clone());
        return fresh;
      } catch {
        return (await caches.match("/index.html")) || (await caches.match("/"));
      }
    })());
    return;
  }

  // Static assets: cache-first.
  event.respondWith((async () => {
    // IMPORTANT: do NOT ignore querystrings.
    // We version assets with `?tag=...`, and ignoring search would force stale JS without a hard refresh.
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req, { cache: "reload" });
      const cache = await caches.open(RUNTIME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached;
    }
  })());
});

