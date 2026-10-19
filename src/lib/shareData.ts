// Datos de las imágenes para compartir: un viaje, o el mapa del mundo del usuario.
import { formatRange } from '../components/ui'
import type { Profile, TripWithStops } from './db'
import type { CardData } from './shareCard'
import { UN_COUNTRY_COUNT } from './countries'
import { TRANSPORT } from './transport'
import { MONTHS_LONG, type YearReview } from './yearReview'
import { formatKm, isDone, legLine, tripCountries, tripDays, tripKm, type AirportMap, type Stats } from './stats'

const km = (n: number) => ({ value: formatKm(n, n >= 1_000_000), unit: 'km' })

function legsOf(trips: TripWithStops[]): CardData['legs'] {
  return trips.flatMap((t) =>
    t.stops.slice(1).map((s, j) => {
      const [from, to] = legLine(t.stops, j + 1)
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
    legs: legsOf([t]),
    stops: t.stops.map((s) => [s.lon, s.lat]),
    countries,
  }
}

export function worldCardData(profile: Profile | undefined, stats: Stats, trips: TripWithStops[], _airports: AirportMap): Omit<CardData, 'photo'> {
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
    legs: legsOf(done),
    stops: done.flatMap((t) => t.stops.map((s): [number, number] => [s.lon, s.lat])),
    countries: stats.countries,
  }
}

export function yearCardData(r: YearReview, _airports: AirportMap, owner: string | undefined, countryName: (code: string) => string): Omit<CardData, 'photo'> {
  const highlights: CardData['highlights'] = []
  if (r.longestTrip) highlights.push({ label: 'Viaje más largo', value: `${r.longestTrip.trip.title} · ${formatKm(r.longestTrip.km)} km` })
  if (r.newCountries.length)
    highlights.push({
      label: r.newCountries.length === 1 ? 'País nuevo' : `${r.newCountries.length} países nuevos`,
      value: r.newCountries.slice(0, 4).map(countryName).join(', ') + (r.newCountries.length > 4 ? '…' : ''),
    })
  if (r.topMonth) highlights.push({ label: 'Mes más viajero', value: `${MONTHS_LONG[r.topMonth.month].replace(/^./, (c) => c.toUpperCase())} · ${formatKm(r.topMonth.km)} km` })
  if (r.topMode) highlights.push({ label: 'Transporte favorito', value: `${TRANSPORT[r.topMode.mode].label} · ${formatKm(r.topMode.km)} km` })
  if (r.longestFlight) highlights.push({ label: 'Vuelo más largo', value: `${r.longestFlight.from} → ${r.longestFlight.to} · ${formatKm(r.longestFlight.km)} km` })
  if (r.north && r.south && r.north !== r.south) highlights.push({ label: 'De norte a sur', value: `${r.north.name} → ${r.south.name}` })
  if (r.badges.length) highlights.push({ label: r.badges.length === 1 ? 'Insignia nueva' : `${r.badges.length} insignias nuevas`, value: r.badges.slice(0, 3).map((b) => b.title).join(', ') })

  return {
    kind: 'year',
    eyebrow: `Resumen del año${owner ? ` · ${owner}` : ''}`,
    title: `Mi ${r.year} viajero`,
    subtitle: r.countries.slice(0, 5).map(countryName).join(' · ') + (r.countries.length > 5 ? ' …' : ''),
    stats: [
      { label: 'Recorridos', ...km(r.km) },
      { label: r.countries.length === 1 ? 'País' : 'Países', value: String(r.countries.length) },
      { label: r.trips.length === 1 ? 'Viaje' : 'Viajes', value: String(r.trips.length) },
      { label: 'Días fuera', value: String(r.days) },
    ],
    legs: legsOf(r.trips),
    stops: r.trips.flatMap((t) => t.stops.map((s): [number, number] => [s.lon, s.lat])),
    countries: r.countries,
    highlights,
  }
}
