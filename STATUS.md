# Estado del proyecto

> Lo mantiene Claude con `/cerrar`. Es la memoria de trabajo: dónde se quedó y qué viene después.

## Estado actual
Producción (`main`, 4531d96) tiene «Revive tu viaje», recuerdos y sello al llegar. La rama `feat/viaje-sin-conexion-y-reservas` (83f5cb3, subida a GitHub por primera vez el 2026-11-16, sin fusionar) suma documentos sin conexión, reservas desde un correo, ficha del país, foto del ticket, tests con Vitest y CI, sello en costas e islas, ideas por zonas, arreglo de fotos y resumen del tiempo. Pasa tsc, lint, 126 tests y test:db; falta probarla en un móvil real antes de fusionar.

## Siguientes pasos
- [x] Vídeo vertical de «Revive tu viaje» para stories: falta una prueba de grabar el mapa; el audio de Spotify no entraría
- [ ] Comprobar que `VITE_OAUTH_PROVIDERS=google` está en Vercel y que el acceso con Google está configurado (ver README)
- [x] Probar en un móvil real: instalación, avisos, modo sin conexión y pantalla «Hoy»
- [ ] Poner al día la portada del README: la tabla de stack aún dice que OAuth es «más adelante» y no menciona las funciones de Vercel
- [ ] Revisar los puntos de «Antes de publicar» del README: región de Supabase, datos legales y marca «ROAM» en OEPM y EUIPO
- [ ] Borrar las ramas `docs/claude-status` y `feat/revive-recuerdos-sello`, aquí y en GitHub
- [ ] Probar en un móvil real la rama `feat/viaje-sin-conexion-y-reservas`: visor de PDF en modo avión, tickets sin conexión y reservas con correos reales
- [ ] Revisar los datos de `src/lib/countryFacts.ts` (sobre todo los teléfonos de emergencia) y el enlace a Exteriores, que no se pudo comprobar
- [ ] Fusionar `feat/viaje-sin-conexion-y-reservas` en `main` tras la prueba (la migración ya está en producción)
- [ ] Comprobar en Vercel las variables de avisos: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] Decidir si se reenvían correos a una dirección de la app: necesita dominio y servicio de correo entrante
- [ ] Probar la lectura real del GPS del sello al llegar en un país del viaje
- [ ] Comprobar en GitHub Actions que la CI de `feat/viaje-sin-conexion-y-reservas` pasa (gh no está instalado en este equipo)
- [ ] En el móvil: portadas de la bitácora tras horas sin abrir la app, foto recién subida sin recargar, resumen del tiempo e ideas por zonas del día a día
- [ ] Aviso push para hacer el check-in 24 h antes de un vuelo (hay cron, push y datos del vuelo)

## Última sesión

### 2026-11-16
- Vitest (`npm test`, 126 tests: saldos, cola sin conexión, días, sello, ideas, fotos, tiempo) y CI en GitHub Actions (tsc, lint, tests, test:db)
- Sello al llegar: borde más cercano a ≤15 km y parada del viaje para costas, islas perdidas (Ibiza, Azores) y aeropuertos de frontera (Ginebra)
- Ideas del día a día por zonas de ~1 km (primero la de al lado de lo que ya tienes ese día) y sin repetir sitios de otros días (nombre sin tildes, artículo o <150 m)
- Fotos rotas o en blanco en la bitácora: enlaces firmados caducados en caché sin repintar; ahora se repintan y se vuelven a firmar al fallar (`PhotoImg`, `refreshPhotos`)
- Resumen del tiempo de todo el viaje y por parada en el resumen del viaje (sustituye a la lista del día de llegada)
- Lint de 61 a 52 avisos; `useCountries().name` estable

### 2026-11-04
- Subido a `main` (5ac35e8): «Revive tu viaje», recuerdos y sello al llegar
- Aplicada y verificada en producción `20261030000000_memories.sql`; `due_notifications` sigue cerrada para `anon` y `authenticated`
- Probado en modo demo y con coordenadas reales; corregida la detección de país en costas e islas con la parada más cercana
- No comprobado: despliegue en Vercel, móvil real, lectura real del GPS y recepción de un aviso real
- Probado en móvil real por el usuario: «Revive tu viaje», recuerdos y sello al llegar, sin incidencias (la lectura real del GPS en otro país no se confirmó por separado)
- Comprobado que producción sirve `4531d96` y que incluye las tres funciones
- En la rama `feat/viaje-sin-conexion-y-reservas` (56eea96, subida a GitHub, sin fusionar): documentos sin conexión con visor pdf.js, reservas desde un correo (pegar texto o .eml), ficha del país en Hoy y foto del ticket en gastos
- Migración `20261031000000_expense_receipts.sql` aplicada en producción desde el editor SQL y registrada con `migration repair`; las 18 coinciden y `db push` está al día
- Pasan `tsc`, `lint` (0 errores), `test:db` y build. Probado en modo demo: ficha del país, guardado de documentos, tickets y reservas
- No comprobado: visor de PDF dentro de la app (el panel oculto para requestAnimationFrame; la lectura del PDF guardado sí se probó aparte), modo avión real, cola sin conexión de tickets y correos reales

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

## Problemas conocidos
- `.env.local` no tiene `VITE_VAPID_PUBLIC_KEY` ni `VITE_OAUTH_PROVIDERS`: en local no se pueden probar los avisos ni el botón de Google.
- 52 avisos de `oxlint`: `setState` en efectos (22), `only-export-components` (19, solo afecta a la recarga en caliente), `Date` durante el render y dos falsos positivos de refs en el arrastre. No bloquean.
- Sin tests de componentes: hay tests de la lógica de `outbox.ts`, `money.ts` (saldos) y `days.ts` (fechas y orden del plan).
- `version` sigue en `0.0.0` en `package.json`.
- `public/geo/world.json` está simplificado (`-simplify 22%`): recorta la costa unos km (21 de 36 ciudades de costa o isla probadas caían «en el mar»), se come islas como Ibiza, Santorini o Azores y deja el aeropuerto de Ginebra en Francia. `arrivalCountry` lo suple: borde más cercano a ≤ 15 km, parada del viaje a ≤ 100 km fuera de las siluetas y a ≤ 30 km si la silueta da un país que no es del viaje (ver `welcome.test.ts`). Una isla perdida sin parada del viaje cerca sigue sin detectarse; arreglarlo de raíz es simplificar menos en `build-data.mjs` (cambia el mapa y el peso del archivo).
- `.env.local` apunta a la base de producción: `npm run dev` con él trabaja con datos reales. Para probar sin tocarlos, usar modo demo.
- El modo demo no pasa por `outbox.ts`: la cola sin conexión de los tickets solo se puede probar con Supabase real.
- pdf.js pinta con `requestAnimationFrame`: en una pestaña o panel oculto el visor no dibuja las páginas.
- En PowerShell de este equipo los scripts están bloqueados: `npx` no funciona y hay que usar `npx.cmd`.
- `db push` y `migration repair` sobre producción piden confirmación; en modo agente hacen falta `--yes` y el visto bueno del usuario.
- Ninguna de las mejoras de esta sesión se ha visto en el navegador: la vista previa de Claude abre el `launch.json` de EstudiosCriticos (en roam hay `.claude/launch.json` con `demo`, sin commit)
