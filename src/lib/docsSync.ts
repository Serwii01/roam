// Copia en el móvil los documentos de los viajes en marcha o que empiezan pronto, y quita los que ya no hacen falta.
import { useEffect } from 'react'
import { onlineManager } from '@tanstack/react-query'
import { api } from './api'
import type { TripDocument, TripWithStops } from './db'
import { addDays } from './days'
import { useTrips } from './hooks'
import { getSavedDoc, removeSavedDoc, saveDoc, savedDocIds } from './offlineDocs'
import { queryClient } from './queryClient'
import { localDate } from './today'

/** Días antes de la salida en los que los documentos empiezan a guardarse. */
export const DOCS_AHEAD_DAYS = 30

/** ¿Hay que tener sus documentos en el móvil? Desde 30 días antes de la ida hasta el día de la vuelta. */
export function wantsOfflineDocs(t: Pick<TripWithStops, 'start_date' | 'end_date'>, day: string) {
  const last = t.end_date ?? t.start_date
  return !!t.start_date && !!last && t.start_date <= addDays(day, DOCS_AHEAD_DAYS) && last >= day
}

async function download(doc: TripDocument) {
  const res = await fetch(await api.documentUrl(doc))
  if (!res.ok) throw new Error(`No se pudo descargar ${doc.name}`)
  return res.blob()
}

/** El archivo de un documento: del móvil si está guardado y, si no, de la red. */
export async function fetchDoc(doc: TripDocument): Promise<Blob> {
  return (await getSavedDoc(doc.id)) ?? download(doc)
}

let running = false

export async function syncOfflineDocs(trips: TripWithStops[], day = localDate()) {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  if (running || !navigator.onLine || saveData) return
  running = true
  try {
    const wanted = new Set<string>()
    for (const t of trips.filter((x) => wantsOfflineDocs(x, day))) {
      const docs = await queryClient.fetchQuery({ queryKey: ['documents', t.id], queryFn: () => api.listDocuments(t.id), staleTime: 60_000 })
      for (const d of docs) {
        wanted.add(d.id)
        // Uno que falle no impide guardar los demás: se reintenta la próxima vez.
        if (!savedDocIds().has(d.id)) await download(d).then((blob) => saveDoc(d.id, blob)).catch(() => {})
      }
    }
    // Solo se llega aquí si se han podido leer todas las listas: sin red no se borra nada.
    for (const id of savedDocIds()) if (!wanted.has(id)) await removeSavedDoc(id)
  } catch {
    // Sin red a mitad de camino: lo guardado se queda como está.
  } finally {
    running = false
  }
}

/** Mantiene al día la copia del móvil al abrir la app y al recuperar la conexión. */
export function useOfflineDocsSync() {
  const trips = useTrips()
  useEffect(() => {
    if (!trips.data) return
    const run = () => void syncOfflineDocs(trips.data ?? [])
    run()
    return onlineManager.subscribe((online) => {
      if (online) run()
    })
  }, [trips.data])
}
