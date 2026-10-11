/*
 * EyeQ service worker: web push only (plan phase 6, D29). It caches nothing; the web app
 * has no offline mode (plan 8.2). A push carries { title, body, url, id } rendered by the
 * dispatcher; a tap opens (or focuses) the app at that url.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "EyeQ";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.id || undefined,
      icon: "/favicon.ico",
      data: { url: data.url || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
