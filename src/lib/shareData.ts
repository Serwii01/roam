// Datos de las imágenes para compartir: un viaje, o el mapa del mundo del usuario.
import { formatRange } from '../components/ui'
import type { Profile, TripWithStops } from './db'
import type { CardData } from './shareCard'
import { UN_COUNTRY_COUNT } from './countries'
import { formatKm, isDone, legEndpoints, tripCountries, tripDays, tripKm, type AirportMap, type Stats } from './stats'

const km = (n: number) => ({ value: formatKm(n, n >= 1_000_000), unit: 'km' })

function legsOf(trips: TripWithStops[], airports: AirportMap): CardData['legs'] {
  return trips.flatMap((t) =>
    t.stops.slice(1).map((s, j) => {
      const [from, to] = legEndpoints(t.stops, j + 1, airports)
      return { from, to, flight: s.transport_in === 'plane' }
    }),
  )
}

export function tripCardData(t: TripWithStops, airports: AirportMap, countryName: (code: string) => string): Omit<CardData, 'photo'> {
  const countries = tripCountries(t)
  // Sin el país de salida si el viaje empieza en casa (Madrid → Japón → Madrid: «Japón»).
  const home = t.stops[0]?.country_code
  const visited = countries.length > 1 ? countries.filter((c) => c !== home) : countries
  const days = tripDays(t)
  return {
    kind: 'trip',
    eyebrow: t.status === 'planned' ? 'Próxima expedición' : `Expedición · ${t.start_date?.slice(0, 4) ?? 'S/F'}`,
    title: t.title,
    subtitle: [visited.map(countryName).join(' · '), t.start_date ? formatRange(t.start_date, t.end_date) : null].filter(Boolean).join('  ·  '),
    stats: [
      { label: 'Distancia', ...km(tripKm(t, airports)) },
      { label: 'Días', value: days ? String(days) : '—' },
      { label: visited.length === 1 ? 'País' : 'Países', value: String(visited.length) },
      { label: 'Paradas', value: String(t.stops.length) },
    ],
    legs: legsOf([t], airports),
    stops: t.stops.map((s) => [s.lon, s.lat]),
    countries,
  }
}

export function worldCardData(profile: Profile | undefined, stats: Stats, trips: TripWithStops[], airports: AirportMap): Omit<CardData, 'photo'> {
  const done = trips.filter(isDone)
  const pct = Math.round((stats.countries.length / UN_COUNTRY_COUNT) * 100)
  const years = stats.years.map((y) => y.year)
  return {
    kind: 'world',
    eyebrow: `Mi mapa del mundo · ${new Date().getFullYear()}`,
    title: profile?.display_name || profile?.username || 'Mi mundo',
    subtitle: [
      `${pct}% del mundo`,
      `${stats.continents.length} ${stats.continents.length === 1 ? 'continente' : 'continentes'}`,
      years.length ? `desde ${Math.min(...years)}` : null,
    ]
      .filter(Boolean)
      .join('  ·  '),
    stats: [
      { label: 'Países', value: String(stats.countries.length) },
      { label: 'Recorridos', ...km(stats.totalKm) },
      { label: 'Viajes', value: String(stats.trips) },
      { label: 'Ciudades', value: String(stats.cities) },
    ],
    legs: legsOf(done, airports),
    stops: done.flatMap((t) => t.stops.map((s): [number, number] => [s.lon, s.lat])),
    countries: stats.countries,
  }
}
