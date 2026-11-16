// Aviso de «hay enlaces de fotos nuevos». Las fotos están en un bucket privado y se ven con enlaces firmados que
// caducan (src/lib/api/supabase.ts). Al abrir la app, los viajes salen de la caché del móvil con los enlaces de la
// última vez; cuando se vuelven a firmar, los datos del viaje no cambian y React no repintaría las fotos.
// Quien enseña fotos usa usePhotoLinks() para repintarse cuando cambian los enlaces.
import { useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()

/** Lo llama la capa de datos al firmar enlaces nuevos. */
export function photoLinksChanged() {
  version++
  listeners.forEach((l) => l())
}

/** Número que cambia cada vez que hay enlaces nuevos (para usarlo como dependencia de useMemo). */
export function usePhotoLinks() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}
