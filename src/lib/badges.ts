// Insignias e hitos, calculados a partir de los viajes (no se guardan en la base de datos).
import type { TripWithStops } from './db'
import { haversine } from './geo'
import { isDone, legEndpoints, tripDays, type AirportMap, type Stats } from './stats'

export interface Badge {
  id: string
  title: string
  description: string
  icon: string
  /** Progreso 0..1; 1 = desbloqueada. */
  progress: number
  /** Texto corto con el detalle (p. ej. "4 / 5 continentes"). */
  detail: string
}

const ISLAND_COUNTRIES = new Set(
  'IS IE GB JP NZ MT CY LK MV MU CU JM DO HT BS BB TT FJ PH ID TW SG BH CV ST KM SC MG PG SB VU WS TO KI MH FM NR TV PW AG DM GD KN LC VC'.split(' '),
)

export function computeBadges(trips: TripWithStops[], stats: Stats, airports: AirportMap): Badge[] {
  const done = trips.filter(isDone)
  const allStops = done.flatMap((t) => t.stops)

  const longestFlight = Math.max(
    0,
    ...done.flatMap((t) => t.stops.map((s, i) => (i > 0 && s.transport_in === 'plane' ? haversine(...legEndpoints(t.stops, i, airports)) : 0))),
  )
  const trainCountries = Math.max(
    0,
    ...done.map((t) => new Set(t.stops.filter((s, i) => i > 0 && s.transport_in === 'train').map((s) => s.country_code)).size),
  )
  const soloDays = Math.max(0, ...done.filter((t) => t.solo).map((t) => tripDays(t) ?? 0))
  const boat = allStops.some((s) => s.transport_in === 'boat')
  const islands = new Set(stats.countries.filter((c) => ISLAND_COUNTRIES.has(c)))
  const south = allStops.some((s) => s.lat < 0)
  const polar = allStops.some((s) => Math.abs(s.lat) >= 63)
  const maxStops = Math.max(0, ...done.map((t) => t.stops.length))
  const roadKm = Math.max(
    0,
    ...done.map((t) =>
      t.stops.reduce((km, s, i) => (i > 0 && s.transport_in === 'car' ? km + haversine(...legEndpoints(t.stops, i, airports)) : km), 0),
    ),
  )
  const n = stats.countries.length
  const pct = (v: number, goal: number) => Math.min(1, v / goal)

  return [
    { id: 'first', title: 'Primer sello', description: 'Registra tu primera expedición completada.', icon: 'approval', progress: pct(done.length, 1), detail: `${done.length} viajes` },
    { id: 'c10', title: 'Coleccionista', description: 'Visita 10 países distintos.', icon: 'public', progress: pct(n, 10), detail: `${Math.min(n, 10)} / 10 países` },
    { id: 'c25', title: 'Trotamundos', description: 'Visita 25 países distintos.', icon: 'travel_explore', progress: pct(n, 25), detail: `${Math.min(n, 25)} / 25 países` },
    { id: 'world', title: 'Vuelta al mundo', description: 'Pisa los 6 continentes habitados.', icon: 'language', progress: pct(stats.continents.length, 6), detail: `${stats.continents.length} / 6 continentes` },
    { id: 'long', title: 'Largo radio', description: 'Un vuelo de más de 8.000 km.', icon: 'flight_takeoff', progress: pct(longestFlight, 8000), detail: `${Math.round(longestFlight).toLocaleString('es-ES')} km máx.` },
    { id: 'rail', title: 'Interrail master', description: 'Llega en tren a 3 países en un mismo viaje.', icon: 'train', progress: pct(trainCountries, 3), detail: `${trainCountries} / 3 países en tren` },
    { id: 'solo', title: 'Solo adventurer', description: 'Un viaje en solitario de 7 días o más.', icon: 'person_pin_circle', progress: pct(soloDays, 7), detail: `${soloDays} / 7 días` },
    { id: 'road', title: 'Rey de la carretera', description: 'Más de 1.000 km en coche en un viaje.', icon: 'directions_car', progress: pct(roadKm, 1000), detail: `${Math.round(roadKm).toLocaleString('es-ES')} / 1.000 km` },
    { id: 'boat', title: 'Lobo de mar', description: 'Un tramo en barco o ferry.', icon: 'sailing', progress: boat ? 1 : 0, detail: boat ? 'Navegado' : 'Sin tramos en barco' },
    { id: 'islands', title: 'Islas remotas', description: 'Visita 10 países insulares.', icon: 'beach_access', progress: pct(islands.size, 10), detail: `${islands.size} / 10 islas` },
    { id: 'south', title: 'Hemisferio sur', description: 'Cruza el ecuador.', icon: 'south', progress: south ? 1 : 0, detail: south ? 'Ecuador cruzado' : 'Pendiente' },
    { id: 'polar', title: 'Latitudes extremas', description: 'Una parada por encima de 63° de latitud.', icon: 'ac_unit', progress: polar ? 1 : 0, detail: polar ? 'Conseguido' : 'Pendiente' },
    { id: 'earth', title: 'Una vuelta a la Tierra', description: 'Acumula 40.075 km.', icon: 'all_inclusive', progress: pct(stats.totalKm, 40075), detail: `${(stats.totalKm / 40075).toFixed(2)} vueltas` },
    { id: 'airports', title: 'Sala VIP', description: 'Pasa por 10 aeropuertos distintos.', icon: 'local_airport', progress: pct(stats.airports.length, 10), detail: `${stats.airports.length} / 10 aeropuertos` },
    { id: 'hopper', title: 'Saltamontes', description: 'Un viaje con 5 paradas o más.', icon: 'route', progress: pct(maxStops, 5), detail: `${maxStops} / 5 paradas` },
  ]
}

export interface StampData {
  key: string
  countryCode: string
  place: string
  date: string | null
  airport: string | null
  mode: string | null
  lat: number
  tripId: string
}

/** Un sello por cada entrada a un país distinto del de origen del viaje. */
export function computeStamps(trips: TripWithStops[]): StampData[] {
  const out: StampData[] = []
  for (const t of trips.filter(isDone)) {
    const origin = t.stops[0]?.country_code
    const seen = new Set<string>()
    for (const s of t.stops) {
      if (s.country_code === origin || seen.has(s.country_code)) continue
      seen.add(s.country_code)
      out.push({
        key: `${t.id}-${s.country_code}`,
        countryCode: s.country_code,
        place: s.name,
        date: s.arrived_on ?? t.start_date,
        airport: s.transport_in === 'plane' ? s.to_airport : null,
        mode: s.transport_in,
        lat: s.lat,
        tripId: t.id,
      })
    }
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
