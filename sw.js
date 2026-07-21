// Service worker for Masjid Zakaria PWA
const CACHE = 'zakaria-v1';
const ASSETS = [
  './',
  './index.html',
  './prayer-data.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// Handle notification click — focus/open the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.endsWith('/') && 'focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

// Allow the page to trigger a notification from the SW (for richer scheduling)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'show-notification') {
    const { title, body, tag, icon } = e.data;
    self.registration.showNotification(title, {
      body,
      tag: tag || 'zakaria',
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      requireInteraction: false
    });
  }
});
