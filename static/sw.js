// Compass PWA Service Worker
const CACHE_NAME = "compass-v1";
const STATIC_ASSETS = [
  "/",
  "/app",
  "/login",
  "/manifest.json",
  "/styles.css",
];

// Cache static assets on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Clean up old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// Network-first strategy for API requests, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip cross-origin requests
  if (url.origin !== location.origin) return;

  // API requests: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached response if network fails
          return caches.match(event.request);
        }),
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached, but also update cache in background
        fetch(event.request).then((response) => {
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response);
            });
          }
        });
        return cached;
      }

      // Not cached, fetch from network
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }),
  );
});

// Handle push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};

  const options = {
    body: data.body || "New advisory from Compass",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/app/alerts",
    },
    actions: [
      { action: "view", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Compass Alert", options),
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/app";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});

// Background sync for offline data submission
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-farm-data") {
    event.waitUntil(syncFarmData());
  }
});

function syncFarmData() {
  // Get pending submissions from IndexedDB
  // Submit them when online
  console.log("[SW] Background sync: farm data");
}
