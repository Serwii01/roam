# Estado del proyecto

> Lo mantiene Claude con `/cerrar`. Es la memoria de trabajo: dónde se quedó y qué viene después.

## Estado actual
Producción (`main`, 4531d96) tiene «Revive tu viaje», recuerdos y sello al llegar, probados en móvil real. En la rama `feat/viaje-sin-conexion-y-reservas` (56eea96, en GitHub, sin fusionar) están los documentos sin conexión, las reservas desde un correo, la ficha del país y la foto del ticket: pasan `tsc`, `lint`, `test:db` y build, y funcionan en modo demo. Producción ya tiene las 18 migraciones, incluida la de tickets. Falta probar la rama en un móvil real antes de fusionarla.

## Siguientes pasos
- [ ] Vídeo vertical de «Revive tu viaje» para stories: falta una prueba de grabar el mapa; el audio de Spotify no entraría
- [ ] Comprobar que `VITE_OAUTH_PROVIDERS=google` está en Vercel y que el acceso con Google está configurado (ver README)
- [ ] Probar en un móvil real: instalación, avisos, modo sin conexión y pantalla «Hoy»
- [ ] Poner al día la portada del README: la tabla de stack aún dice que OAuth es «más adelante» y no menciona las funciones de Vercel
- [ ] Revisar los puntos de «Antes de publicar» del README: región de Supabase, datos legales y marca «ROAM» en OEPM y EUIPO
- [ ] Valorar una CI mínima (`tsc`, `lint`, `test:db`) en GitHub Actions: ahora no hay ninguna
- [ ] Tests de `outbox.ts` y de los saldos de gastos, y después la CI mínima
- [ ] Borrar las ramas `docs/claude-status` y `feat/revive-recuerdos-sello`, aquí y en GitHub
- [ ] Probar en un móvil real la rama `feat/viaje-sin-conexion-y-reservas`: visor de PDF en modo avión, tickets sin conexión y reservas con correos reales
- [ ] Revisar los datos de `src/lib/countryFacts.ts` (sobre todo los teléfonos de emergencia) y el enlace a Exteriores, que no se pudo comprobar
- [ ] Fusionar `feat/viaje-sin-conexion-y-reservas` en `main` tras la prueba (la migración ya está en producción)
- [ ] Comprobar en Vercel las variables de avisos: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] Decidir si se reenvían correos a una dirección de la app: necesita dominio y servicio de correo entrante
- [ ] Probar la lectura real del GPS del sello al llegar en un país del viaje

## Última sesión

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

### 2026-11-03
- Añadidos «Revive tu viaje», recuerdos y sello al llegar, probados en modo demo (ver README). Aplicada `20261030000000_memories.sql` en producción y subido a `main`
- Pull de los 21 commits del 22 oct hechos desde otro equipo
- Creados `CLAUDE.md` y este `STATUS.md` a partir del repo; no se tocó código
- Comprobado: `npm ci`, `tsc`, `lint`, `test:db` y el estado de las migraciones en producción
- Revisadas las 5 migraciones pendientes contra producción: `20261025` a `20261028` ya estaban aplicadas fuera del historial (seguramente desde el editor SQL) y coincidían con los archivos, así que se marcaron con `migration repair`
- Aplicada en producción la `20261029` con `db push --remote`; ningún viaje de perfil privado pasó a ser visible (recuento previo: 0)

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

## Problemas conocidos
- `.env.local` no tiene `VITE_VAPID_PUBLIC_KEY` ni `VITE_OAUTH_PROVIDERS`: en local no se pueden probar los avisos ni el botón de Google.
- 61 avisos de `oxlint`, en su mayoría reglas de React (`Date` durante el render, `setState` en efectos). No bloquean.
- Sin tests de frontend: la lógica de `outbox.ts`, `days.ts` y los saldos de gastos no tiene pruebas automáticas.
- `version` sigue en `0.0.0` en `package.json`.
- `public/geo/world.json` está simplificado: deja fuera ciudades de costa e islas (Estambul, Reikiavik, Fiyi). `arrivalCountry` lo suple con la parada del viaje a menos de 100 km; fuera de eso, no se detecta el país.
- `.env.local` apunta a la base de producción: `npm run dev` con él trabaja con datos reales. Para probar sin tocarlos, usar modo demo.
- El modo demo no pasa por `outbox.ts`: la cola sin conexión de los tickets solo se puede probar con Supabase real.
- pdf.js pinta con `requestAnimationFrame`: en una pestaña o panel oculto el visor no dibuja las páginas.
- En PowerShell de este equipo los scripts están bloqueados: `npx` no funciona y hay que usar `npx.cmd`.
- `db push` y `migration repair` sobre producción piden confirmación; en modo agente hacen falta `--yes` y el visto bueno del usuario.
