import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { TripCard } from '../components/TripCard'
import { Empty, ErrorNote, Eyebrow, Spinner, formatDate } from '../components/ui'
import { WorldMap } from '../components/LazyWorldMap'
import { CONTINENT_NAMES } from '../lib/db'
import { UN_COUNTRY_COUNT } from '../lib/countries'
import { downloadKml } from '../lib/export'
import { dayInfo } from '../lib/days'
import { useTravelData } from '../lib/hooks'
import { activeTrip as tripOnDay, localDate } from '../lib/today'
import { formatKm, isDone, missingContinents, tripDays, tripKm, tripYear } from '../lib/stats'

type Filter = { kind: 'all' } | { kind: 'year'; year: number } | { kind: 'solo' } | { kind: 'epic' }

export function ExplorerPage() {
  const { loading, error, trips, stats, airports, countries } = useTravelData()
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })

  const done = useMemo(() => trips.filter(isDone), [trips])
  const today = useMemo(() => tripOnDay(trips, localDate()), [trips])
  const shown = useMemo(() => {
    switch (filter.kind) {
      case 'year':
        return done.filter((t) => tripYear(t) === filter.year)
      case 'solo':
        return done.filter((t) => t.solo)
      case 'epic':
        return done.filter((t) => tripKm(t, airports) >= 5000)
      default:
        return done
    }
  }, [done, filter, airports])

  if (loading) return <Spinner label="Sincronizando telemetría" />

  const last = stats.lastStop
  const lastCountry = last ? countries.byCode.get(last.stop.country_code) : undefined
  const pct = (stats.countries.length / UN_COUNTRY_COUNT) * 100
  const activeTrip = shown.find((t) => t.id === last?.trip.id) ?? shown[0]
  const missing = missingContinents(stats.continents)

  // Ritmo: ciudades nuevas cada 90 días desde el primer viaje.
  const firstDate = done.map((t) => t.start_date).filter(Boolean).sort()[0]
  const spanDays = firstDate ? Math.max(90, (Date.now() - Date.parse(firstDate)) / 86_400_000) : 0
  const pace = spanDays ? (stats.cities / spanDays) * 90 : 0

  return (
    <div>
      <ErrorNote error={error} />
      {/* Durante un viaje, lo primero al abrir la app: lo que toca hoy. */}
      {today && (
        <Link to="/app/hoy" className="mb-6 flex items-center gap-3 rounded-md bg-ink px-4 py-3 text-paper shadow-[var(--shadow-card)] hover:opacity-95">
          <Icon name="today" className="text-accent" />
          <span className="min-w-0 flex-1">
            <span className="label-stamp block text-paper/70">
              Estás de viaje · día {today.index + 1} de {today.days.length}
            </span>
            <span className="block truncate font-display font-semibold">
              Hoy en {dayInfo(today.trip.stops, today.days[today.index]).stop?.name ?? today.trip.title}: qué toca ahora
            </span>
          </span>
          <Icon name="arrow_forward" />
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow>Telemetry protocol // 01-EXP</Eyebrow>
            <span className="label-code text-ink-soft">/ Sincronización GPS: activa</span>
          </div>
          <h1 className="display-hero mt-3">Tu huella global</h1>
          <p className="mt-3 text-lg">
            {stats.countries.length} Países • {stats.cities} Ciudades •{' '}
            <span className="font-semibold text-accent">{formatKm(stats.totalKm)} KM</span> registrados en órbita terrestre.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3">
          <HeadTile icon="public" label="Territorio" value={`${pct.toFixed(1)}%`} />
          <HeadTile
            icon="explore"
            label="Sector activo"
            value={lastCountry ? `${CONTINENT_NAMES[lastCountry.continent].split(' ')[0]} / ${lastCountry.code}` : '—'}
          />
          <HeadTile className="col-span-2 sm:col-span-1" icon="location_on" label="Último pin" value={last ? `${last.stop.name}, ${countries.name(last.stop.country_code)}` : '—'} dark />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button className="chip" aria-pressed={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
            Todos los años
          </button>
          {stats.years.slice(0, 4).map((y) => (
            <button
              key={y.year}
              className="chip"
              aria-pressed={filter.kind === 'year' && filter.year === y.year}
              onClick={() => setFilter({ kind: 'year', year: y.year })}
            >
              {y.year} ({y.trips})
            </button>
          ))}
          <button className="chip" aria-pressed={filter.kind === 'solo'} onClick={() => setFilter({ kind: 'solo' })}>
            <Icon name="person" size={15} /> En solitario
          </button>
          <button className="chip" aria-pressed={filter.kind === 'epic'} onClick={() => setFilter({ kind: 'epic' })}>
            <Icon name="route" size={15} /> Rutas épicas
          </button>
        </div>
        <span className="label-code text-ink-soft">
          Proyección mercator kinetic · <span className="text-accent-deep">v.1.0</span>
        </span>
      </div>

      <WorldMap
        className="mt-4 h-[62vh] min-h-[420px]"
        trips={shown}
        airports={airports}
        countries={stats.countries}
        activeTripId={activeTrip?.id}
        pinCard={
          last && shown.some((t) => t.id === last.trip.id)
            ? {
                stop: last.stop,
                title: 'Registro vivo',
                body: (
                  <>
                    <div className="font-semibold">
                      {last.stop.name} • {countries.name(last.stop.country_code)}
                    </div>
                    <div className="label-stamp mt-2 flex justify-between text-ink-soft">
                      <span>{tripDays(last.trip) ?? '—'} días</span>
                      <span>{last.trip.stops.length} registros</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-surface-container">
                      <div className="h-full w-4/5 rounded-full bg-accent" />
                    </div>
                  </>
                ),
              }
            : undefined
        }
      />

      <section className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label-stamp mb-1.5 text-accent-deep">Bitácora visual</div>
            <h2 className="headline-lg">Expediciones recientes</h2>
          </div>
          <Link to="/app/bitacora" className="label-code flex items-center gap-1 text-accent-deep">
            Ver bitácora completa <Icon name="arrow_forward" size={16} />
          </Link>
        </div>
        {shown.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.slice(0, 3).map((t) => (
              <TripCard key={t.id} trip={t} airports={airports} />
            ))}
          </div>
        ) : (
          <Empty icon="add_location_alt" title="Aún no hay expediciones">
            <Link to="/app/viajes/nuevo" className="btn btn-accent mt-4">
              Registrar mi primer viaje
            </Link>
          </Empty>
        )}
      </section>

      <section className="mt-10 flex flex-wrap items-center gap-4 rounded-md bg-surface-container p-5">
        <div className="grid h-12 w-12 place-items-center rounded-sm bg-card">
          <Icon name="speed" className="text-accent" />
        </div>
        <div className="mr-auto">
          <div className="font-display font-semibold uppercase">Ritmo de exploración promedio</div>
          <div className="text-sm text-ink-soft">
            {pace.toFixed(1)} nuevas ciudades cada 90 días
            {firstDate && ` desde ${formatDate(firstDate, 'month')}`}
            {missing.length > 0 && ` // Próxima meta: ${CONTINENT_NAMES[missing[0]]}`}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => downloadKml(done, airports)}>
          Exportar datos KML
        </button>
        <Link to="/app/pasaporte" className="btn btn-dark">
          Ver mi pasaporte
        </Link>
      </section>
    </div>
  )
}

function HeadTile({ icon, label, value, dark, className = '' }: { icon: string; label: string; value: string; dark?: boolean; className?: string }) {
  return (
    <div className={`${className} flex items-center gap-3 rounded-sm px-4 py-3 ${dark ? 'bg-ink text-paper' : 'bg-card shadow-[var(--shadow-card)]'}`}>
      <Icon name={icon} size={20} className={dark ? 'text-paper' : 'text-accent'} />
      <div className="min-w-0">
        <div className={`label-stamp ${dark ? 'text-paper/70' : 'text-ink-soft'}`}>{label}</div>
        <div className="truncate font-display text-lg font-semibold leading-tight">{value}</div>
      </div>
    </div>
  )
}
