# Avisos de terceros

ROAM incluye o redistribuye los siguientes datos y componentes. Los textos de licencia completos están en [`licenses/`](licenses/). La página `/creditos` de la app muestra la misma información a los usuarios.

## Datos redistribuidos con la app

| Componente | Dónde está | Titular | Licencia |
| --- | --- | --- | --- |
| Subdivisiones ISO 3166-2 | `supabase/seed.sql`, `public/data/subdivisions.json` | Debian iso-codes (© 2016 Dr. Tobias Quathamer y colaboradores) | LGPL-2.1-or-later ([texto](licenses/iso-codes-LGPL-2.1-or-later.txt)). Convertidos de `data/iso_3166-2.json` por `scripts/build-data.mjs`; fuente: https://salsa.debian.org/iso-codes-team/iso-codes |
| Poblaciones del buscador | `public/data/places/*.json` | GeoNames (https://www.geonames.org) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modificados:** filtrados (≥5.000 hab.), nombres en español añadidos desde Natural Earth y troceados por prefijo. |
| Nombres de ciudades en español | `public/data/places.json` | Natural Earth populated places | Dominio público |
| Aeropuertos y países | `supabase/seed.sql`, `public/data/*.json` | OurAirports | Dominio público |
| Fronteras de países | `public/geo/world.json` | Natural Earth, vía world-atlas (© Mike Bostock) | Datos: dominio público. world-atlas: ISC ([texto](licenses/world-atlas-ISC.txt)). Simplificados y corregidos en el antimeridiano. |
| Fronteras de regiones | `public/geo/regions/*.json` | Natural Earth | Dominio público. Simplificadas. |
| Nombres de países en español | dentro del JavaScript | i18n-iso-countries | MIT ([texto](licenses/i18n-iso-countries-MIT.txt)) |
| Banderas | `public/flags/*.svg` | flag-icons (© 2013 Panayiotis Lipiridis) | MIT ([texto](licenses/flag-icons-MIT.txt)) |
| Avatares | `public/avatars/*.svg` | «Croodles» de Vijay Verma, generados con DiceBear | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modificados:** colores de fondo y de pelo. |
| Iconos | `dist/assets/material-symbols-*.woff2` | Material Symbols (Google) | Apache 2.0 ([texto](licenses/material-symbols-Apache-2.0.txt)). Subconjunto con los iconos usados. |
| Tipografías | dentro de `dist/assets` | Space Grotesk, Plus Jakarta Sans | SIL OFL 1.1 ([Space Grotesk](licenses/space-grotesk-OFL-1.1.txt), [Plus Jakarta Sans](licenses/plus-jakarta-sans-OFL-1.1.txt)) |
| Conversión de fotos HEIC | `dist/assets/heic-to-*.js` (se carga solo al elegir una foto HEIC) | heic-to, con libheif (© struktur AG) y libde265 | LGPL-3.0 ([licencia](licenses/heic-to-libheif-LGPL-3.0.txt), [aviso](licenses/heic-to-NOTICE.txt)). Se usa sin modificar, como módulo independiente que puede sustituirse. Fuente: https://github.com/hoppergee/heic-to y https://github.com/strukturag/libheif |
| Motor de mapas | dentro de `dist/assets` | MapLibre GL JS | BSD-3-Clause ([texto](licenses/maplibre-gl-BSD-3-Clause.txt)) |

## Servicios externos que usa la app (no se redistribuyen)

- **OpenStreetMap**: los datos de mapas y búsqueda son © colaboradores de OpenStreetMap, con licencia ODbL 1.0 (https://www.openstreetmap.org/copyright). La atribución aparece en el pie de la app y en los mapas.
- **OpenFreeMap**: teselas y estilo «Liberty» del mapa moderno, con atribución en el propio mapa (https://openfreemap.org).
- **Photon (komoot)**: búsqueda de lugares, con uso razonable (https://photon.komoot.io).
- **Geoapify** (opcional, con `VITE_GEOAPIFY_KEY`): búsqueda de lugares; plan gratuito con atribución «Powered by Geoapify», que se muestra bajo los resultados (https://www.geoapify.com).
- **Nominatim (OSMF)**: solo consulta inversa al elegir un lugar, con un máximo de 1 petición por segundo, caché y sin autocompletado, según su política (https://operations.osmfoundation.org/policies/nominatim/). Se puede desactivar con `VITE_NOMINATIM=off`.
- **Spotify**: reproductor embebido y oEmbed, según los términos de Spotify. El reproductor solo se carga al pulsarlo.
