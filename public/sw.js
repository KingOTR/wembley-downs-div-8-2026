/* Minimal service worker for fast repeat loads + offline resilience. */
/* global self */

const CACHE_VERSION = "v184";
const PRECACHE = `sv-precache-${CACHE_VERSION}`;
const RUNTIME = `sv-runtime-${CACHE_VERSION}`;

// Keep this list small. Versioned JS/CSS use network-first (not precached).
const PRECACHE_URLS = [
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

function isSvCacheName(name) {
  return typeof name === "string" &&
    (name.startsWith("sv-precache-") || name.startsWith("sv-runtime-"));
}

/** Precache each URL independently so one failure does not fail install. */
async function precacheSafely(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    try {
      await cache.add(url);
    } catch (err) {
      console.warn("[sw] precache skip:", url, err && err.message ? err.message : err);
    }
  }));
}

async function networkFirst(req, opts) {
  try {
    const fresh = await fetch(req, opts);
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

const NETWORK_OPTS = { cache: "no-store" };

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await precacheSafely(cache, PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k === PRECACHE || k === RUNTIME) return null;
      if (isSvCacheName(k)) return caches.delete(k);
      return caches.delete(k);
    }));
    try {
      const runtime = await caches.open(RUNTIME);
      const stale = await runtime.keys();
      await Promise.all(stale.map((r) => runtime.delete(r)));
    } catch { /* ignore */ }
    await self.clients.claim();
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach((c) => {
        try { c.postMessage({ type: "SV_ACTIVATED", version: CACHE_VERSION }); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
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

  // HTML + SW: always network-first (no-store) so deploys roll out without hard refresh.
  if (
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, NETWORK_OPTS);
        if (fresh && fresh.ok && req.mode === "navigate") {
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

  // Versioned bundles: network-first (?tag=vNNN cache busts).
  if (isVersionedDistAsset(url)) {
    event.respondWith(networkFirst(req, NETWORK_OPTS));
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
