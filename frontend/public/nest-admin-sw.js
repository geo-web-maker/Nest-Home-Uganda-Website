/* Admin app service worker: shows mail notifications and opens the app when one is tapped.
   It has no fetch handler on purpose, so it never serves stale pages. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'New mail';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'nest-mail-push' }));
    // Stay quiet when the person is already looking at the app.
    if (clients.some((client) => client.visibilityState === 'visible' && client.focused)) return;
    await self.registration.showNotification(title, {
      body: data.body || 'You have a new message.',
      tag: data.tag || 'nest-mail',
      renotify: true,
      icon: '/nest-admin-icon-192.png',
      badge: '/nest-admin-icon-192.png',
      data: { url: data.url || '/admin/mail' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/admin/mail', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((client) => client.url.startsWith(self.location.origin + '/admin'));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing && !existing.url.startsWith(url)) await existing.navigate(url).catch(() => undefined);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
