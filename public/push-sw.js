/* Web Push Service Worker for Duarte Entregas */
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Nova entrega", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Nova entrega disponível";
  const options = {
    body: data.body || "Toque para abrir o app.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    vibrate: [300, 100, 300, 100, 300],
    tag: "delivery-" + (data.data?.request_id || Date.now()),
    renotify: true,
    requireInteraction: true,
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/motorista";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
