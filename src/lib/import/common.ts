// Piezas comunes de las importaciones (fotos, Google Maps): nombrar puntos, agruparlos en paradas y
// crear el viaje con sus paradas, regiones, transporte y aeropuertos.
import { api, type TripFields } from '../api'
import { nearestAirportLocal } from '../airportIndex'
import { countryCodeFromName } from '../countries'
import type { Stop, TransportMode, TripWithStops } from '../db'
import { haversine } from '../geo'
import { lookupPlaceCodes } from '../geocode'
import { nearestKnownPlace } from '../placesIndex'

export interface DraftStop {
  name: string
  lat: number
  lon: number
  countryCode?: string
  arrived_on: string | null
  transport?: TransportMode | null
  from_airport?: string | null
  to_airport?: string | null
  flight_no?: string | null
  /** Fotos de esa parada (importación desde fotos). */
  photos?: File[]
}

/** Fecha local AAAA-MM-DD de un instante. */
export const localDay = (t: number | Date) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Nombre rápido y sin conexión (catálogo propio, en español); null si no hay una población conocida cerca. */
export async function quickName(lat: number, lon: number): Promise<{ name: string; countryCode: string } | null> {
  const p = await nearestKnownPlace(lat, lon, 35).catch(() => undefined)
  return p ? { name: p.es, countryCode: p.cc } : null
}

/** Nombre definitivo: el catálogo propio o, si no, OpenStreetMap (Nominatim, 1 consulta/s con caché). */
export async function nameForPoint(lat: number, lon: number): Promise<{ name: string; countryCode?: string }> {
  const quick = await quickName(lat, lon)
  if (quick) return quick
  const codes = await lookupPlaceCodes(lat, lon).catch(() => ({}) as Awaited<ReturnType<typeof lookupPlaceCodes>>)
  return { name: codes.name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`, countryCode: codes.countryCode }
}

/**
 * Agrupa puntos ordenados por tiempo en paradas: se empieza una nueva al alejarse más de `km` del centro
 * de la actual. Volver luego a una ciudad ya visitada es otra parada (la ruta se lee en orden).
 */
export function clusterByPlace<T extends { lat: number; lon: number; time: number }>(points: T[], km = 30) {
  const out: { lat: number; lon: number; start: number; end: number; items: T[] }[] = []
  for (const p of [...points].sort((a, b) => a.time - b.time)) {
    const cur = out.at(-1)
    if (cur && haversine([cur.lon, cur.lat], [p.lon, p.lat]) <= km) {
      const n = cur.items.push(p)
      cur.lat += (p.lat - cur.lat) / n
      cur.lon += (p.lon - cur.lon) / n
      cur.end = Math.max(cur.end, p.time)
    } else out.push({ lat: p.lat, lon: p.lon, start: p.time, end: p.time, items: [p] })
  }
  return out
}

/** Transporte probable por distancia, como al añadir una parada a mano. */
export const guessTransport = (km: number): TransportMode => (km > 600 ? 'plane' : km < 5 ? 'walk' : 'car')

/**
 * Crea el viaje y sus paradas en orden. Para cada parada consulta su región (Nominatim) y, en los vuelos,
 * propone los aeropuertos más cercanos. `onProgress` recibe cuántas paradas lleva.
 */
export async function createTripWithStops(fields: TripFields & { title: string }, stops: DraftStop[], onProgress?: (done: number, total: number) => void): Promise<TripWithStops> {
  const created = await api.createTrip(fields)
  return appendStops({ ...created, stops: [], photos: [], sights: [] }, stops, onProgress)
}

/** Añade paradas al final de un viaje (con región, transporte y aeropuertos) y devuelve el viaje con ellas. */
export async function appendStops(base: TripWithStops, stops: DraftStop[], onProgress?: (done: number, total: number) => void): Promise<TripWithStops> {
  const trip: TripWithStops = { ...base, stops: [...base.stops] }
  for (const [i, s] of stops.entries()) {
    const codes = await lookupPlaceCodes(s.lat, s.lon).catch(() => ({}) as Awaited<ReturnType<typeof lookupPlaceCodes>>)
    const wanted = [codes.regionCode, codes.provinceCode].filter((c): c is string => !!c)
    const known = new Set((await api.getSubdivisions(wanted)).map((x) => x.code))
    const prev = trip.stops.at(-1)
    let transport = s.transport ?? null
    let from = s.from_airport ?? null
    let to = s.to_airport ?? null
    if (prev) {
      transport ??= guessTransport(haversine([prev.lon, prev.lat], [s.lon, s.lat]))
      if (transport === 'plane' && (!from || !to)) {
        ;[from, to] = await Promise.all([from ?? nearestAirportLocal(prev.lat, prev.lon), to ?? nearestAirportLocal(s.lat, s.lon)]).then((r) => r.map((x) => x ?? null))
      }
    } else transport = null
    const countryCode = codes.countryCode ?? s.countryCode ?? countryCodeFromName(s.name)
    if (!countryCode) continue
    const stop: Stop = await api.addStop(trip, {
      name: s.name,
      country_code: countryCode,
      region_code: codes.regionCode && known.has(codes.regionCode) ? codes.regionCode : null,
      province_code: codes.provinceCode && known.has(codes.provinceCode) ? codes.provinceCode : null,
      lat: s.lat,
      lon: s.lon,
      arrived_on: s.arrived_on,
      transport_in: prev ? transport : null,
      from_airport: prev && transport === 'plane' ? from : null,
      to_airport: prev && transport === 'plane' ? to : null,
      flight_no: prev && transport === 'plane' ? (s.flight_no ?? null) : null,
    })
    trip.stops.push(stop)
    onProgress?.(i + 1, stops.length)
  }
  return trip
}
