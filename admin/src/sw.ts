/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { normalizeAdminUrl } from './lib/normalizeAdminUrl';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<import('workbox-precaching').PrecacheEntry | string> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// registerType: 'prompt' leaves a waiting worker in place until the user accepts an update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();

// Offline support is app-shell-only. API, assets and worker/manifest endpoints are never SPA fallbacks.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api\//, /^\/assets\//, /^\/sw\.js$/, /^\/manifest\.webmanifest$/],
}));

self.addEventListener('push', (event) => {
  let data: Record<string, unknown> = {};
  try { data = event.data ? event.data.json() as Record<string, unknown> : {}; } catch { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'New mail';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: 'nest-mail-push' }));
    if (windows.some((client) => client.visibilityState === 'visible' && client.focused)) return;
    const rawUrl = typeof data.url === 'string' ? data.url : '/mail';
    await self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : 'You have a new message.',
      tag: typeof data.tag === 'string' ? data.tag : 'nest-mail',
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: normalizeAdminUrl(rawUrl, self.location.origin) },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | null)?.url || '/mail';
  const target = new URL(normalizeAdminUrl(raw, self.location.origin), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing && existing.url !== target) await existing.navigate(target).catch(() => undefined);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
