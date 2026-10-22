import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const DAY = 24 * 60 * 60

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // App instalable en Android e iOS (PWA): manifiesto, iconos y service worker con caché sin conexión.
    VitePWA({
      // La nueva versión se instala cuando el usuario pulsa «Actualizar»: así no se recarga a mitad de editar un viaje.
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        id: '/app',
        name: 'ROAM · Kinetic Travel Tracker',
        short_name: 'ROAM',
        description: 'Registra tus viajes, rutas, países, regiones y aeropuertos en un mapa del mundo.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#f9f9fa',
        theme_color: '#f9f9fa',
        categories: ['travel', 'lifestyle', 'navigation'],
        shortcuts: [
          { name: 'Registrar viaje', short_name: 'Nuevo viaje', url: '/app/viajes/nuevo' },
          { name: 'Bitácora', short_name: 'Viajes', url: '/app/bitacora' },
          { name: 'Pasaporte', url: '/app/pasaporte' },
        ],
      },
      workbox: {
        // Solo la app (JS, CSS, HTML, fuentes e iconos). Los datos de /geo y /data pesan decenas de MB:
        // se guardan en caché a medida que se usan, más abajo.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'],
        // heic-to (3 MB) solo hace falta al importar fotos HEIC: se guarda la primera vez que se usa.
        globIgnores: ['geo/**', 'data/**', 'flags/**', 'avatars/**', 'apple-splash-*.png', 'assets/heic-to-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Las funciones de Vercel (vista previa, imagen OG) siempre van a la red.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'roam-assets', expiration: { maxEntries: 50, maxAgeSeconds: 60 * DAY } },
          },
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && /^\/(geo|data)\//.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'roam-data', expiration: { maxEntries: 400, maxAgeSeconds: 30 * DAY } },
          },
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && /^\/(flags|avatars)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'roam-images', expiration: { maxEntries: 600, maxAgeSeconds: 60 * DAY } },
          },
          {
            // Fotos de los viajes (enlaces firmados de Supabase Storage). El enlace cambia en cada firma, así que se
            // guardan por su ruta, sin el token: sin conexión se ven aunque el enlace guardado haya caducado.
            urlPattern: ({ url }) => url.pathname.startsWith('/storage/v1/object/sign/trip-photos/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'roam-photos',
              expiration: { maxEntries: 600, maxAgeSeconds: 90 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              plugins: [{ cacheKeyWillBeUsed: async ({ request }) => request.url.split('?')[0] }],
            },
          },
          {
            // Teselas del mapa (OpenFreeMap): llevan la versión en la ruta, no cambian.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && /\.(pbf|png|webp)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Estilo, sprites y tipografías del mapa.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-style', expiration: { maxEntries: 300, maxAgeSeconds: 30 * DAY }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
