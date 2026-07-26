// Ledjer PWA Service Worker v1
// Handles: static precaching, API caching, offline fallback, push notifications, background sync

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `ledjer-static-${CACHE_VERSION}`;
const API_CACHE = `ledjer-api-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `ledjer-dynamic-${CACHE_VERSION}`;

// Assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/login',
  '/register',
];

// API paths that can be cached (GET requests only)
const CACHEABLE_API_PATHS = [
  '/api/accounts',
  '/api/parties',
  '/api/products',
  '/api/dashboard',
  '/api/reports',
  '/api/invoices',
  '/api/transactions',
];

// ── Install: precache static assets ──────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean old caches ───────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name.startsWith('ledjer-') && name !== STATIC_CACHE && name !== API_CACHE && name !== DYNAMIC_CACHE;
          })
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ── Fetch: serve from cache or network ───────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // API requests: stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API_PATHS.some((path) => url.pathname.startsWith(path));
    if (isCacheable) {
      event.respondWith(staleWhileRevalidate(request, API_CACHE));
      return;
    }
    // Non-cacheable API: network only
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: precache-first
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests: network first, fallback to cache, then offline
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Everything else: network first
  event.respondWith(networkFirst(request));
});

// ── Caching Strategies ───────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) return response;

    // If server returns error, try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback to offline page
    const offlinePage = await caches.match('/offline');
    if (offlinePage) return offlinePage;

    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Last resort: offline page
    const offlinePage = await caches.match('/offline');
    return offlinePage || new Response('Offline', { status: 503 });
  }
}

// ── Push Notifications ───────────────────────────────────────────

self.addEventListener('push', (event) => {
  // Empty push (no data) — fetch pending notifications from API
  if (!event.data) {
    event.waitUntil(
      fetch('/api/push/notifications/pending')
        .then((res) => res.json())
        .then((data) => {
          const notifications = data.notifications || [];
          for (const n of notifications.slice(0, 1)) {
            self.registration.showNotification(n.title || 'Ledjer', {
              body: n.body || '',
              icon: n.iconUrl || '/logo-icon.svg',
              badge: '/badge-icon.svg',
              tag: n.tag || 'default',
              data: { url: n.url || '/' },
              vibrate: [200, 100, 200],
              requireInteraction: true,
            });
          }
        })
        .catch(() => {
          // Silent fail — notification-less push
        })
    );
    return;
  }

  try {
    const data = event.data.json();

    const options = {
      body: data.body || '',
      icon: data.icon || '/logo-icon.svg',
      badge: '/badge-icon.svg',
      tag: data.tag || 'default',
      data: {
        url: data.url || '/',
        ...data.data,
      },
      actions: data.actions || [],
      vibrate: [200, 100, 200],
      requireInteraction: true,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Ledjer', options)
    );
  } catch {
    event.waitUntil(
      self.registration.showNotification('Ledjer', {
        body: event.data ? event.data.text() : '',
        icon: '/logo-icon.svg',
      })
    );
  }
});

// ── Notification Click ───────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ── Background Sync ──────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-drafts') {
    event.waitUntil(syncDrafts());
  }
});

async function syncDrafts() {
  try {
    // The sync is triggered by the client sending queued drafts
    // Just inform all clients to check for pending sync
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'SYNC_DRAFTS' });
    }
  } catch (err) {
    console.error('Background sync failed:', err);
  }
}

// ── Message Handler ──────────────────────────────────────────────

self.addEventListener('message', (event) => {
  // Only accept messages from our own origin
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(event.data.urls || []);
      })
    );
  }
});
