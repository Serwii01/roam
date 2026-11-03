# Estado del proyecto

> Lo mantiene Claude con `/cerrar`. Es la memoria de trabajo: dónde se quedó y qué viene después.

## Estado actual
App funcional con un conjunto amplio de funciones: PWA instalable, modo sin conexión, plan día a día, pantalla «Hoy», gastos tipo Tricount, calendario, avisos y modo oscuro. La base de datos de producción está al día con `main`: las 16 migraciones aplicadas y en el historial (2026-11-03). `tsc`, `lint` (0 errores, 60 avisos) y `test:db` pasan. No se ha probado aún en un móvil real ni contra producción.

## Siguientes pasos
- [ ] Comprobar en Vercel que el último despliegue es el de `2840604` y que están las variables de avisos: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] Comprobar que `VITE_OAUTH_PROVIDERS=google` está en Vercel y que el acceso con Google está configurado (ver README)
- [ ] Probar en un móvil real: instalación, avisos, modo sin conexión y pantalla «Hoy»
- [ ] Poner al día la portada del README: la tabla de stack aún dice que OAuth es «más adelante» y no menciona las funciones de Vercel
- [ ] Revisar los puntos de «Antes de publicar» del README: región de Supabase, datos legales y marca «ROAM» en OEPM y EUIPO
- [ ] Valorar una CI mínima (`tsc`, `lint`, `test:db`) en GitHub Actions: ahora no hay ninguna

## Última sesión
### 2026-11-03
- Pull de los 21 commits del 22 oct hechos desde otro equipo
- Creados `CLAUDE.md` y este `STATUS.md` a partir del repo; no se tocó código
- Comprobado: `npm ci`, `tsc`, `lint`, `test:db` y el estado de las migraciones en producción
- Revisadas las 5 migraciones pendientes contra producción: `20261025` a `20261028` ya estaban aplicadas fuera del historial (seguramente desde el editor SQL) y coincidían con los archivos, así que se marcaron con `migration repair`
- Aplicada en producción la `20261029` con `db push --remote`; ningún viaje de perfil privado pasó a ser visible (recuento previo: 0)
- No se ejecutó `npm run build` para no regenerar la fuente de iconos

## Decisiones
- Sin inicio de sesión con Apple: necesita la cuenta de desarrollador de pago. Solo email y Google.
- PWA en lugar de apps en las tiendas: instalable en Android e iOS sin pasar por ellas.
- Stack gratuito: planes gratis de Supabase y Vercel y mapas sin API key. El plan Hobby de Vercel es para uso no comercial; si se cobra, pasar a Pro o a Cloudflare Pages.
- Funciones de `api/` en JavaScript y `@vercel/og` fijado en 0.11.1: la versión con HarfBuzz requería `fs` y no funciona en Edge.
- El aviso de versión nueva no recarga solo, para no perder un viaje a medio editar.
- Solo el creador marca un viaje compartido como realizado; lo impone un disparador en la base de datos.

## Problemas conocidos
- `.env.local` no tiene `VITE_VAPID_PUBLIC_KEY` ni `VITE_OAUTH_PROVIDERS`: en local no se pueden probar los avisos ni el botón de Google.
- 60 avisos de `oxlint`, en su mayoría reglas de React (`Date` durante el render, `setState` en efectos). No bloquean.
- Sin tests de frontend: la lógica de `outbox.ts`, `days.ts` y los saldos de gastos no tiene pruebas automáticas.
- `version` sigue en `0.0.0` en `package.json`.
