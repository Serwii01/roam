// Resumen del año (estilo «Wrapped»): cifras, momentos e hitos de los viajes completados en un año.
import { computeBadges, type Badge } from './badges'
import type { ContinentCode, Country, Stop, TransportMode, TripWithStops } from './db'
import { haversine } from './geo'
import { computeStats, isDone, legEndpoints, tripDays, tripYear, type AirportMap } from './stats'

export const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export interface YearReview {
  year: number
  trips: TripWithStops[]
  km: number
  days: number
  /** Países visitados en el año (sin el de salida cuando el viaje sale de casa). */
  countries: string[]
  /** Los que se pisaron por primera vez ese año. */
  newCountries: string[]
  continents: ContinentCode[]
  cities: number
  stops: number
  flights: number
  photos: number
  longestTrip?: { trip: TripWithStops; km: number }
  topMonth?: { month: number; km: number }
  topMode?: { mode: TransportMode; km: number; legs: number }
  longestFlight?: { from: string; to: string; km: number }
  north?: Stop
  south?: Stop
  companions: string[]
  /** Banda sonora del viaje más largo que la tenga. */
  soundtrack?: { url: string; trip: TripWithStops }
  /** Insignias desbloqueadas durante ese año. */
  badges: Badge[]
}

/** Años con viajes completados, del más reciente al más antiguo. */
export function reviewYears(trips: TripWithStops[]): number[] {
  return [...new Set(trips.filter(isDone).map(tripYear).filter((y): y is number => !!y))].sort((a, b) => b - a)
}

/** Países de un viaje sin el de salida (Madrid → Japón → Madrid cuenta Japón), salvo viajes por un solo país. */
function visitedIn(t: TripWithStops): string[] {
  const all = [...new Set(t.stops.map((s) => s.country_code))]
  const home = t.stops[0]?.country_code
  return all.length > 1 ? all.filter((c) => c !== home) : all
}

const firstYearOf = (trips: TripWithStops[]) => {
  const first = new Map<string, number>()
  for (const t of trips) {
    const y = tripYear(t)
    if (!y) continue
    for (const c of visitedIn(t)) if (!first.has(c) || y < first.get(c)!) first.set(c, y)
  }
  return first
}

export function computeYear(allTrips: TripWithStops[], year: number, airports: AirportMap, countryRef: Map<string, Country>): YearReview {
  const done = allTrips.filter(isDone)
  const trips = done.filter((t) => tripYear(t) === year).sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))

  const countries = [...new Set(trips.flatMap(visitedIn))]
  const first = firstYearOf(done)
  const newCountries = countries.filter((c) => first.get(c) === year)

  const months = Array(12).fill(0) as number[]
  const modes = new Map<TransportMode, { km: number; legs: number }>()
  const cities = new Set<string>()
  let km = 0
  let flights = 0
  let longestFlight: YearReview['longestFlight']
  let longestTrip: YearReview['longestTrip']
  let north: Stop | undefined
  let south: Stop | undefined

  for (const t of trips) {
    let tk = 0
    t.stops.forEach((s, i) => {
      cities.add(`${s.name.toLowerCase()}|${s.country_code}`)
      if (!north || s.lat > north.lat) north = s
      if (!south || s.lat < south.lat) south = s
      if (i === 0) return
      const leg = haversine(...legEndpoints(t.stops, i, airports))
      tk += leg
      const d = s.arrived_on ?? t.start_date
      if (d) months[Number(d.slice(5, 7)) - 1] += leg
      const mode = s.transport_in ?? 'car'
      const cur = modes.get(mode) ?? { km: 0, legs: 0 }
      modes.set(mode, { km: cur.km + leg, legs: cur.legs + 1 })
      if (mode === 'plane') {
        flights++
        if (!longestFlight || leg > longestFlight.km)
          longestFlight = { from: s.from_airport ?? t.stops[i - 1].name, to: s.to_airport ?? s.name, km: leg }
      }
    })
    km += tk
    if (!longestTrip || tk > longestTrip.km) longestTrip = { trip: t, km: tk }
  }

  const topMonthIdx = months.indexOf(Math.max(...months))
  const topMode = [...modes].sort((a, b) => b[1].km - a[1].km)[0]
  const companions = [...new Set(trips.flatMap((t) => t.companions))]
  const sharedTrips = trips.filter((t) => (t.member_count ?? 0) > 0).length
  if (sharedTrips && !companions.length) companions.push(`${sharedTrips} ${sharedTrips === 1 ? 'viaje compartido' : 'viajes compartidos'}`)
  const withMusic = [...trips].filter((t) => t.soundtrack_url).sort((a, b) => (tripDays(b) ?? 0) - (tripDays(a) ?? 0))[0]

  // Insignias que se tenían al acabar el año y no al empezarlo.
  const until = (y: number) => done.filter((t) => (tripYear(t) ?? Infinity) <= y)
  const badgesAt = (y: number) => {
    const ts = until(y)
    return computeBadges(ts, computeStats(ts, undefined, countryRef, airports), airports, countryRef).filter((b) => b.progress >= 1)
  }
  const before = new Set(badgesAt(year - 1).map((b) => b.id))
  const badges = badgesAt(year).filter((b) => !before.has(b.id))

  return {
    year,
    trips,
    km,
    days: trips.reduce((a, t) => a + (tripDays(t) ?? 0), 0),
    countries,
    newCountries,
    continents: [...new Set(countries.map((c) => countryRef.get(c)?.continent).filter((c): c is ContinentCode => !!c && c !== 'AN'))],
    cities: cities.size,
    stops: trips.reduce((a, t) => a + t.stops.length, 0),
    flights,
    photos: trips.reduce((a, t) => a + t.photos.length, 0),
    longestTrip,
    topMonth: months[topMonthIdx] > 0 ? { month: topMonthIdx, km: months[topMonthIdx] } : undefined,
    topMode: topMode && { mode: topMode[0], ...topMode[1] },
    longestFlight,
    north,
    south,
    companions,
    soundtrack: withMusic ? { url: withMusic.soundtrack_url!, trip: withMusic } : undefined,
    badges,
  }
}
