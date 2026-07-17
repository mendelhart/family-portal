/* Family Portal service worker — enables installable app + push notifications */
const CACHE = 'family-portal-v1';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

// Push message from the backend (see supabase/functions/send-reminders)
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'Reminder', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Family Portal reminder';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    requireInteraction: false
  }));
});

// Focus/open the app when a notification is clicked
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
