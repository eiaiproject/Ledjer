/* Ledjer PWA Service Worker — offline shell (Fase 6)
 * Cache strategy:
 * - Navigation (/ , /dashboard, /transactions/*) → network-first, fallback ke cache shell (index.html)
 * - Assets (/assets/*, *.js, *.css, *.svg) → cache-first
 * - API (/api/*) → network-only (local-first DB adalah sumber kebenaran; SW tidak cache API)
 * - Fonts → stale-while-revalidate
 */
const CACHE = "ledjer-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/favicon.svg", "/logo-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Hanya handle GET same-origin
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // API — network only (jangan cache; local DB sudah offline)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigasi — network-first, fallback shell
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html"))),
    );
    return;
  }

  // Assets & lainnya — cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Hanya cache 200 OK
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached),
    }),
  );
});
