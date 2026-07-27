/* Web Push Service Worker for Duarte Entregas (PWA delivery calls) */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

const DRIVER_ROUTE = "/entregador";

function buildUrl(data) {
  const base = data && data.url ? data.url : DRIVER_ROUTE;
  const id = data && (data.request_id || data.pedido_id);
  if (!id) return base;
  return base.includes("?") ? `${base}&entrega=${id}` : `${base}?entrega=${id}`;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "🚚 Nova entrega disponível", body: event.data ? event.data.text() : "" };
  }
  const payload = data.data || {};
  const title = data.title || "🚚 Nova entrega disponível";
  const options = {
    body: data.body || "Você recebeu uma nova entrega. Toque para visualizar.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [0, 1000, 500, 1000, 500, 1000],
    tag: "delivery-" + (payload.request_id || payload.pedido_id || Date.now()),
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { ...payload, url: buildUrl(payload) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || DRIVER_ROUTE;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an existing window of the PWA instead of opening new tabs.
      for (const client of clientList) {
        try {
          const sameOrigin = new URL(client.url).origin === self.location.origin;
          if (!sameOrigin) continue;
          client.postMessage({ type: "OPEN_DELIVERY", requestId: data.request_id || data.pedido_id || null });
          if ("navigate" in client) {
            await client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        } catch (_) {
          /* try next client */
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })(),
  );
});
