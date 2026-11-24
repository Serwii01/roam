# Estado del proyecto

> Lo mantiene Claude con `/cerrar`. Es la memoria de trabajo: dónde se quedó y qué viene después.

## Estado actual
Producción sirve `main` (dc1241a, 24 nov) con todo: documentos sin conexión, reservas, gastos en grupo, avisos por defecto, rutas exactas y la landing completa. Las 19 migraciones están aplicadas, incluida `20261124000000_expense_activity.sql`. CI en verde. Publicado sin probar en móviles reales.

## Siguientes pasos
- [x] Vídeo vertical de «Revive tu viaje» para stories: falta una prueba de grabar el mapa; el audio de Spotify no entraría
- [ ] Comprobar que `VITE_OAUTH_PROVIDERS=google` está en Vercel y que el acceso con Google está configurado (ver README)
- [x] Probar en un móvil real: instalación, avisos, modo sin conexión y pantalla «Hoy»
- [ ] Poner al día la portada del README: la tabla de stack aún dice que OAuth es «más adelante» y no menciona las funciones de Vercel
- [ ] Revisar los puntos de «Antes de publicar» del README: región de Supabase, datos legales y marca «ROAM» en OEPM y EUIPO
- [ ] Borrar las ramas `docs/claude-status` y `feat/revive-recuerdos-sello`, aquí y en GitHub
- [ ] Probar en un móvil real la rama `feat/viaje-sin-conexion-y-reservas`: visor de PDF en modo avión, tickets sin conexión y reservas con correos reales
- [ ] Revisar los datos de `src/lib/countryFacts.ts` (sobre todo los teléfonos de emergencia) y el enlace a Exteriores, que no se pudo comprobar
- [x] Fusionar `feat/viaje-sin-conexion-y-reservas` en `main` tras la prueba (la migración ya está en producción)
- [ ] Comprobar en Vercel las variables de avisos: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] Decidir si se reenvían correos a una dirección de la app: necesita dominio y servicio de correo entrante
- [ ] Probar la lectura real del GPS del sello al llegar en un país del viaje
- [x] Comprobar en GitHub Actions que la CI de `feat/viaje-sin-conexion-y-reservas` pasa (gh no está instalado en este equipo)
- [ ] En el móvil: portadas de la bitácora tras horas sin abrir la app, foto recién subida sin recargar, resumen del tiempo e ideas por zonas del día a día
- [x] Traer `main` a `feat/gastos-rutas-y-movil`: 3 commits del 4 nov (tests de saldos y cola, CI, fotos de Wikipedia en el día a día) que chocan en `DayPlan.tsx`, `outbox.test.ts`, `money.test.ts`, `hooks.ts`, `package.json`, `package-lock.json`, `vitest.config.ts`, CI y CLAUDE.md
- [x] Cuando el usuario dé el visto bueno, aplicar `20261124000000_expense_activity.sql` en producción ANTES de desplegar `feat/gastos-rutas-y-movil`
- [ ] Probar en móviles reales `feat/gastos-rutas-y-movil`: avisos de gastos y pagos entre dos cuentas, tiempo real, PDF y CSV compartidos, y rutas abiertas en Google Maps
- [x] Actualizar la política de privacidad (`src/pages/Legal.tsx`): historial de gastos y bandeja de avisos (60 días)
- [ ] Ampliar `exportMyData` (no lleva historial, avisos, equipaje, alojamientos ni documentos) y borrar al eliminar la cuenta los tickets propios en viajes de otros
- [ ] Mirar si Vercel crea vistas previas de las ramas con las variables de producción y si la CI de `feat/gastos-rutas-y-movil` pasa

## Última sesión

### 2026-11-24
- Política de privacidad al día (`Legal.tsx`, 24 nov): gastos e historial, bandeja (60 días), fotos de Wikimedia, rutas de FOSSGIS, Google Maps, borrado de cuenta y qué lleva la copia de datos; la landing ya no dice «copia completa»
- Publicado en `main` (dc1241a). Migración `20261124000000` aplicada y registrada en el historial desde el editor SQL, en una transacción: el Control de aplicaciones de Windows bloquea `supabase.exe` (3.4.0) en este equipo. Verificados RLS, disparadores, permisos y tiempo real; 26 gastos intactos y 1 pago marcado como confirmado
- Vercel sí crea vistas previas de las ramas; falta saber con qué variables
- `main` fusionado en `feat/gastos-rutas-y-movil`: se conservan los tests de ambos lados (los de `main`, en `money.cuentas.test.ts` y `outbox.idb.test.ts`). Pasan tsc, lint, 231 tests, test:db y build (Node 24)
- Landing renovada (`Landing.tsx`, `LandingPanels.tsx`): antes, durante, después y juntos con muestras de la app, y catálogo con buscador de 87 funciones en 11 temas (`FeatureCatalog.tsx`, datos en `featureCatalog.ts`: actualizarlo al añadir funciones). Los sellos ya no llevan borde blanco en oscuro. Probada en modo demo a 1280, 768 y 375 px; no en móvil real
- Día a día probado en modo demo tras la fusión (fotos, ideas por zonas y ubicación manual, también a 375 px). Corregido: ubicar un sitio con otro lugar ya no le pone el artículo y la foto de ese otro (`locatePatch`). Sin probar: móvil real, fotos sin conexión, arrastrar y abrir las rutas
- Gastos: exportar (CSV e informe PDF), saldos con detalle y al céntimo, registrar cualquier pago o cambio de efectivo, confirmación por quien cobra, historial con recuperación, cierre de cuentas, gasto rápido y categoría automática
- Avisos: la base de datos crea los de gastos y pagos con disparadores y `/api/push?action=flush` los envía; recordatorios diarios, bandeja en la app y todos activados por defecto (se propone el permiso al entrar)
- Cambios en vivo de gastos y cuentas (tiempo real sobre `expense_history`) y refresco al volver a la app
- Google Maps: coordenadas en vez de nombres, 5 puntos por ruta en móvil y sin notas; ordenar el día por cercanía y ubicar sitios escritos a mano
- Móvil: cabecera compacta, botón + según pantalla, accesibilidad y textos claros; `TripLog`, `TripEditor` y `TripBudget` divididos; pruebas de pantallas con jsdom
- Probado en modo demo a 375 px; no en móvil real, ni el envío real de avisos, ni el tiempo real, ni abriendo las rutas en Google Maps

### 2026-11-16
- Vitest (`npm test`, 126 tests: saldos, cola sin conexión, días, sello, ideas, fotos, tiempo) y CI en GitHub Actions (tsc, lint, tests, test:db)
- Sello al llegar: borde más cercano a ≤15 km y parada del viaje para costas, islas perdidas (Ibiza, Azores) y aeropuertos de frontera (Ginebra)
- Ideas del día a día por zonas de ~1 km (primero la de al lado de lo que ya tienes ese día) y sin repetir sitios de otros días (nombre sin tildes, artículo o <150 m)
- Fotos rotas o en blanco en la bitácora: enlaces firmados caducados en caché sin repintar; ahora se repintan y se vuelven a firmar al fallar (`PhotoImg`, `refreshPhotos`)
- Resumen del tiempo de todo el viaje y por parada en el resumen del viaje (sustituye a la lista del día de llegada)
- Lint de 61 a 52 avisos; `useCountries().name` estable

### 2026-11-04 (en `main`)
- 9ac2787: tests de saldos y de la cola, CI; la cola ya no descarta cambios si la sesión ha caducado y envía en la misma pasada lo apuntado mientras se vacía
- 13a15a9: foto de Wikipedia en cada sitio del día a día, con autor y licencia y disponible sin conexión
- 85787e7: foto también en sitios sin artículo enlazado, por nombre y ubicación en Wikipedia y Commons

## Decisiones
- La ubicación del sello al llegar se resuelve en el móvil contra `public/geo`: no sale del dispositivo. Es opcional y se activa en Hoy.
- Los avisos de recuerdos son solo texto: las fotos son privadas y sus enlaces caducan. La foto sale en la tarjeta del inicio.
- Sin inicio de sesión con Apple: necesita la cuenta de desarrollador de pago. Solo email y Google.
- PWA en lugar de apps en las tiendas: instalable en Android e iOS sin pasar por ellas.
- Stack gratuito: planes gratis de Supabase y Vercel y mapas sin API key. El plan Hobby de Vercel es para uso no comercial; si se cobra, pasar a Pro o a Cloudflare Pages.
- Funciones de `api/` en JavaScript y `@vercel/og` fijado en 0.11.1: la versión con HarfBuzz requería `fs` y no funciona en Edge.
- El aviso de versión nueva no recarga solo, para no perder un viaje a medio editar.
- Solo el creador marca un viaje compartido como realizado; lo impone un disparador en la base de datos.
- El sello al llegar compara con el país de casa del perfil, no con la primera parada: muchos viajes no apuntan la salida de casa.
- «Revive tu viaje» es una línea de tiempo calculada (`src/lib/replay.ts`), no animaciones encadenadas: así se puede pausar y saltar.
- Documentos sin conexión: se guardan solos desde 30 días antes de la salida hasta la vuelta y se abren con un visor propio (pdf.js), porque Chrome para Android no abre un PDF guardado en el móvil.
- Reservas: se pegan o se sube un `.eml` y se leen en el navegador, con revisión antes de guardar. No se reenvían correos: necesitaría dominio y servicio de correo entrante.
- Foto del ticket: solo se adjunta; el importe no se lee de la foto. Va al bucket `trip-docs`, en la carpeta del viaje.
- Ficha del país: datos escritos a mano para unos 70 destinos, marcados como orientativos; sin ficha no se enseña nada.
- No se rehace `world.json` (simplificar menos cambia el mapa y su peso): la detección del país al llegar se compensa en `arrivalCountry`
- Las fotos se pintan con `<PhotoImg path>`, no con `api.photoUrl` en un `<img>`: así se repintan y reintentan cuando caduca el enlace
- Los avisos de gastos los crean disparadores en la base de datos, no el cliente: funcionan con la cola sin conexión y no se pueden falsificar
- Pagos: los pendientes de confirmar cuentan en los saldos y los rechazados no; solo los confirma quien los recibe (lo impone la base de datos)
- El cambio de efectivo es un `settlement` con `transfer_kind = 'cash'` y lo borrado se recupera del historial (sin papelera): así las versiones antiguas de la app siguen funcionando
- El tiempo real escucha `expense_history` y no `expenses`: así también llegan los borrados
- Google Maps recibe coordenadas: exacto, aunque enseñe un punto en vez de la ficha del sitio

## Problemas conocidos
- `.env.local` no tiene `VITE_VAPID_PUBLIC_KEY` ni `VITE_OAUTH_PROVIDERS`: en local no se pueden probar los avisos ni el botón de Google.
- 52 avisos de `oxlint`: `setState` en efectos (22), `only-export-components` (19, solo afecta a la recarga en caliente), `Date` durante el render y dos falsos positivos de refs en el arrastre. No bloquean.
- `version` sigue en `0.0.0` en `package.json`.
- `public/geo/world.json` está simplificado (`-simplify 22%`): recorta la costa unos km (21 de 36 ciudades de costa o isla probadas caían «en el mar»), se come islas como Ibiza, Santorini o Azores y deja el aeropuerto de Ginebra en Francia. `arrivalCountry` lo suple: borde más cercano a ≤ 15 km, parada del viaje a ≤ 100 km fuera de las siluetas y a ≤ 30 km si la silueta da un país que no es del viaje (ver `welcome.test.ts`). Una isla perdida sin parada del viaje cerca sigue sin detectarse; arreglarlo de raíz es simplificar menos en `build-data.mjs` (cambia el mapa y el peso del archivo).
- `.env.local` apunta a la base de producción: `npm run dev` con él trabaja con datos reales. Para probar sin tocarlos, usar modo demo.
- El modo demo no pasa por `outbox.ts`: la cola sin conexión de los tickets solo se puede probar con Supabase real.
- pdf.js pinta con `requestAnimationFrame`: en una pestaña o panel oculto el visor no dibuja las páginas.
- En PowerShell de este equipo los scripts están bloqueados: `npx` no funciona y hay que usar `npx.cmd`.
- `db push` y `migration repair` sobre producción piden confirmación; en modo agente hacen falta `--yes` y el visto bueno del usuario.
- Ninguna de las mejoras de esta sesión se ha visto en el navegador: la vista previa de Claude abre el `launch.json` de EstudiosCriticos (en roam hay `.claude/launch.json` con `demo`, sin commit)
- `settleBalances` da como mucho N−1 pagos, pero no siempre el mínimo exacto (el comentario dice «el mínimo»)
- `cuentas-estambul.pdf` (datos privados) está en la carpeta, excluido solo en este equipo con `.git/info/exclude`: no subirlo
