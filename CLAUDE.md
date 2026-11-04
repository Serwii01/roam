# ROAM (proyecto `rumbo`, repo `Serwii01/roam`)

App web e instalable (PWA) para registrar y planificar viajes: mapa y globo 3D, países y regiones visitados, rutas, bitácora con fotos, plan día a día, gastos compartidos, pasaporte de sellos y bucket list. Textos de la app, comentarios y commits, en español. El detalle funcional de cada parte está en `README.md`.

## Stack
- React 19 + Vite 8 + TypeScript 6 + Tailwind v4 (Node 22)
- Supabase: Postgres, Auth, Storage y RLS
- MapLibre GL + OpenFreeMap (sin API key); Photon, Nominatim y Geoapify (opcional) para buscar lugares
- TanStack Query (caché persistida en IndexedDB) y Zustand
- `vite-plugin-pwa` para la PWA y `web-push` para los avisos
- Vercel: web estática, funciones en `api/` y un cron diario

## Estructura
- `src/pages/` — pantallas; las rutas están en `src/App.tsx` (públicas en `/`, la app bajo `/app`)
- `src/components/` — componentes; mapas en `WorldMap.tsx` y `RegionMap.tsx`
- `src/lib/api/` — capa de datos: interfaz `Api` en `types.ts`, implementaciones `supabase.ts` (real) y `demo.ts` (navegador)
- `src/lib/outbox.ts` — cola de cambios sin conexión; envuelve la API real con `withOffline`
- `src/lib/` — lógica de dominio (`days.ts`, `hops.ts`, `arrival.ts`, `today.ts`, `stats.ts`, `badges.ts`, `replay.ts`, `memories.ts`, `welcome.ts`…)
- `api/` — funciones de Vercel en JavaScript: `share.js`, `og.js`, `calendar.js`, `push.js`
- `supabase/migrations/` — esquema y RLS; `supabase/seed.sql` lo genera `npm run data`
- `scripts/` — datos, iconos, avatares y prueba de base de datos
- `public/` — `geo/`, `data/`, banderas, avatares y `push-sw.js`

## Comandos
```bash
npm install
npm run dev        # sin .env.local arranca en modo demo
npm run build      # iconos + tsc + vite build
npm run lint       # oxlint
npm run test:db    # migraciones, seed y RLS en PGlite
npm run preview    # tras build; el service worker no se activa con dev
npx supabase migration list --remote   # historial de migraciones del proyecto enlazado
npx supabase db push --remote          # aplica las pendientes a PRODUCCIÓN (sin --remote va a la base local)
```
Ojo: `.env.local` apunta a la base de **producción**. Para probar sin tocar datos reales, usa el modo demo (`VITE_DEMO=1`). `?fecha=AAAA-MM-DD` cambia el día en el inicio y en Hoy, y `?sello=TR` fuerza el sello al llegar.

No hay tests de frontend ni CI: lo que hay que pasar a mano es `npx tsc -b --noEmit`, `npm run lint` y `npm run test:db`.

## Convenciones
- Un método nuevo de datos va en `Api` (`types.ts`) y en **las dos** implementaciones, `supabase.ts` y `demo.ts`. Si es una escritura de viaje, también en `outbox.ts` para que funcione sin red.
- Los registros nuevos llevan el id generado en el navegador (`src/lib/id.ts`): así reenviar una alta no la duplica.
- Cada cambio de esquema es una migración nueva con su RLS; `test:db` comprueba el aislamiento entre usuarios.
- Las funciones de `api/` y lo que comparten con ellas (`src/lib/calendar.js`) van en JavaScript para que Vercel no tenga que compilarlas. `@vercel/og` está fijado en 0.11.1 (ver `STATUS.md`).
- Colores con variables CSS de `src/index.css`. El modo oscuro solo cambia sus valores: sobre `bg-ink` usa `text-paper`, no `text-white`.
- En los mapas, `MAP_COLORS` en vez de colores sueltos.
- Los iconos de Material Symbols van recortados: `npm run icons` regenera la fuente con los usados (se ejecuta en cada build).

## Despliegue
- Cada `git push` a `main` despliega en Vercel. `vercel.json` define reescrituras, cabeceras y el cron de `/api/push?action=daily` (8:00 UTC).
- **Las migraciones no se despliegan con el push**: hay que aplicarlas aparte con `npx supabase db push --remote`, antes de subir el código que las usa. Si se aplican desde el editor SQL, el historial no se entera y el siguiente `db push` falla con «already exists».
- Variables en `.env.example`. Las que no llevan `VITE_` (`VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) son secretas y solo van en Vercel.

> El estado del trabajo (qué se hizo, qué falta) está en `STATUS.md`.
