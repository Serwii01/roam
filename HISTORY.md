# Historial de sesiones

> Sesiones antiguas de STATUS.md, de más reciente a más antigua. No hace falta leerlo al retomar.

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
