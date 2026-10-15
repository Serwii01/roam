// Insignias e hitos, calculados a partir de los viajes (no se guardan en la base de datos).
import type { Country, TripWithStops } from './db'
import { haversine } from './geo'
import { isDone, legEndpoints, tripDays, tripYear, type AirportMap, type Stats } from './stats'

export type BadgeCategory = 'explore' | 'distance' | 'transport' | 'rhythm' | 'memories'

export const BADGE_CATEGORIES: Record<BadgeCategory, string> = {
  explore: 'Exploración',
  distance: 'Distancia',
  transport: 'Transporte',
  rhythm: 'Ritmo viajero',
  memories: 'Recuerdos',
}

export interface Badge {
  id: string
  category: BadgeCategory
  title: string
  description: string
  icon: string
  /** Progreso 0..1; 1 = desbloqueada. */
  progress: number
  /** Texto corto con el detalle (p. ej. "4 / 6 continentes"). */
  detail: string
}

const ISLAND_COUNTRIES = new Set(
  'IS IE GB JP NZ MT CY LK MV MU CU JM DO HT BS BB TT FJ PH ID TW SG BH CV ST KM SC MG PG SB VU WS TO KI MH FM NR TV PW AG DM GD KN LC VC'.split(' '),
)

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')
/** Estación por mes de inicio (hemisferio norte): dic-feb invierno, mar-may primavera… */
const SEASON = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]

/**
 * Insignias a partir de los viajes completados. `countryRef` da el continente de cada país para los
 * hitos por continente (sin él, esos quedan a 0).
 */
export function computeBadges(trips: TripWithStops[], stats: Stats, airports: AirportMap, countryRef: Map<string, Country> = new Map()): Badge[] {
  const done = trips.filter(isDone)
  const allStops = done.flatMap((t) => t.stops)
  const legs = done.flatMap((t) => t.stops.slice(1).map((s, j) => ({ t, s, km: haversine(...legEndpoints(t.stops, j + 1, airports)) })))
  const max = (xs: number[]) => Math.max(0, ...xs)

  // Exploración
  const n = stats.countries.length
  const inContinent = (...cs: string[]) => stats.countries.filter((c) => cs.includes(countryRef.get(c)?.continent ?? '')).length
  const islands = stats.countries.filter((c) => ISLAND_COUNTRIES.has(c)).length
  const south = allStops.some((s) => s.lat < 0)
  const polar = allStops.some((s) => Math.abs(s.lat) >= 63)
  const hemis = [allStops.some((s) => s.lat >= 0), south, allStops.some((s) => s.lon >= 0), allStops.some((s) => s.lon < 0)].filter(Boolean).length
  const farthest = max(done.map((t) => max(t.stops.map((s) => haversine([t.stops[0].lon, t.stops[0].lat], [s.lon, s.lat])))))
  const antarctica = allStops.some((s) => s.country_code === 'AQ' || s.lat <= -60)

  // Distancia
  const longestFlight = max(legs.filter((l) => l.s.transport_in === 'plane').map((l) => l.km))
  const kmOf = (t: TripWithStops, mode?: string) => legs.filter((l) => l.t === t && (!mode || l.s.transport_in === mode)).reduce((a, l) => a + l.km, 0)
  const tripKmMax = max(done.map((t) => kmOf(t)))
  const roadKm = max(done.map((t) => kmOf(t, 'car')))

  // Transporte
  const trainCountries = max(done.map((t) => new Set(t.stops.filter((s, i) => i > 0 && s.transport_in === 'train').map((s) => s.country_code)).size))
  const maxModes = max(done.map((t) => new Set(t.stops.slice(1).map((s) => s.transport_in).filter(Boolean)).size))
  const allModes = new Set(legs.map((l) => l.s.transport_in).filter(Boolean)).size
  const has = (m: string) => legs.some((l) => l.s.transport_in === m)

  // Ritmo
  const days = done.map((t) => tripDays(t) ?? 0)
  const soloDays = max(done.filter((t) => t.solo).map((t) => tripDays(t) ?? 0))
  const maxStops = max(done.map((t) => t.stops.length))
  const byYear = new Map<number, { trips: number; days: number }>()
  for (const t of done) {
    const y = tripYear(t)
    if (!y) continue
    const cur = byYear.get(y) ?? { trips: 0, days: 0 }
    byYear.set(y, { trips: cur.trips + 1, days: cur.days + (tripDays(t) ?? 0) })
  }
  const busiestYear = max([...byYear.values()].map((v) => v.trips))
  const nomadDays = max([...byYear.values()].map((v) => v.days))
  const years = [...byYear.keys()].sort()
  let streak = 0
  for (let i = 0, run = 0; i < years.length; i++) {
    run = i > 0 && years[i] === years[i - 1] + 1 ? run + 1 : 1
    streak = Math.max(streak, run)
  }
  const seasons = new Set(done.filter((t) => t.start_date).map((t) => SEASON[Number(t.start_date!.slice(5, 7)) - 1])).size

  // Recuerdos
  const photos = done.reduce((a, t) => a + t.photos.length, 0)
  const soundtracks = done.filter((t) => t.soundtrack_url).length
  const notes = allStops.filter((s) => s.notes?.trim()).length
  const ratings = allStops.filter((s) => s.rating).length
  const sightsSeen = done.reduce((a, t) => a + (t.sights ?? []).filter((x) => x.done).length, 0)
  const crew = done.some((t) => (t.member_count ?? 0) > 0 || t.companions.length > 0)

  type Meta = Pick<Badge, 'id' | 'category' | 'icon' | 'title' | 'description'>
  const count = (meta: Meta, v: number, goal: number, unit: string): Badge => ({
    ...meta,
    progress: Math.min(1, v / goal),
    detail: `${fmt(Math.min(v, goal))} / ${fmt(goal)} ${unit}`,
  })
  const flag = (meta: Meta, ok: boolean): Badge => ({
    ...meta,
    progress: ok ? 1 : 0,
    detail: ok ? 'Conseguido' : 'Pendiente',
  })

  return [
    // Exploración
    count({ id: 'first', category: 'explore', icon: 'approval', title: 'Primer sello', description: 'Registra tu primera expedición completada.' }, done.length, 1, 'viaje'),
    count({ id: 'c10', category: 'explore', icon: 'public', title: 'Coleccionista', description: 'Visita 10 países distintos.' }, n, 10, 'países'),
    count({ id: 'c25', category: 'explore', icon: 'travel_explore', title: 'Trotamundos', description: 'Visita 25 países distintos.' }, n, 25, 'países'),
    count({ id: 'c50', category: 'explore', icon: 'military_tech', title: 'Ciudadano del mundo', description: 'Visita 50 países distintos.' }, n, 50, 'países'),
    count({ id: 'c100', category: 'explore', icon: 'workspace_premium', title: 'Leyenda viva', description: 'Visita 100 países distintos.' }, n, 100, 'países'),
    count({ id: 'world', category: 'explore', icon: 'language', title: 'Vuelta al mundo', description: 'Pisa los 6 continentes habitados.' }, stats.continents.length, 6, 'continentes'),
    count({ id: 'regions', category: 'explore', icon: 'map', title: 'Explorador regional', description: 'Visita 25 regiones o provincias.' }, stats.subdivisions.length, 25, 'regiones'),
    count({ id: 'europe', category: 'explore', icon: 'castle', title: 'Gran Tour', description: 'Visita 15 países de Europa.' }, inContinent('EU'), 15, 'países'),
    count({ id: 'americas', category: 'explore', icon: 'south_america', title: 'Panamericano', description: 'Visita 5 países de América.' }, inContinent('NA', 'SA'), 5, 'países'),
    count({ id: 'asia', category: 'explore', icon: 'temple_buddhist', title: 'Ruta de la Seda', description: 'Visita 5 países de Asia.' }, inContinent('AS'), 5, 'países'),
    count({ id: 'africa', category: 'explore', icon: 'pets', title: 'Safari', description: 'Visita 3 países de África.' }, inContinent('AF'), 3, 'países'),
    count({ id: 'islands', category: 'explore', icon: 'beach_access', title: 'Islas remotas', description: 'Visita 10 países insulares.' }, islands, 10, 'islas'),
    flag({ id: 'south', category: 'explore', icon: 'south', title: 'Hemisferio sur', description: 'Cruza el ecuador.' }, south),
    count({ id: 'hemis', category: 'explore', icon: 'explore', title: 'Cuatro hemisferios', description: 'Paradas al norte, al sur, al este y al oeste de Greenwich.' }, hemis, 4, 'hemisferios'),
    flag({ id: 'polar', category: 'explore', icon: 'ac_unit', title: 'Latitudes extremas', description: 'Una parada por encima de 63° de latitud.' }, polar),
    count({ id: 'antipodes', category: 'explore', icon: 'globe', title: 'Al otro lado del mundo', description: 'Una parada a más de 12.000 km del inicio del viaje.' }, farthest, 12000, 'km'),
    flag({ id: 'antarctica', category: 'explore', icon: 'severe_cold', title: 'Fin del mundo', description: 'Llega a la Antártida.' }, antarctica),

    // Distancia
    count({ id: 'earth', category: 'distance', icon: 'all_inclusive', title: 'Una vuelta a la Tierra', description: 'Acumula 40.075 km.' }, stats.totalKm, 40075, 'km'),
    count({ id: 'moon', category: 'distance', icon: 'nightlight', title: 'Hasta la Luna', description: 'Acumula 384.400 km, la distancia a la Luna.' }, stats.totalKm, 384400, 'km'),
    count({ id: 'long', category: 'distance', icon: 'flight_takeoff', title: 'Largo radio', description: 'Un vuelo de más de 8.000 km.' }, longestFlight, 8000, 'km'),
    count({ id: 'bigtrip', category: 'distance', icon: 'rocket_launch', title: 'Diez mil', description: 'Más de 10.000 km en un solo viaje.' }, tripKmMax, 10000, 'km'),
    count({ id: 'road', category: 'distance', icon: 'directions_car', title: 'Rey de la carretera', description: 'Más de 1.000 km en coche en un viaje.' }, roadKm, 1000, 'km'),

    // Transporte
    count({ id: 'airports', category: 'transport', icon: 'local_airport', title: 'Sala VIP', description: 'Pasa por 10 aeropuertos distintos.' }, stats.airports.length, 10, 'aeropuertos'),
    count({ id: 'flyer', category: 'transport', icon: 'airplane_ticket', title: 'Viajero frecuente', description: 'Registra 10 vuelos.' }, stats.flights, 10, 'vuelos'),
    count({ id: 'gold', category: 'transport', icon: 'connecting_airports', title: 'Millas de oro', description: 'Registra 50 vuelos.' }, stats.flights, 50, 'vuelos'),
    count({ id: 'rail', category: 'transport', icon: 'train', title: 'Interrail master', description: 'Llega en tren a 3 países en un mismo viaje.' }, trainCountries, 3, 'países'),
    flag({ id: 'boat', category: 'transport', icon: 'sailing', title: 'Lobo de mar', description: 'Un tramo en barco o ferry.' }, has('boat')),
    flag({ id: 'bike', category: 'transport', icon: 'pedal_bike', title: 'Pedalista', description: 'Un tramo en bicicleta.' }, has('bike')),
    flag({ id: 'walk', category: 'transport', icon: 'hiking', title: 'Paso a paso', description: 'Un tramo a pie.' }, has('walk')),
    count({ id: 'multimodal', category: 'transport', icon: 'shuffle', title: 'Multimodal', description: 'Usa 4 medios de transporte en un mismo viaje.' }, maxModes, 4, 'medios'),
    count({ id: 'allmodes', category: 'transport', icon: 'commute', title: 'Todoterreno', description: 'Usa los 7 medios de transporte.' }, allModes, 7, 'medios'),

    // Ritmo viajero
    count({ id: 'hopper', category: 'rhythm', icon: 'route', title: 'Saltamontes', description: 'Un viaje con 5 paradas o más.' }, maxStops, 5, 'paradas'),
    count({ id: 'solo', category: 'rhythm', icon: 'person_pin_circle', title: 'Solo adventurer', description: 'Un viaje en solitario de 7 días o más.' }, soloDays, 7, 'días'),
    flag({ id: 'express', category: 'rhythm', icon: 'bolt', title: 'Escapada exprés', description: 'Un viaje de 3 días o menos.' }, days.some((d) => d > 0 && d <= 3)),
    count({ id: 'epic', category: 'rhythm', icon: 'landscape', title: 'Gran expedición', description: 'Un viaje de 21 días o más.' }, max(days), 21, 'días'),
    count({ id: 'busy', category: 'rhythm', icon: 'calendar_month', title: 'Año viajero', description: 'Haz 5 viajes en un mismo año.' }, busiestYear, 5, 'viajes'),
    count({ id: 'nomad', category: 'rhythm', icon: 'luggage', title: 'Nómada', description: 'Pasa 60 días de viaje en un mismo año.' }, nomadDays, 60, 'días'),
    count({ id: 'streak', category: 'rhythm', icon: 'local_fire_department', title: 'En racha', description: 'Viaja 3 años seguidos.' }, streak, 3, 'años'),
    count({ id: 'seasons', category: 'rhythm', icon: 'filter_drama', title: 'Cuatro estaciones', description: 'Empieza viajes en invierno, primavera, verano y otoño.' }, seasons, 4, 'estaciones'),

    // Recuerdos
    flag({ id: 'crew', category: 'memories', icon: 'groups', title: 'Tripulación', description: 'Un viaje con compañeros.' }, crew),
    count({ id: 'photos', category: 'memories', icon: 'photo_camera', title: 'Fotógrafo', description: 'Sube 50 fotos de tus viajes.' }, photos, 50, 'fotos'),
    count({ id: 'dj', category: 'memories', icon: 'music_note', title: 'DJ de ruta', description: 'Pon banda sonora a 5 viajes.' }, soundtracks, 5, 'viajes'),
    count({ id: 'writer', category: 'memories', icon: 'edit_note', title: 'Cronista', description: 'Escribe notas en 20 paradas.' }, notes, 20, 'paradas'),
    count({ id: 'sights', category: 'memories', icon: 'museum', title: 'Cazamonumentos', description: 'Visita 25 sitios (monumentos, museos, plazas…).' }, sightsSeen, 25, 'sitios'),
    count({ id: 'critic', category: 'memories', icon: 'star', title: 'Crítico', description: 'Valora 25 paradas con estrellas.' }, ratings, 25, 'paradas'),
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
