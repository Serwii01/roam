import { onlineManager, QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { createStore, del, get, set } from 'idb-keyval'

const DAY = 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime largo: lo que se guarda en el móvil sale de esta caché, y lo que se borra de ella se pierde al cerrar la app.
    // Al volver la conexión no se recarga todo a la vez: primero se envían los cambios pendientes (outbox.ts) y luego se refresca.
    queries: { staleTime: 30_000, gcTime: 7 * DAY, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1 },
    // Sin conexión las escrituras se ejecutan igualmente: outbox.ts las guarda en cola en vez de dejarlas en pausa.
    mutations: { networkMode: 'always' },
  },
})

// React Query da por hecho que hay red al arrancar: si la app se abre en modo avión, que lo sepa desde el principio.
if (typeof navigator !== 'undefined') onlineManager.setOnline(navigator.onLine)

// Tras guardar, las pantallas esperan a recargar los datos (`await invalidateQueries`). Sin conexión esa recarga se
// queda en pausa hasta que vuelve la red y el editor se quedaría «guardando»: sin red no se recarga nada (los cambios
// ya están aplicados en la caché por outbox.ts) y al volver la conexión se refresca todo de una vez.
const invalidate = queryClient.invalidateQueries.bind(queryClient)
queryClient.invalidateQueries = ((...args: Parameters<typeof invalidate>) =>
  onlineManager.isOnline() ? invalidate(...args) : Promise.resolve()) as typeof queryClient.invalidateQueries

// Copia de la caché en IndexedDB: al abrir la app, tus viajes, el pasaporte y los países salen al momento, también sin red.
const store = typeof indexedDB === 'undefined' ? undefined : createStore('roam-cache', 'queries')
export const persister = createAsyncStoragePersister({
  storage: store ? { getItem: (k) => get<string>(k, store), setItem: (k, v) => set(k, v, store), removeItem: (k) => del(k, store) } : undefined,
  key: 'roam-queries',
  throttleTime: 2000,
})

/** Búsquedas y vistas de otros que no merece la pena guardar en el móvil. */
const NOT_PERSISTED = new Set(['search-people', 'invite', 'shared', 'public-profile', 'public-trip'])

export const persistOptions = {
  persister,
  maxAge: 30 * DAY,
  // Sube si cambia la forma de los datos guardados: se descarta la copia antigua en vez de leerla mal.
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === 'success' && !NOT_PERSISTED.has(String(q.queryKey[0])),
  },
}

/** Borra los datos guardados en el móvil (al cerrar sesión o al entrar con otra cuenta). */
export async function clearLocalData() {
  queryClient.clear()
  await persister.removeClient()
  // Fotos guardadas por el service worker para verlas sin conexión.
  if (typeof caches !== 'undefined') await caches.delete('roam-photos').catch(() => {})
  try {
    localStorage.removeItem('roam.signed')
  } catch {
    /* nada que borrar */
  }
}
