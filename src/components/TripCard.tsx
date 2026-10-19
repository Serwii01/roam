import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { TripWithStops } from '../lib/db'
import { useCountries } from '../lib/hooks'
import { formatKm, tripDays, tripKm, tripMainCountry, tripModes, type AirportMap } from '../lib/stats'
import { TRANSPORT, TRIP_STYLES } from '../lib/transport'
import { Icon } from './Icon'
import { Stars, formatDate } from './ui'

/** Marca de viaje compartido con el número de viajeros (creador + compañeros); nada si es solo tuyo. */
export function SharedBadge({ trip, size = 15 }: { trip: TripWithStops; size?: number }) {
  const me = useAuth().user?.id
  const crew = (trip.member_count ?? 0) + 1
  if (crew < 2 && (!me || trip.user_id === me)) return null
  return (
    <span className="flex items-center gap-1 text-accent-deep" title="Viaje compartido">
      <Icon name="group" size={size} /> {crew}
    </span>
  )
}

/** Tarjeta de expedición con portada, como en "Expediciones recientes". */
/** `to`: adónde lleva la tarjeta (por defecto, la bitácora del viaje en la app). */
export function TripCard({ trip, airports, to }: { trip: TripWithStops; airports: AirportMap; to?: string }) {
  const { name } = useCountries()
  const cover = trip.cover_url ?? (trip.photos[0] ? api.photoThumbUrl(trip.photos[0].path) : null)
  const modes = tripModes(trip)
  const ratings = trip.stops.map((s) => s.rating).filter((r): r is number => !!r)
  const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  const country = tripMainCountry(trip)
  const days = tripDays(trip)
  const label = [trip.style ? TRIP_STYLES[trip.style].label : null, ...modes.slice(0, 2).map((m) => TRANSPORT[m].label)].filter(Boolean).join(' · ')

  return (
    <Link to={to ?? `/app/viajes/${trip.id}`} className="card group block overflow-hidden transition hover:-translate-y-0.5">
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-container">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="dot-grid grid h-full place-items-center">
            <Icon name="landscape" size={40} className="text-outline-soft" />
          </div>
        )}
        {label && <span className="label-code absolute left-3 top-3 bg-ink px-2 py-1 text-white">{label}</span>}
        {trip.status === 'planned' && <span className="label-code absolute right-3 top-3 bg-accent px-2 py-1 text-white">Planificado</span>}
        <span className="absolute bottom-3 right-3">
          <Stars value={rating} />
        </span>
      </div>
      <div className="p-5">
        <div className="label-code flex justify-between gap-2 text-ink-soft">
          <span>
            {trip.start_date ? formatDate(trip.start_date, 'month') : 'Sin fecha'}
            {days ? ` · ${days} días` : ''}
          </span>
          <span className="truncate">{country ? name(country) : ''}</span>
        </div>
        <h3 className="headline-sm mt-2 line-clamp-1">{trip.title}</h3>
        {trip.description && <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{trip.description}</p>}
        <div className="label-code mt-4 flex items-center justify-between">
          <span className="flex items-center gap-3 text-ink-soft">
            <span className="flex items-center gap-1">
              <Icon name="photo_camera" size={15} /> {trip.photos.length} capturas
            </span>
            {trip.soundtrack_url && <Icon name="music_note" size={15} className="text-accent" />}
            {/* En perfiles públicos y en la actividad de amigos (con `to`) no aplica. */}
            {!to && <SharedBadge trip={trip} />}
          </span>
          <span className="text-accent-deep">{formatKm(tripKm(trip, airports))} km</span>
        </div>
      </div>
    </Link>
  )
}
