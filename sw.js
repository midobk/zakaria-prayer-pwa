// Service worker for Masjid Zakaria PWA
// Real Web Push handler (subscription + push events from the server).

const CACHE = 'zakaria-v3';
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
  // Force the new SW to take over from any old installed SW immediately
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // Clean up ALL old caches and claim any waiting clients
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Never cache /api/* — they need to hit the network every time.
  // (vapid-public, subscribe, cron/tick, etc.)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // For app shell assets: network-first, fall back to cache, then cache the new copy.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
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

  e.waitUntil(self.registration.showNotification(data.title, options));
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
