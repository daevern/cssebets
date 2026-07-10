// CSSEBets dedicated push service worker.
// Push-only (no offline caching) — safe in Lovable preview per the PWA skill.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "CSSEBets", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CSSEBets";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || data.event_type || undefined,
    data: { url: data.url || "/" },
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        try {
          const u = new URL(w.url);
          if (u.origin === self.location.origin) {
            w.focus();
            w.navigate(target);
            return;
          }
        } catch (_) {}
      }
      return self.clients.openWindow(target);
    })
  );
});
