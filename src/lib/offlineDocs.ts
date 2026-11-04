// Documentos guardados en el móvil. Las tarjetas de embarque y las reservas hacen falta justo donde no hay datos:
// los archivos de los viajes en marcha o a punto de empezar se copian en IndexedDB y se abren desde ahí.
// Este módulo solo guarda y lee; la descarga está en `docsSync.ts`.
import { useSyncExternalStore } from 'react'
import { clear, createStore, del, get, keys, set } from 'idb-keyval'

const store = typeof indexedDB === 'undefined' ? undefined : createStore('roam-docs', 'files')

let saved = new Set<string>()
const listeners = new Set<() => void>()
const publish = (next: Set<string>) => {
  saved = next
  listeners.forEach((l) => l())
}

export async function refreshSavedDocs() {
  if (store) publish(new Set((await keys(store)).map(String)))
}
void refreshSavedDocs().catch(() => {})

export const getSavedDoc = (id: string) => (store ? get<Blob>(id, store) : Promise.resolve(undefined))

export async function saveDoc(id: string, blob: Blob) {
  if (!store) return
  await set(id, blob, store)
  publish(new Set(saved).add(id))
}

export async function removeSavedDoc(id: string) {
  if (!store) return
  await del(id, store)
  const next = new Set(saved)
  next.delete(id)
  publish(next)
}

export const savedDocIds = () => saved

/** Borra todos los archivos del móvil (al cerrar sesión o al entrar con otra cuenta). */
export async function clearSavedDocs() {
  if (!store) return
  await clear(store)
  publish(new Set())
}

/** Ids de los documentos que ya están en este móvil. */
export const useSavedDocs = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => saved,
  )
