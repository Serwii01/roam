// Cambios sin conexión. Las escrituras de un viaje (paradas, sitios, gastos, equipaje, fotos, países…) se intentan
// enviar a Supabase; si no hay red, se guardan en una cola en IndexedDB, se aplican al momento en la caché de la app
// (lo que ves ya está cambiado) y se envían en orden en cuanto vuelve la conexión.
// Los registros nuevos llevan su id desde el navegador: así un cambio posterior (editar la parada recién creada)
// apunta al mismo registro, y reenviar una alta que ya llegó no la duplica.
import { useSyncExternalStore } from 'react'
import { createStore, get, set } from 'idb-keyval'
import type { Expense, LegDetail, Lodging, PackingItem, Photo, Sight, Stop, Trip, TripBudget, TripWithStops, Wish } from './db'
import type { Api, Visited } from './api/types'
import { uid } from './id'
import { OFFLINE_MESSAGE } from './supabase'
import { queryClient as qc } from './queryClient'

type Method = keyof Api
interface Op {
  id: string
  userId: string
  method: Method
  args: unknown[]
  /** Qué era, para avisar si al final no se pudo guardar. */
  label: string
  at: number
  /** Ruta provisional ('local:…') de una foto aún sin subir. */
  localPhoto?: string
}

export interface OutboxState {
  online: boolean
  pending: number
  syncing: boolean
  /** Cambios que el servidor rechazó al enviarlos (se avisa una vez y se descartan). */
  failed: string[]
}

const store = typeof indexedDB === 'undefined' ? undefined : createStore('roam-outbox', 'ops')
let ops: Op[] = []
let userId: string | null = null
let raw: Api
let state: OutboxState = { online: typeof navigator === 'undefined' || navigator.onLine, pending: 0, syncing: false, failed: [] }
const listeners = new Set<() => void>()
const emit = (patch: Partial<OutboxState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const mine = () => ops.filter((o) => o.userId === userId)
const save = async () => {
  emit({ pending: mine().length })
  if (store) await set('ops', ops, store)
}

/** Fotos aún sin subir: se enseñan desde el propio móvil. */
const localUrls = new Map<string, string>()

const loaded = (async () => {
  if (!store) return
  try {
    ops = (await get<Op[]>('ops', store)) ?? []
  } catch {
    ops = []
  }
  for (const o of ops) if (o.localPhoto && o.args[1] instanceof Blob) localUrls.set(o.localPhoto, URL.createObjectURL(o.args[1]))
})()

/** Error de red (sin cobertura, modo avión, servidor inalcanzable), no un error de los datos. */
export function isNetworkError(e: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /sin conexión|failed to fetch|load failed|networkerror|network request failed|fetch failed|AuthRetryableFetchError/i.test(msg)
}


// ── Caché de React Query ──

function mapTrips(fn: (t: TripWithStops) => TripWithStops | null) {
  qc.setQueriesData<TripWithStops[]>({ queryKey: ['trips'] }, (list) => list?.map(fn).filter((t): t is TripWithStops => !!t))
  for (const [key, t] of qc.getQueriesData<TripWithStops | null>({ queryKey: ['trip'] })) if (t) qc.setQueryData(key, fn(t))
}
function cachedTrips(): TripWithStops[] {
  const all = [...qc.getQueriesData<TripWithStops | null>({ queryKey: ['trip'] }).map(([, t]) => t), ...qc.getQueriesData<TripWithStops[]>({ queryKey: ['trips'] }).flatMap(([, l]) => l ?? [])]
  return all.filter((t): t is TripWithStops => !!t)
}
const tripById = (id: string) => cachedTrips().find((t) => t.id === id)
const tripOfStop = (stopId: string) => cachedTrips().find((t) => t.stops.some((s) => s.id === stopId))
const stopById = (id: string) => cachedTrips().flatMap((t) => t.stops).find((s) => s.id === id)
const sightById = (id: string) => cachedTrips().flatMap((t) => t.sights).find((s) => s.id === id)
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

/** Listas por viaje: ['expenses', tripId], ['packing', tripId], ['lodgings', tripId]… */
function mapList<T>(root: string, fn: (list: T[]) => T[], tripId?: string) {
  qc.setQueriesData<T[]>({ queryKey: tripId ? [root, tripId] : [root] }, (l) => (l ? fn(l) : l))
}
const findIn = <T extends { id: string }>(root: string, id: string) =>
  qc
    .getQueriesData<T[]>({ queryKey: [root] })
    .flatMap(([, l]) => l ?? [])
    .find((x) => x.id === id)
const upsertById = <T extends { id: string }>(item: T) => (l: T[]) => (l.some((x) => x.id === item.id) ? l.map((x) => (x.id === item.id ? item : x)) : [...l, item])
const withoutId = (id: string) => <T extends { id: string }>(l: T[]) => l.filter((x) => x.id !== id)

function mapVisited(fn: (v: Visited) => Visited) {
  qc.setQueriesData<Visited>({ queryKey: ['visited', userId] }, (v) => (v ? fn(v) : v))
}
const toggleManual = (list: Visited['countries'], code: string, on: boolean) =>
  on ? (list.some((x) => x.code === code) ? list : [...list, { code, source: 'manual' as const }]) : list.filter((x) => !(x.code === code && x.source === 'manual'))

// ── Escrituras ──

let chain: Promise<unknown> = Promise.resolve()
/** Las escrituras se deciden y encolan de una en una, para que la cola respete el orden en que se hicieron. */
const serial = <R>(fn: () => Promise<R>): Promise<R> => {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

async function write<R>(method: Method, args: unknown[], label: string, optimistic: () => R, extra?: Partial<Op>): Promise<R> {
  await loaded
  return serial(async () => {
    // Con cambios aún en cola, lo nuevo va detrás: si no, podría llegar antes que la parada que edita.
    if (navigator.onLine && !mine().length) {
      try {
        return await (raw[method] as (...a: unknown[]) => Promise<R>)(...args)
      } catch (e) {
        if (!isNetworkError(e)) throw e
      }
    }
    if (!userId) throw new Error(OFFLINE_MESSAGE)
    const result = optimistic()
    ops.push({ id: uid(), userId, method, args, label, at: Date.now(), ...extra })
    await save()
    void sync()
    return result
  })
}

const now = () => new Date().toISOString()

/** Envuelve la API de Supabase: mismas operaciones, pero las escrituras de viaje funcionan sin conexión. */
export function withOffline(api: Api): Api {
  raw = api
  return {
    ...api,

    // Lecturas que el editor usa al añadir una parada: sin red se sigue adelante sin región ni aeropuerto.
    async getSubdivisions(codes) {
      try {
        return await api.getSubdivisions(codes)
      } catch (e) {
        if (isNetworkError(e)) return []
        throw e
      }
    },
    async getAirports(codes) {
      try {
        return await api.getAirports(codes)
      } catch (e) {
        if (isNetworkError(e)) return []
        throw e
      }
    },

    createTrip(fields) {
      const f = { ...fields, id: (fields as { id?: string }).id ?? uid() }
      return write('createTrip', [f], `Crear el viaje «${f.title}»`, () => {
        const trip: Trip = {
          user_id: userId!,
          description: null,
          start_date: null,
          end_date: null,
          cover_url: null,
          status: 'done',
          style: null,
          solo: false,
          companions: [],
          soundtrack_url: null,
          share_token: null,
          created_at: now(),
          updated_at: now(),
          ...f,
        }
        qc.setQueriesData<TripWithStops[]>({ queryKey: ['trips', userId] }, (l) => [{ ...trip, stops: [], photos: [], sights: [], member_count: 0 }, ...(l ?? [])])
        return trip
      })
    },
    updateTrip(id, patch) {
      return write('updateTrip', [id, patch], 'Guardar los datos del viaje', () => {
        mapTrips((t) => (t.id === id ? { ...t, ...patch, updated_at: now() } : t))
        const t = tripById(id)
        return { ...(t as Trip), ...patch }
      })
    },
    deleteTrip(id) {
      return write('deleteTrip', [id], 'Borrar un viaje', () => {
        mapTrips((t) => (t.id === id ? null : t))
      })
    },

    addStop(trip, stop) {
      const s = { ...stop, id: (stop as { id?: string }).id ?? uid() }
      return write('addStop', [trip, s], `Añadir la parada ${stop.name}`, () => {
        const full: Stop = {
          trip_id: trip.id,
          user_id: userId,
          position: (trip.stops.at(-1)?.position ?? -1) + 1,
          region_code: null,
          province_code: null,
          arrived_on: null,
          notes: null,
          rating: null,
          tags: [],
          song_url: null,
          transport_in: null,
          from_airport: null,
          to_airport: null,
          flight_no: null,
          ...s,
        }
        mapTrips((t) => (t.id === trip.id ? { ...t, stops: [...t.stops.filter((x) => x.id !== full.id), full].sort(byPosition) } : t))
        return full
      })
    },
    updateStop(id, patch) {
      return write('updateStop', [id, patch], 'Guardar una parada', () => {
        mapTrips((t) => (t.stops.some((s) => s.id === id) ? { ...t, stops: t.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)).sort(byPosition) } : t))
        return { ...(stopById(id) as Stop), ...patch }
      })
    },
    deleteStop(id) {
      return write('deleteStop', [id], 'Quitar una parada', () => {
        mapTrips((t) => (t.stops.some((s) => s.id === id) ? { ...t, stops: t.stops.filter((s) => s.id !== id), sights: t.sights.filter((x) => x.stop_id !== id) } : t))
      })
    },
    reorderStops(stops) {
      return write('reorderStops', [stops], 'Ordenar las paradas', () => {
        const pos = new Map(stops.map((s, i) => [s.id, i]))
        mapTrips((t) => (t.stops.some((s) => pos.has(s.id)) ? { ...t, stops: t.stops.map((s) => ({ ...s, position: pos.get(s.id) ?? s.position })).sort(byPosition) } : t))
      })
    },

    addSight(stopId, sight) {
      const s = { ...sight, id: (sight as { id?: string }).id ?? uid() }
      return write('addSight', [stopId, s], `Añadir ${sight.name}`, () => {
        const trip = tripOfStop(stopId)
        const full: Sight = { trip_id: trip?.id ?? '', stop_id: stopId, user_id: userId, lat: null, lon: null, wiki_url: null, done: false, position: 0, day: null, time: null, notes: null, created_at: now(), ...s }
        mapTrips((t) => (t.id === full.trip_id ? { ...t, sights: [...t.sights, full] } : t))
        return full
      })
    },
    updateSight(id, patch) {
      return write('updateSight', [id, patch], 'Guardar un sitio', () => {
        mapTrips((t) => (t.sights.some((s) => s.id === id) ? { ...t, sights: t.sights.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : t))
        return { ...(sightById(id) as Sight), ...patch }
      })
    },
    deleteSight(id) {
      return write('deleteSight', [id], 'Quitar un sitio', () => {
        mapTrips((t) => (t.sights.some((s) => s.id === id) ? { ...t, sights: t.sights.filter((s) => s.id !== id) } : t))
      })
    },

    addPackingItems(tripId, items) {
      const withIds = items.map((i) => ({ ...i, id: (i as { id?: string }).id ?? uid() }))
      return write('addPackingItems', [tripId, withIds], 'Añadir cosas al equipaje', () => {
        mapList<PackingItem>(
          'packing',
          (l) => [
            ...l,
            ...withIds
              .filter((i) => !l.some((x) => x.label === i.label))
              .map((i, n) => ({ trip_id: tripId, packed: false, position: l.length + n, user_id: userId, created_at: now(), ...i })),
          ],
          tripId,
        )
      })
    },
    updatePackingItem(id, patch) {
      return write('updatePackingItem', [id, patch], 'Guardar el equipaje', () => {
        mapList<PackingItem>('packing', (l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
        return { ...(findIn<PackingItem>('packing', id) as PackingItem), ...patch }
      })
    },
    deletePackingItem(id) {
      return write('deletePackingItem', [id], 'Quitar algo del equipaje', () => mapList<PackingItem>('packing', withoutId(id)))
    },

    addLodging(tripId, lodging) {
      const l = { ...lodging, id: (lodging as { id?: string }).id ?? uid() }
      return write('addLodging', [tripId, l], `Añadir el alojamiento ${lodging.name}`, () => {
        const full: Lodging = {
          trip_id: tripId,
          stop_id: null,
          address: null,
          check_in: null,
          check_in_time: null,
          check_out: null,
          check_out_time: null,
          booking_ref: null,
          url: null,
          notes: null,
          user_id: userId,
          created_at: now(),
          ...l,
        }
        mapList<Lodging>('lodgings', upsertById(full), tripId)
        return full
      })
    },
    updateLodging(id, patch) {
      return write('updateLodging', [id, patch], 'Guardar un alojamiento', () => {
        mapList<Lodging>('lodgings', (l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
        return { ...(findIn<Lodging>('lodgings', id) as Lodging), ...patch }
      })
    },
    deleteLodging(id) {
      return write('deleteLodging', [id], 'Quitar un alojamiento', () => mapList<Lodging>('lodgings', withoutId(id)))
    },
    saveLegDetail(tripId, stopId, patch) {
      return write('saveLegDetail', [tripId, stopId, patch], 'Guardar los datos de un trayecto', () => {
        let full: LegDetail = { stop_id: stopId, trip_id: tripId, depart_on: null, depart_time: null, arrive_time: null, carrier: null, booking_ref: null, notes: null, updated_at: now() }
        mapList<LegDetail>(
          'legs',
          (l) => {
            full = { ...full, ...l.find((x) => x.stop_id === stopId), ...patch, updated_at: now() }
            return [...l.filter((x) => x.stop_id !== stopId), full]
          },
          tripId,
        )
        return full
      })
    },

    setBudget(tripId, budget) {
      return write('setBudget', [tripId, budget], 'Guardar el presupuesto', () => {
        const full: TripBudget = { trip_id: tripId, ...budget, updated_at: now() }
        qc.setQueryData(['budget', tripId], full)
        return full
      })
    },
    addExpense(tripId, expense) {
      const e = { ...expense, id: (expense as { id?: string }).id ?? uid() }
      return write('addExpense', [tripId, e], `Añadir un gasto${expense.description ? ` (${expense.description})` : ''}`, () => {
        const full: Expense = {
          trip_id: tripId,
          stop_id: null,
          user_id: userId,
          paid_by: null,
          description: null,
          rate: 1,
          spent_on: null,
          payer_key: null,
          split_mode: 'equal',
          split: null,
          created_at: now(),
          ...e,
        }
        mapList<Expense>('expenses', upsertById(full), tripId)
        return full
      })
    },
    updateExpense(id, patch) {
      return write('updateExpense', [id, patch], 'Guardar un gasto', () => {
        mapList<Expense>('expenses', (l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
        return { ...(findIn<Expense>('expenses', id) as Expense), ...patch }
      })
    },
    deleteExpense(id) {
      return write('deleteExpense', [id], 'Borrar un gasto', () => mapList<Expense>('expenses', withoutId(id)))
    },

    uploadPhoto(tripId, file, stopId) {
      const id = uid()
      const path = `local:${id}`
      return write(
        'uploadPhoto',
        [tripId, file, stopId ?? null],
        `Subir la foto ${file.name}`,
        () => {
          localUrls.set(path, URL.createObjectURL(file))
          const photo: Photo = { id, user_id: userId!, trip_id: tripId, stop_id: stopId ?? null, path, caption: null, created_at: now() }
          mapTrips((t) => (t.id === tripId ? { ...t, photos: [...t.photos, photo] } : t))
          return photo
        },
        { localPhoto: path },
      )
    },
    async deletePhoto(photo) {
      // Una foto que aún no se ha subido se quita de la cola y ya está.
      if (photo.path.startsWith('local:')) {
        await loaded
        ops = ops.filter((o) => o.localPhoto !== photo.path)
        await save()
        const url = localUrls.get(photo.path)
        if (url) URL.revokeObjectURL(url)
        localUrls.delete(photo.path)
        mapTrips((t) => (t.id === photo.trip_id ? { ...t, photos: t.photos.filter((p) => p.id !== photo.id) } : t))
        return
      }
      return write('deletePhoto', [photo], 'Borrar una foto', () => {
        mapTrips((t) => (t.id === photo.trip_id ? { ...t, photos: t.photos.filter((p) => p.id !== photo.id) } : t))
      })
    },
    photoUrl(path) {
      return localUrls.get(path) ?? (path.startsWith('local:') ? '' : api.photoUrl(path))
    },
    photoThumbUrl(path) {
      return localUrls.get(path) ?? (path.startsWith('local:') ? '' : api.photoThumbUrl(path))
    },

    setCountryMarked(code, marked) {
      return write('setCountryMarked', [code, marked], marked ? `Marcar ${code} como visitado` : `Desmarcar ${code}`, () =>
        mapVisited((v) => ({ ...v, countries: toggleManual(v.countries, code, marked) })),
      )
    },
    setSubdivisionMarked(code, marked) {
      return write('setSubdivisionMarked', [code, marked], marked ? `Marcar ${code} como visitada` : `Desmarcar ${code}`, () =>
        mapVisited((v) => ({ ...v, subdivisions: toggleManual(v.subdivisions, code, marked) })),
      )
    },
    setWish(code, wished, note) {
      return write('setWish', [code, wished, note], wished ? `Añadir ${code} a deseos` : `Quitar ${code} de deseos`, () => {
        qc.setQueryData<Wish[]>(['wishlist'], (l) =>
          wished
            ? [...(l ?? []).filter((w) => w.country_code !== code), { user_id: userId!, country_code: code, note: note ?? null, created_at: now() }]
            : (l ?? []).filter((w) => w.country_code !== code),
        )
      })
    },
  }
}

// ── Envío de la cola ──

let syncing: Promise<void> | null = null

/** Envía en orden los cambios pendientes del usuario. Si se corta la red, para y lo intenta más tarde. */
export function sync(): Promise<void> {
  syncing ??= (async () => {
    await loaded
    if (!userId || !navigator.onLine || !mine().length) return
    emit({ syncing: true })
    let sent = 0
    const failed: string[] = []
    try {
      for (const op of mine()) {
        try {
          await (raw[op.method] as (...a: unknown[]) => Promise<unknown>)(...op.args)
        } catch (e) {
          if (isNetworkError(e)) break
          // Ya estaba guardado (se perdió la respuesta la otra vez): no es un fallo.
          if (!/duplicate key/i.test(String(e))) failed.push(`${op.label}: ${e instanceof Error ? e.message : String(e)}`)
        }
        ops = ops.filter((o) => o.id !== op.id)
        if (op.localPhoto) {
          const url = localUrls.get(op.localPhoto)
          if (url) URL.revokeObjectURL(url)
          localUrls.delete(op.localPhoto)
        }
        sent++
        await save()
      }
    } finally {
      emit({ syncing: false, failed: failed.length ? [...state.failed, ...failed] : state.failed })
    }
    // Se recarga lo del servidor (ids reales de las fotos, posiciones, lugares visitados calculados…).
    if (sent) await qc.invalidateQueries()
  })().finally(() => {
    syncing = null
  })
  return syncing
}

/** Lo llama AuthProvider: la cola es de cada usuario y solo se envía con su sesión. */
export function setOutboxUser(id: string | null) {
  userId = id
  void loaded.then(() => {
    emit({ pending: mine().length })
    void sync()
  })
}

export const dismissFailed = () => emit({ failed: [] })

export function useOutbox() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    emit({ online: true })
    // Primero lo pendiente y después se refresca lo que está en pantalla (refetchOnReconnect está desactivado).
    void sync().then(() => qc.invalidateQueries())
  })
  window.addEventListener('offline', () => emit({ online: false }))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void sync())
  // Por si el móvil dice que hay red pero no llega nada (cobertura mala): se reintenta cada medio minuto.
  setInterval(() => state.pending && void sync(), 30_000)
}
