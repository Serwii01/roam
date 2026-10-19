import type { Airport, ContinentCode, Country, Stop, TransportMode, TripWithStops } from './db'
import { INHABITED_CONTINENTS } from './db'
import { haversine, type LngLat } from './geo'
import type { Visited } from './api'

export type AirportMap = Map<string, Airport>

export const isDone = (t: TripWithStops) => t.status === 'done'

/** Extremos efectivos del tramo que llega a `stops[i]`: aeropuertos si fue en avión y se conocen. */
export function legEndpoints(stops: Stop[], i: number, airports: AirportMap): [LngLat, LngLat] {
  const a = stops[i - 1]
  const b = stops[i]
  const from = b.transport_in === 'plane' && b.from_airport ? airports.get(b.from_airport) : undefined
  const to = b.transport_in === 'plane' && b.to_airport ? airports.get(b.to_airport) : undefined
  return [from ? [from.lon, from.lat] : [a.lon, a.lat], to ? [to.lon, to.lat] : [b.lon, b.lat]]
}

/** Para dibujar un tramo: de ciudad a ciudad (los aeropuertos pueden estar lejos, como Beauvais de París). */
export const legLine = (stops: Stop[], i: number): [LngLat, LngLat] => [
  [stops[i - 1].lon, stops[i - 1].lat],
  [stops[i].lon, stops[i].lat],
]

export const legKm = (stops: Stop[], i: number, airports: AirportMap) => haversine(...legEndpoints(stops, i, airports))

export function tripKm(t: TripWithStops, airports: AirportMap): number {
  let km = 0
  for (let i = 1; i < t.stops.length; i++) km += legKm(t.stops, i, airports)
  return km
}

export function tripDays(t: TripWithStops): number | null {
  if (!t.start_date || !t.end_date) return null
  return Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 86_400_000) + 1
}

/** Países del viaje en orden de llegada (sin repetir). */
export const tripCountries = (t: TripWithStops) => [...new Set(t.stops.map((s) => s.country_code))]

/** País "de destino" para mostrar en tarjetas: el más frecuente que no sea el de partida. */
export function tripMainCountry(t: TripWithStops): string | undefined {
  const origin = t.stops[0]?.country_code
  const counts = new Map<string, number>()
  for (const s of t.stops) if (s.country_code !== origin) counts.set(s.country_code, (counts.get(s.country_code) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? origin
}

export const tripYear = (t: TripWithStops) => (t.start_date ? Number(t.start_date.slice(0, 4)) : undefined)

export function tripModes(t: TripWithStops): TransportMode[] {
  return [...new Set(t.stops.map((s) => s.transport_in).filter((m): m is TransportMode => !!m))]
}

export interface Level {
  n: number
  name: string
  min: number
}
export const LEVELS: Level[] = [
  { n: 1, name: 'Turista', min: 0 },
  { n: 2, name: 'Viajero', min: 5 },
  { n: 3, name: 'Vagabundo sénior', min: 12 },
  { n: 4, name: 'Nómada explorador', min: 20 },
  { n: 5, name: 'Trotamundos', min: 30 },
  { n: 6, name: 'Ciudadano del mundo', min: 50 },
  { n: 7, name: 'Leyenda', min: 100 },
]

export function levelFor(countries: number) {
  const idx = LEVELS.findLastIndex((l) => countries >= l.min)
  const current = LEVELS[idx]
  const next = LEVELS[idx + 1]
  const progress = next ? (countries - current.min) / (next.min - current.min) : 1
  return { current, next, progress, previous: LEVELS[idx - 1] }
}

export interface Stats {
  countries: string[]
  continents: ContinentCode[]
  subdivisions: string[]
  cities: number
  trips: number
  planned: number
  totalKm: number
  flights: number
  airports: { airport: Airport; visits: number }[]
  transport: { mode: TransportMode; legs: number; km: number }[]
  lastStop?: { stop: Stop; trip: TripWithStops }
  years: { year: number; trips: number }[]
}

export function computeStats(trips: TripWithStops[], visited: Visited | undefined, countryRef: Map<string, Country>, airports: AirportMap): Stats {
  const done = trips.filter(isDone)
  const countries = visited?.countries.map((c) => c.code) ?? [...new Set(done.flatMap(tripCountries))]
  const cities = new Set<string>()
  const airportVisits = new Map<string, number>()
  const transport = new Map<TransportMode, { legs: number; km: number }>()
  let totalKm = 0
  let flights = 0
  let lastStop: Stats['lastStop']
  const years = new Map<number, number>()

  for (const t of done) {
    const y = tripYear(t)
    if (y) years.set(y, (years.get(y) ?? 0) + 1)
    t.stops.forEach((s, i) => {
      cities.add(`${s.name.toLowerCase()}|${s.country_code}`)
      // El último pin es el último destino real: no cuenta la vuelta al punto de partida.
      const isReturn = i > 0 && Math.abs(s.lat - t.stops[0].lat) < 0.05 && Math.abs(s.lon - t.stops[0].lon) < 0.05
      if (i > 0 && !isReturn && s.arrived_on && (!lastStop || s.arrived_on > (lastStop.stop.arrived_on ?? ''))) lastStop = { stop: s, trip: t }
      if (i === 0 || !s.transport_in) return
      const km = legKm(t.stops, i, airports)
      totalKm += km
      const cur = transport.get(s.transport_in) ?? { legs: 0, km: 0 }
      transport.set(s.transport_in, { legs: cur.legs + 1, km: cur.km + km })
      if (s.transport_in === 'plane') {
        flights++
        for (const code of [s.from_airport, s.to_airport]) if (code) airportVisits.set(code, (airportVisits.get(code) ?? 0) + 1)
      }
    })
  }

  return {
    countries,
    continents: [...new Set(countries.map((c) => countryRef.get(c)?.continent).filter((c): c is ContinentCode => !!c && c !== 'AN'))],
    subdivisions: visited?.subdivisions.map((s) => s.code) ?? [],
    cities: cities.size,
    trips: done.length,
    planned: trips.length - done.length,
    totalKm,
    flights,
    airports: [...airportVisits]
      .map(([code, visits]) => ({ airport: airports.get(code)!, visits }))
      .filter((a) => a.airport)
      .sort((a, b) => b.visits - a.visits),
    transport: [...transport].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.km - a.km),
    lastStop,
    years: [...years].map(([year, n]) => ({ year, trips: n })).sort((a, b) => b.year - a.year),
  }
}

/** Kilómetros por mes de un año (por fecha de llegada de cada tramo). */
export function kmByMonth(trips: TripWithStops[], year: number, airports: AirportMap): number[] {
  const months = Array(12).fill(0) as number[]
  for (const t of trips.filter(isDone)) {
    t.stops.forEach((s, i) => {
      const d = s.arrived_on ?? t.start_date
      if (i === 0 || !d || Number(d.slice(0, 4)) !== year) return
      months[Number(d.slice(5, 7)) - 1] += legKm(t.stops, i, airports)
    })
  }
  return months
}

export const missingContinents = (have: ContinentCode[]) => INHABITED_CONTINENTS.filter((c) => !have.includes(c))

export function formatKm(km: number, compact = false): string {
  if (compact && km >= 10_000) return `${(km / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}K`
  return Math.round(km).toLocaleString('es-ES')
}
