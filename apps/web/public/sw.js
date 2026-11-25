/* Ledjer PWA Service Worker — offline shell (Fase 6)
 * Cache strategy:
 * - Navigation (/ , /dashboard, /transactions/*) → network-first, fallback ke cache shell (index.html)
 * - Hashed assets (/assets/*) → cache-first
 * - Manifest/icons → network-first, fallback cache
 * - API (/api/*) → network-only (local-first DB adalah sumber kebenaran; SW tidak cache API)
 *
 * CACHE is namespaced by the build id passed in the registration URL. A deploy
 * therefore gets a new SW script URL and a new cache, instead of reusing
 * ledjer-v1 forever.
 */
const BUILD_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `ledjer-${BUILD_VERSION}`;
const CACHE_PREFIX = "ledjer-";
const MAX_CACHE_ENTRIES = 80;
const SHELL = [
  "/",
  "/manifest.json",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/logo-horizontal.svg",
  "/logo-horizontal-white.svg",
  "/logo-icon.svg",
  "/home.svg",
];

async function trimCache() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;
  await Promise.all(
    keys.slice(0, keys.length - MAX_CACHE_ENTRIES).map((key) => cache.delete(key)),
  );
}

function cacheResponse(request, response) {
  if (!response.ok) return;
  caches
    .open(CACHE)
    .then((cache) => cache.put(request, response.clone()))
    .then(trimCache)
    .catch(() => {});
}

async function cacheFirst(request) {
  // Cloudflare/Vite responses carry Vary: Origin; the cached request was made
  // with different headers than the runtime module request.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    cacheResponse(request, response);
    return response;
  } catch {
    return Response.error();
  }
}

async function networkFirst(request, { html = false } = {}) {
  try {
    const response = await fetch(request);
    cacheResponse(request, response);
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (html || request.mode === "navigate") {
      // Prefer the non-redirected root shell; Vite preview redirects
      // /index.html to /, and a redirected cached response is rejected for
      // top-level navigation in Chromium.
      const shell =
        (await caches.match("/", { ignoreVary: true })) ??
        (await caches.match("/index.html", { ignoreVary: true }));
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);

  // Build assets are hashed and not discoverable from the shell without this
  // manifest. Missing manifest (dev) must not fail the whole install.
  try {
    const manifest = await (await fetch("/asset-manifest.json", { cache: "no-store" })).json();
    if (!Array.isArray(manifest)) return;
    await Promise.all(
      manifest
        .filter((url) => typeof url === "string" && url.startsWith("/assets/"))
        .map(async (url) => {
          if (await cache.match(url)) return;
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // One missing optional chunk must not block the offline shell.
          }
        }),
    );
  } catch {
    // No manifest in dev; the shell still installs.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Hanya handle GET same-origin
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API — network only (jangan cache; local DB sudah offline)
  if (url.pathname.startsWith("/api/")) return;

  // Navigasi dan fetch HTML — network-first, fallback shell. App routes have
  // no file extension; treating them as HTML also covers browsers that do not
  // report mode="navigate" for a client-side route request.
  const lastSegment = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  const looksLikeAppRoute = !lastSegment.includes(".");
  const isHtml =
    request.mode === "navigate" ||
    request.destination === "document" ||
    request.headers.get("accept")?.includes("text/html") ||
    looksLikeAppRoute;
  if (isHtml) {
    event.respondWith(networkFirst(request, { html: true }));
    return;
  }

  // Hashed build assets can be cached forever; everything else must revalidate
  // so manifest, icons, and unversioned files update after deploy.
  event.respondWith(
    url.pathname.startsWith("/assets/") ? cacheFirst(request) : networkFirst(request),
  );
});
