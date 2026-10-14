# ROAM · Kinetic Travel Tracker

App web para registrar viajes y rutas, entre Wanderlog/Wandria y Been. Tiene mapa del mundo en plano y en globo 3D, países, regiones y provincias visitados, rutas en avión, tren o carretera con aeropuertos reales, una bitácora por días con fotos, un pasaporte de sellos e insignias, y una bucket list. El diseño es el del proyecto de Stitch "Minimalist Travel Map Tracker".

## Stack (todo gratuito)

| Pieza | Para qué |
| --- | --- |
| React + Vite + TypeScript + Tailwind v4 | Web estática (Cloudflare Pages, Vercel o Netlify) |
| Supabase (Postgres + Auth + Storage) | Base de datos, cuentas (email, OAuth más adelante) y fotos |
| MapLibre GL + OpenFreeMap | Mapas vectoriales y globo 3D, sin API key |
| Photon / Nominatim (OpenStreetMap) | Búsqueda de lugares y códigos ISO de región/provincia |
| OurAirports, ISO 3166-2 (Debian), Natural Earth | 249 países, 5.046 subdivisiones, 5.332 aeropuertos y fronteras |

## Arrancar

```bash
npm install
npm run dev
```

Sin `.env.local` la app arranca en **modo demo**: entra con cualquier email y verás datos de ejemplo guardados en el navegador.

## Conectar Supabase

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. Copia `.env.example` como `.env.local` y pon la *Project URL* y la *anon key* (Project Settings → API).
3. En Authentication → URL Configuration, pon `http://localhost:5173` como Site URL (y tu dominio cuando despliegues).
4. Carga el esquema, la seguridad (RLS) y los datos de referencia:

```bash
npx supabase login
npx supabase link --project-ref TU_REF
npx supabase db push --include-seed
```

Para activar OAuth: habilita el proveedor en Supabase → Authentication → Providers y añádelo a `VITE_OAUTH_PROVIDERS` (por ejemplo, `google,github`).

## Scripts

- `npm run data`: vuelve a descargar las fuentes abiertas y regenera `supabase/seed.sql`, `public/geo/regions/*.json` y `public/data/*.json`.
- `npm run test:db`: ejecuta la migración y el seed en un Postgres embebido (PGlite) y comprueba las políticas RLS entre usuarios.

## Estructura

- `supabase/migrations/`: esquema, RLS, vistas de lugares visitados, búsqueda de aeropuertos cercanos y bucket de fotos.
- `src/lib/api/`: interfaz de datos con dos implementaciones, `supabase.ts` (real) y `demo.ts` (navegador).
- `src/lib/stats.ts` y `src/lib/badges.ts`: estadísticas, rangos, insignias y sellos.
- `src/components/WorldMap.tsx`: mapa mundial (2D/3D/calor, países, rutas, pines). `RegionMap.tsx` es el mapa por país.
- `src/pages/`: portada, acceso, Explorador & Mapa, Bitácora, Viaje, Editor, Pasaporte & Badges, Países, País, Bucket List y Ajustes.
