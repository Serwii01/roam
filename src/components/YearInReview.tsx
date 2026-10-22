import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { SpotifyPlayer } from './Spotify'
import { Flag, plural } from './ui'
import type { Country, Profile, TripWithStops } from '../lib/db'
import { yearCardData } from '../lib/shareData'
import { formatKm, type AirportMap } from '../lib/stats'
import { TRANSPORT } from '../lib/transport'
import { MONTHS_LONG, computeYear, reviewYears } from '../lib/yearReview'

const ShareSheet = lazy(() => import('./ShareSheet').then((m) => ({ default: m.ShareSheet })))

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «Tu año en ROAM»: cifras, momentos e insignias del año elegido, con imagen para compartir. */
export function YearInReview({
  trips,
  airports,
  countries,
  profile,
}: {
  trips: TripWithStops[]
  airports: AirportMap
  countries: { byCode: Map<string, Country>; name: (code: string) => string }
  profile: Profile | undefined
}) {
  const years = useMemo(() => reviewYears(trips), [trips])
  const [picked, setPicked] = useState<number | null>(null)
  const [sharing, setSharing] = useState(false)
  const year = picked ?? years[0]
  const { byCode, name } = countries
  const r = useMemo(() => (year ? computeYear(trips, year, airports, byCode) : null), [trips, year, airports, byCode])
  // `name` cambia en cada render; lo que importa es `byCode`.
  const shareData = useMemo(() => r && yearCardData(r, airports, profile?.display_name || profile?.username, name), [r, airports, profile, byCode])

  if (!r) {
    return (
      <section className="rounded-md bg-night p-8 text-white">
        <div className="label-stamp text-accent">Resumen del año</div>
        <h2 className="headline-lg mt-2">Tu año viajero aparecerá aquí</h2>
        <p className="mt-2 text-white/70">Completa tu primer viaje para ver tus kilómetros, países nuevos y momentos del año.</p>
      </section>
    )
  }

  const laps = r.km / 40075

  return (
    <section className="relative overflow-hidden rounded-md bg-night p-6 text-white md:p-10" aria-labelledby="year-title">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/25 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-stamp text-accent">Resumen del año // wrapped</div>
          <h2 id="year-title" className="mt-2 font-display text-6xl font-bold uppercase leading-none tracking-tight md:text-8xl">
            Tu {r.year}
          </h2>
          <p className="mt-3 text-white/70">
            {plural(r.trips.length, 'viaje', 'viajes')} · {plural(r.cities, 'lugar', 'lugares')} · {plural(r.continents.length, 'continente', 'continentes')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {years.length > 1 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Año">
              {years.map((y) => (
                <button
                  key={y}
                  aria-pressed={y === r.year}
                  onClick={() => setPicked(y)}
                  className={`label-code rounded-sm px-3 py-2 transition ${y === r.year ? 'bg-white text-night' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-accent" onClick={() => setSharing(true)}>
            <Icon name="ios_share" size={18} /> Compartir mi año
          </button>
        </div>
      </div>

      <div className="relative mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Kilómetros" value={formatKm(r.km)} hint={laps >= 0.1 ? `${laps.toLocaleString('es-ES', { maximumFractionDigits: 2 })} vueltas a la Tierra` : 'en ruta'} />
        <Big label="Días de viaje" value={String(r.days)} hint={`${Math.round((r.days / 365) * 100)}% del año fuera`} />
        <Big label="Países" value={String(r.countries.length)} hint={r.newCountries.length ? `${r.newCountries.length} por primera vez` : 'ninguno nuevo'} />
        <Big label="Vuelos" value={String(r.flights)} hint={`${plural(r.stops, 'parada', 'paradas')} · ${plural(r.photos, 'foto', 'fotos')}`} />
      </div>

      {r.countries.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {r.countries.map((c) => (
            <span key={c} className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm ${r.newCountries.includes(c) ? 'bg-accent text-white' : 'bg-white/10'}`}>
              <Flag code={c} /> {name(c)}
              {r.newCountries.includes(c) && <span className="label-stamp ml-1">Nuevo</span>}
            </span>
          ))}
        </div>
      )}

      <div className="relative mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {r.longestTrip && (
          <Moment icon="emoji_events" label="Viaje más largo">
            <Link to={`/app/viajes/${r.longestTrip.trip.id}`} className="hover:underline">
              {r.longestTrip.trip.title}
            </Link>
            <Sub>{formatKm(r.longestTrip.km)} km</Sub>
          </Moment>
        )}
        {r.topMonth && (
          <Moment icon="calendar_month" label="Mes más viajero">
            {cap(MONTHS_LONG[r.topMonth.month])}
            <Sub>{formatKm(r.topMonth.km)} km ese mes</Sub>
          </Moment>
        )}
        {r.topMode && (
          <Moment icon={TRANSPORT[r.topMode.mode].icon} label="Transporte favorito">
            {TRANSPORT[r.topMode.mode].label}
            <Sub>
              {plural(r.topMode.legs, 'tramo', 'tramos')} · {formatKm(r.topMode.km)} km
            </Sub>
          </Moment>
        )}
        {r.longestFlight && (
          <Moment icon="flight_takeoff" label="Vuelo más largo">
            {r.longestFlight.from} → {r.longestFlight.to}
            <Sub>{formatKm(r.longestFlight.km)} km</Sub>
          </Moment>
        )}
        {r.north && r.south && (
          <Moment icon="explore" label="Puntos extremos">
            {r.north.name} → {r.south.name}
            <Sub>
              {Math.abs(r.north.lat).toFixed(1)}° {r.north.lat >= 0 ? 'N' : 'S'} a {Math.abs(r.south.lat).toFixed(1)}° {r.south.lat >= 0 ? 'N' : 'S'}
            </Sub>
          </Moment>
        )}
        {r.companions.length > 0 && (
          <Moment icon="groups" label="Compañeros de viaje">
            {r.companions.slice(0, 3).join(', ')}
            {r.companions.length > 3 && <Sub>y {r.companions.length - 3} más</Sub>}
          </Moment>
        )}
      </div>

      {(r.badges.length > 0 || r.soundtrack) && (
        <div className="relative mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="label-stamp mb-3 text-white/60">Insignias conseguidas en {r.year}</div>
            {r.badges.length ? (
              <div className="flex flex-wrap gap-2">
                {r.badges.map((b) => (
                  <span key={b.id} className="flex items-center gap-2 rounded-sm border border-white/15 bg-white/5 px-3 py-2" title={b.description}>
                    <Icon name={b.icon} size={18} className="text-accent" />
                    <span className="font-display font-semibold">{b.title}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-white/60">Ninguna nueva este año.</p>
            )}
          </div>
          {r.soundtrack && (
            <div>
              <div className="label-stamp mb-3 text-white/60">Banda sonora del año · {r.soundtrack.trip.title}</div>
              <SpotifyPlayer url={r.soundtrack.url} compact />
            </div>
          )}
        </div>
      )}

      {sharing && shareData && (
        <Suspense fallback={null}>
          <ShareSheet data={shareData} onClose={() => setSharing(false)} />
        </Suspense>
      )}
    </section>
  )
}

function Big({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-sm bg-white/5 p-4 md:p-5">
      <div className="label-stamp text-white/60">{label}</div>
      <div className="mt-1 font-display text-4xl font-bold tracking-tight md:text-5xl">{value}</div>
      <div className="mt-1 text-sm text-white/60">{hint}</div>
    </div>
  )
}

function Moment({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-sm bg-white/5 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-accent/20 text-accent">
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <div className="label-stamp text-white/60">{label}</div>
        <div className="mt-1 font-display text-lg font-semibold leading-snug">{children}</div>
      </div>
    </div>
  )
}

const Sub = ({ children }: { children: ReactNode }) => <span className="block font-sans text-sm font-normal text-white/60">{children}</span>
