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

## Publicar en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio `Serwii01/roam` de GitHub. Vercel lee `vercel.json` (Vite, `npm run build`, carpeta `dist`, Node 22) y no hay que tocar nada más.
2. Antes de pulsar **Deploy**, abre **Environment Variables** y añade (para *Production* y *Preview*):

   | Variable | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://xrjalgaekawkuhmcrmmm.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | tu clave `sb_publishable_…` (nunca la *secret*) |
   | `VITE_LEGAL_NAME` | tu nombre |
   | `VITE_LEGAL_EMAIL` | tu email de contacto |
   | `VITE_CONTACT_EMAIL` | el mismo email (lo recibe Nominatim) |

   Si falta alguna de las dos de Supabase, la web muestra «ROAM no está configurado» en vez de arrancar en modo demo.
3. **Deploy.** Al terminar tendrás una URL como `https://roam-xxxx.vercel.app`.
4. En Supabase → **Authentication → URL Configuration**: pon esa URL como **Site URL** y añade en **Redirect URLs** `https://roam-xxxx.vercel.app/**`.
5. Cada `git push` a `main` vuelve a desplegar automáticamente.

> El plan gratuito *Hobby* de Vercel es para uso no comercial: perfecto para la beta. Si algún día cobras, pasa a *Pro* o muévelo a Cloudflare Pages (el proyecto ya incluye `public/_headers` y `_redirects`).

## Antes de publicar (legal y privacidad)

- **Supabase en la UE:** al crear el proyecto, elige la región *Frankfurt (eu-central-1)*. La política de privacidad lo da por hecho.
- **Datos del titular:** rellena `VITE_LEGAL_NAME` y `VITE_LEGAL_EMAIL` (y `VITE_LEGAL_NIF` y `VITE_LEGAL_ADDRESS` si es una actividad económica) en el entorno de producción. Mientras falten, las páginas legales muestran un aviso de plantilla.
- **Revisión:** `/privacidad`, `/aviso-legal` y `/terminos` son plantillas razonables para un servicio gratuito en España; conviene que las revise un profesional antes de un lanzamiento comercial.
- **Marca:** comprueba el nombre «ROAM» en la OEPM y la EUIPO antes de usarlo públicamente.
- **Nominatim:** pon `VITE_CONTACT_EMAIL`. Si la app crece, usa un geocodificador propio o de pago.
- **Licencias de terceros:** en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y en `/creditos`.

## Scripts

- `npm run data`: vuelve a descargar las fuentes abiertas y regenera `supabase/seed.sql`, `public/geo/regions/*.json` y `public/data/*.json`.
- `npm run icons`: recalcula los iconos usados y descarga la fuente recortada a `src/assets/fonts` (se ejecuta en cada build).
- `npm run avatars`: genera los monigotes de `public/avatars`.
- `npm run test:db`: ejecuta la migración y el seed en un Postgres embebido (PGlite) y comprueba las políticas RLS entre usuarios.

## Estructura

- `supabase/migrations/`: esquema, RLS, vistas de lugares visitados, búsqueda de aeropuertos cercanos y bucket de fotos.
- `src/lib/api/`: interfaz de datos con dos implementaciones, `supabase.ts` (real) y `demo.ts` (navegador).
- `src/lib/stats.ts` y `src/lib/badges.ts`: estadísticas, rangos, insignias y sellos.
- `src/components/WorldMap.tsx`: mapa mundial (2D/3D/calor, países, rutas, pines). `RegionMap.tsx` es el mapa por país.
- `src/pages/`: portada, acceso, Explorador & Mapa, Bitácora, Viaje, Editor, Pasaporte & Badges, Países, País, Bucket List y Ajustes.
