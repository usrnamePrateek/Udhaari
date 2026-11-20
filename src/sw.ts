/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// ── Offline app shell (same behaviour as the previous generated service worker) ──
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    // Supabase API calls are cached by TanStack Query in IndexedDB, not here.
    denylist: [/^\/auth/, /^\/privacy/],
  }),
);

// "Update" button in the new-version banner (src/components/Pwa.tsx).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push notifications (sent by supabase/functions/notify) ──
type PushPayload = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event) => {
  let data: PushPayload;
  try {
    data = event.data?.json() as PushPayload;
  } catch {
    data = { title: 'Udhaari', body: event.data?.text() ?? 'Something changed in a ledger', url: '/', tag: 'udhaari' };
  }
  // Always show a notification: iOS revokes the subscription for silent pushes.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url as string) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(url).catch(() => existing.postMessage({ type: 'NAVIGATE', url }));
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
