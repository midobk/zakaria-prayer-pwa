// Service worker for Masjid Zakaria PWA
// Real Web Push handler (subscription + push events from the server).

const CACHE = 'zakaria-v2';
const ASSETS = [
  './',
  './index.html',
  './prayer-data.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
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

// Real push event from server (via web-push)
self.addEventListener('push', (e) => {
  let data = { title: '🕌 Masjid Zakaria', body: 'Prayer time', url: '/', tag: 'zakaria', icon: '/icons/icon-192.png' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}

  const options = {
    body: data.body,
    tag: data.tag || 'zakaria',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    renotify: true,
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open app' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.endsWith('/') && 'focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Allow the page to trigger a local notification (still works as a fallback)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'show-notification') {
    const { title, body, tag } = e.data;
    self.registration.showNotification(title || '🕌 Masjid Zakaria', {
      body, tag: tag || 'zakaria-local',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
    });
  }
});
