// Avisos en el móvil: el service worker de Workbox (vite.config.ts) carga este archivo con importScripts.
// Recibe el aviso que manda /api/push, lo enseña y, al tocarlo, abre la app en esa pantalla
// (o la que ya estaba abierta, si la hay).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data && event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ROAM', {
      body: data.body || '',
      tag: data.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      lang: 'es',
      data: { url: data.url || '/app' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/app', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : undefined))
      return self.clients.openWindow(url)
    }),
  )
})
