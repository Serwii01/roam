import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SharedBadge } from '../components/TripCard'
import { Empty, Eyebrow, Flag, Spinner, formatRange, plural } from '../components/ui'
import { WorldMap } from '../components/LazyWorldMap'
import { api } from '../lib/api'
import { useTravelData } from '../lib/hooks'
import { formatKm, isDone, tripCountries, tripDays, tripKm, tripYear } from '../lib/stats'
import { TRANSPORT, TRIP_STYLES } from '../lib/transport'

export function BitacoraPage() {
  const { loading, trips, stats, airports } = useTravelData()
  const [view, setView] = useState<'done' | 'planned'>('done')
  const [hover, setHover] = useState<string | undefined>()
  if (loading) return <Spinner label="Abriendo archivo" />

  const list = trips.filter((t) => (view === 'done' ? isDone(t) : !isDone(t)))
  const byYear = new Map<string, typeof list>()
  for (const t of list) {
    const y = String(tripYear(t) ?? 'Sin fecha')
    byYear.set(y, [...(byYear.get(y) ?? []), t])
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Archivo de expediciones // {plural(stats.trips, 'registro', 'registros')}</Eyebrow>
          <h1 className="display-hero mt-3">Bitácora & rutas</h1>
          <p className="mt-3 text-lg text-ink-soft">
            {plural(stats.trips, 'expedición completada', 'expediciones completadas')} · {plural(stats.planned, 'planificada', 'planificadas')} ·{' '}
            <span className="text-accent">{formatKm(stats.totalKm)} km</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <button className="chip" aria-pressed={view === 'done'} onClick={() => setView('done')}>
            Completadas
          </button>
          <button className="chip" aria-pressed={view === 'planned'} onClick={() => setView('planned')}>
            Planificadas
          </button>
          <Link to="/app/viajes/nuevo?plan=1" className="chip">
            <Icon name="event_upcoming" size={14} /> Planificar
          </Link>
          <Link to="/app/importar" className="chip">
            <Icon name="download" size={14} /> Importar
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="space-y-10">
          {!list.length && (
            <Empty icon="route" title={view === 'done' ? 'Aún no hay expediciones' : 'Nada planificado todavía'}>
              <Link to={view === 'done' ? '/app/viajes/nuevo' : '/app/viajes/nuevo?plan=1'} className="btn btn-accent mt-4">
                {view === 'done' ? 'Registrar viaje' : 'Planificar viaje'}
              </Link>
            </Empty>
          )}
          {[...byYear].map(([year, ts]) => (
            <section key={year}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="font-display text-5xl font-bold tracking-tight">{year}</h2>
                <span className="label-code text-ink-soft">
                  {plural(ts.length, 'viaje', 'viajes')} · {formatKm(ts.reduce((a, t) => a + tripKm(t, airports), 0))} km
                </span>
              </div>
              <ol className="relative space-y-3 border-l-2 border-surface-highest pl-6">
                {ts.map((t) => {
                  const cover = t.cover_url ?? (t.photos[0] ? api.photoThumbUrl(t.photos[0].path) : null)
                  return (
                    <li key={t.id} className="relative" onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(undefined)}>
                      <span className={`absolute -left-[31px] top-6 h-3 w-3 rounded-full border-2 border-surface ${hover === t.id ? 'bg-accent' : 'bg-ink'}`} />
                      <Link to={`/app/viajes/${t.id}`} className="card flex gap-4 overflow-hidden p-3 transition hover:-translate-y-0.5">
                        <div className="h-24 w-32 shrink-0 overflow-hidden rounded-sm bg-surface-container">
                          {cover && <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1 py-1">
                          <div className="label-code flex flex-wrap gap-x-3 text-ink-soft">
                            <span>{formatRange(t.start_date, t.end_date)}</span>
                            {tripDays(t) && <span>{tripDays(t)} días</span>}
                            {t.style && <span className="text-accent-deep">{TRIP_STYLES[t.style].label}</span>}
                            <SharedBadge trip={t} size={14} />
                          </div>
                          <h3 className="headline-sm mt-1 truncate">{t.title}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-soft">
                            {t.stops.map((s, i) => (
                              <span key={s.id} className="flex items-center gap-1.5">
                                {i > 0 && <Icon name={TRANSPORT[s.transport_in ?? 'car'].icon} size={14} className="text-accent" />}
                                {s.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="hidden flex-col items-end justify-between py-1 sm:flex">
                          <span className="flex gap-1">
                            {tripCountries(t).map((c) => (
                              <Flag key={c} code={c} />
                            ))}
                          </span>
                          <span className="label-code text-accent-deep">{formatKm(tripKm(t, airports))} km</span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <WorldMap className="h-[70vh] min-h-96" trips={list} airports={airports} activeTripId={hover} countries={view === 'done' ? stats.countries : undefined} telemetry={false} />
        </div>
      </div>
    </div>
  )
}
