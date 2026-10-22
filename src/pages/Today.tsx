import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDay } from '../components/DatePicker'
import { Icon } from '../components/Icon'
import { WeatherChip } from '../components/Weather'
import { Empty, Eyebrow, Flag, Spinner, plural } from '../components/ui'
import { api } from '../lib/api'
import { dayLogistics, type DayLogistic } from '../lib/arrival'
import { isNote, type Lodging, type Sight, type Stop, type TripWithStops } from '../lib/db'
import { addDays, dayInfo, orderDay, sightDay, weekday } from '../lib/days'
import { googleMapsDirections } from '../lib/googleMaps'
import { distance, minutes, type Hop } from '../lib/hops'
import { useAirportMap, useDayHops, useTravelMutation, useTrips } from '../lib/hooks'
import { activeTrip, localDate, localTime, lodgingTonight, nextTrip, nextUp, timeline, type TimelineItem } from '../lib/today'

/** Fecha y hora de «ahora» (se pueden fijar con ?fecha=AAAA-MM-DD y ?hora=HH:MM para ver otro día). */
function useNow() {
  const [params] = useSearchParams()
  const fixedDay = params.get('fecha')
  const fixedTime = params.get('hora')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return {
    day: fixedDay && /^\d{4}-\d{2}-\d{2}$/.test(fixedDay) ? fixedDay : localDate(now),
    time: fixedTime && /^\d{2}:\d{2}$/.test(fixedTime) ? fixedTime : localTime(now),
  }
}

/**
 * /app/hoy — durante un viaje: qué toca ahora, el plan del día, dónde se duerme y qué hay mañana. Sin viaje en
 * marcha, cuánto falta para el siguiente.
 */
export function TodayPage() {
  const trips = useTrips()
  const { day, time } = useNow()
  const list = useMemo(() => trips.data ?? [], [trips.data])
  const active = useMemo(() => activeTrip(list, day), [list, day])
  const next = useMemo(() => nextTrip(list, day), [list, day])
  if (trips.isLoading) return <Spinner label="Mirando qué toca hoy" />
  if (active) return <TripToday trip={active.trip} days={active.days} index={active.index} day={day} now={time} />
  return <NoTripToday next={next} />
}

function TripToday({ trip: t, days, index, day, now }: { trip: TripWithStops; days: string[]; index: number; day: string; now: string }) {
  const lodgings = useQuery({ queryKey: ['lodgings', t.id], queryFn: () => api.listLodgings(t.id) })
  const legs = useQuery({ queryKey: ['legs', t.id], queryFn: () => api.listLegDetails(t.id) })
  const airports = useAirportMap(t.stops.map((s) => s.to_airport))
  const logistics = useMemo(() => dayLogistics(t, lodgings.data ?? [], legs.data ?? [], airports), [t, lodgings.data, legs.data, airports])
  const sightsOf = (d: string) => orderDay(t.sights.filter((s) => sightDay(s, t.stops, days) === d))
  const sights = sightsOf(day)
  const items = timeline(sights, logistics.get(day) ?? [])
  const nextIdx = nextUp(items, now)
  const hops = useDayHops(sights)
  const hopTo = new Map(hops.map((h) => [h.to.id, h]))
  const info = dayInfo(t.stops, day)
  const stop = info.stop
  const tonight = lodgingTonight(lodgings.data ?? [], stop, day)
  const tomorrow = addDays(day, 1)
  const last = index === days.length - 1
  const update = useTravelMutation(({ id, done }: { id: string; done: boolean }) => api.updateSight(id, { done }))
  const toggle = (s: Sight) => update.mutate({ id: s.id, done: !s.done })
  const tab = (name: string) => `/app/viajes/${t.id}?tab=${name}`

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <Eyebrow>
          Hoy · día {index + 1} de {days.length}
        </Eyebrow>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="headline-lg flex items-center gap-2">
              {stop && <Flag code={stop.country_code} />}
              <span className="truncate">{info.travel === 'out' && info.next ? `Rumbo a ${info.next.name}` : info.travel === 'back' ? 'Vuelta a casa' : (stop?.name ?? t.title)}</span>
            </h1>
            <p className="mt-1 text-ink-soft">
              <span className="capitalize">{weekday(day)}</span>, {formatDay(day, false)} ·{' '}
              <Link to={`/app/viajes/${t.id}`} className="font-semibold text-ink hover:underline">
                {t.title}
              </Link>
            </p>
          </div>
          {stop && <WeatherChip lat={(info.next ?? stop).lat} lon={(info.next ?? stop).lon} date={day} />}
        </div>
      </header>

      <NowCard trip={t} stop={info.next ?? stop} items={items} index={nextIdx} hop={nextIdx >= 0 && items[nextIdx].kind === 'sight' ? hopTo.get(items[nextIdx].item.id) : undefined} onDone={toggle} busy={update.isPending} planHref={tab('dias')} />

      {items.length > 0 && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="headline-sm uppercase">El plan de hoy</h2>
            <Link to={tab('dias')} className="label-code text-accent-deep hover:underline">
              Editar
            </Link>
          </div>
          <ol className="space-y-1">
            {items.map((x, i) => (
              <TimelineRow key={x.kind === 'sight' ? x.item.id : `l-${i}`} entry={x} hop={x.kind === 'sight' ? hopTo.get(x.item.id) : undefined} next={i === nextIdx} past={nextIdx === -1 || i < nextIdx} onToggle={toggle} />
            ))}
          </ol>
        </section>
      )}

      {tonight && <Tonight lodging={tonight} stop={stop} last={last} />}

      <Tomorrow day={tomorrow} last={last} logistics={logistics.get(tomorrow) ?? []} sights={last ? [] : sightsOf(tomorrow)} stop={last ? undefined : dayInfo(t.stops, tomorrow).stop} href={tab('dias')} />

      <nav aria-label="Atajos del viaje" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['gastos', 'payments', 'Apuntar gasto'],
            ['fotos', 'photo_camera', 'Subir fotos'],
            ['dias', 'event_note', 'Día a día'],
            ['documentos', 'description', 'Documentos'],
          ] as const
        ).map(([id, icon, label]) => (
          <Link key={id} to={tab(id)} className="flex flex-col items-center gap-1 rounded-md bg-card p-3 text-center text-sm font-semibold shadow-[var(--shadow-card)] hover:bg-surface-low">
            <Icon name={icon} className="text-accent" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

/** Lo que toca ahora: el siguiente sitio (cómo llegar, marcarlo como visto) o el siguiente horario del día. */
function NowCard({
  trip: t,
  stop,
  items,
  index,
  hop,
  onDone,
  busy,
  planHref,
}: {
  trip: TripWithStops
  stop: Stop | undefined
  items: TimelineItem[]
  index: number
  hop?: Hop<Sight>
  onDone: (s: Sight) => void
  busy: boolean
  planHref: string
}) {
  const box = 'rounded-md bg-ink p-5 text-paper shadow-[var(--shadow-card)]'
  if (!items.some((x) => x.kind === 'sight' && !isNote(x.item)) && index === -1)
    return (
      <section className={box}>
        <div className="label-stamp text-paper/70">Ahora</div>
        <p className="mt-1 font-display text-xl font-semibold">Nada planeado para hoy</p>
        <p className="mt-1 text-sm text-paper/80">Apunta lo que quieres ver y aquí tendrás el siguiente sitio, cómo llegar y cuánto se tarda.</p>
        <Link to={planHref} className="btn btn-accent mt-4">
          <Icon name="add_location_alt" size={18} /> Planear el día
        </Link>
      </section>
    )
  if (index === -1)
    return (
      <section className={box}>
        <div className="label-stamp text-paper/70">Ahora</div>
        <p className="mt-1 flex items-center gap-2 font-display text-xl font-semibold">
          <Icon name="task_alt" className="text-accent" /> Día completado
        </p>
        <p className="mt-1 text-sm text-paper/80">Has visto todo lo que tenías para hoy. Abajo tienes dónde duermes y lo de mañana.</p>
      </section>
    )
  const x = items[index]
  if (x.kind === 'logistic')
    return (
      <section className={box}>
        <div className="label-stamp text-paper/70">A continuación</div>
        <p className="mt-1 flex items-center gap-2 font-display text-xl font-semibold">
          <Icon name={x.item.icon} className="text-accent" /> {x.item.title}
        </p>
        <p className="mt-1 text-paper/80">
          {x.item.estimated ? 'Hacia las ' : 'A las '}
          <b className="text-paper">{x.item.time}</b>
          {x.item.detail && ` · ${x.item.detail}`}
        </p>
      </section>
    )
  const s = x.item
  return (
    <section className={box}>
      <div className="label-stamp text-paper/70">{s.time ? `Siguiente · ${s.time.slice(0, 5)}` : 'Siguiente'}</div>
      <p className="mt-1 font-display text-2xl font-semibold leading-tight">{s.name}</p>
      {hop && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-paper/80">
          <span className="inline-flex items-center gap-1">
            <Icon name="directions_walk" size={16} className="text-accent" />
            {hop.routed ? '' : '≈'}
            {minutes(hop.walkMin)} andando desde {hop.from.name} · {distance(hop.km)}
          </span>
          {hop.transitMin != null && <span>o ≈{minutes(hop.transitMin)} en transporte</span>}
        </p>
      )}
      {s.notes && <p className="mt-2 text-sm text-paper/80">{s.notes}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={googleMapsDirections(s, stop, hop?.transitMin != null ? 'transit' : 'walking')} target="_blank" rel="noreferrer" className="btn btn-accent">
          <Icon name="near_me" size={18} /> Cómo llegar
        </a>
        <button type="button" className="btn border border-paper/30 text-paper hover:bg-paper/10" disabled={busy} onClick={() => onDone(s)}>
          <Icon name="check" size={18} /> Ya lo he visto
        </button>
        {s.wiki_url && (
          <a href={s.wiki_url} target="_blank" rel="noreferrer" className="btn border border-transparent text-paper/80 hover:text-paper">
            <Icon name="info" size={18} /> Más info
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-paper/60">
        {t.title} · {plural(items.filter((y) => y.kind === 'sight' && !isNote(y.item) && !y.item.done).length, 'sitio pendiente', 'sitios pendientes')} hoy
      </p>
    </section>
  )
}

function TimelineRow({ entry: x, hop, next, past, onToggle }: { entry: TimelineItem; hop?: Hop<Sight>; next: boolean; past: boolean; onToggle: (s: Sight) => void }) {
  const time = <span className={`w-12 shrink-0 pt-0.5 text-xs tabular-nums ${x.kind === 'logistic' && x.item.estimated ? 'text-accent-deep' : 'text-ink-soft'}`}>{x.time ? `${x.kind === 'logistic' && x.item.estimated ? '≈' : ''}${x.time}` : ''}</span>
  if (x.kind === 'logistic')
    return (
      <li className={`flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm ${next ? 'bg-accent-soft/50 ring-1 ring-accent' : past ? 'opacity-50' : ''}`}>
        {time}
        <Icon name={x.item.icon} size={16} className="mt-0.5 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="font-semibold">{x.item.title}</span>
          {x.item.detail && <span className="block text-xs text-ink-soft">{x.item.detail}</span>}
        </span>
      </li>
    )
  const s = x.item
  const note = isNote(s)
  return (
    <li>
      {hop && (
        <div className="ml-16 flex items-center gap-1 py-0.5 text-xs text-ink-soft">
          <Icon name={hop.transitMin != null ? 'directions_subway' : 'directions_walk'} size={14} className="text-accent" />
          {hop.transitMin != null ? `≈${minutes(hop.transitMin)} en transporte` : `${hop.routed ? '' : '≈'}${minutes(hop.walkMin)} andando · ${distance(hop.km)}`}
        </div>
      )}
      <div className={`flex items-center gap-2 rounded-sm px-2 py-1.5 ${next ? 'bg-accent-soft/50 ring-1 ring-accent' : ''}`}>
        {time}
        {note ? (
          <Icon name="sticky_note_2" size={18} className="shrink-0 text-ink-soft" />
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={s.done}
            aria-label={s.done ? `Desmarcar ${s.name}` : `Marcar ${s.name} como visto`}
            onClick={() => onToggle(s)}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${s.done ? 'border-accent bg-accent text-white' : 'border-ink hover:bg-surface-container'}`}
          >
            {s.done && <Icon name="check" size={14} />}
          </button>
        )}
        <span className={`min-w-0 flex-1 truncate ${note ? 'italic text-ink-soft' : s.done ? 'text-ink-soft line-through' : next ? 'font-semibold' : ''}`}>{s.name}</span>
      </div>
    </li>
  )
}

function Tonight({ lodging: l, stop, last }: { lodging: Lodging; stop: Stop | undefined; last: boolean }) {
  const located = l.lat != null && l.lon != null
  return (
    <section className="card flex items-start gap-3 p-4">
      <Icon name="hotel" className="mt-0.5 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="label-stamp text-ink-soft">{last ? 'Hasta la salida' : 'Esta noche duermes en'}</div>
        <div className="font-display text-lg font-semibold">{l.name}</div>
        {l.address && <div className="text-sm text-ink-soft">{l.address}</div>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft">
          {l.check_out && l.check_out_time && <span>Salida el {formatDay(l.check_out, false)} hasta las {l.check_out_time.slice(0, 5)}</span>}
          {l.booking_ref && (
            <span>
              Reserva <b className="font-mono text-ink">{l.booking_ref}</b>
            </span>
          )}
        </div>
      </div>
      {(located || l.address) && (
        <a href={googleMapsDirections({ name: l.name, lat: l.lat ?? null, lon: l.lon ?? null, address: located ? null : l.address }, stop, 'transit')} target="_blank" rel="noreferrer" className="btn btn-ghost shrink-0 px-3! py-1.5! text-sm">
          <Icon name="near_me" size={16} /> Volver
        </a>
      )}
    </section>
  )
}

function Tomorrow({ day, last, logistics, sights, stop, href }: { day: string; last: boolean; logistics: DayLogistic[]; sights: Sight[]; stop: Stop | undefined; href: string }) {
  const places = sights.filter((s) => !isNote(s))
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="headline-sm uppercase">
          Mañana <span className="font-normal normal-case text-ink-soft">· {weekday(day)}</span>
        </h2>
        {stop && <WeatherChip lat={stop.lat} lon={stop.lon} date={day} />}
      </div>
      {last && !logistics.length ? (
        <p className="text-sm text-ink-soft">Hoy es el último día del viaje.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {logistics.map((x, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`w-12 shrink-0 text-xs tabular-nums ${x.estimated ? 'text-accent-deep' : 'text-ink-soft'}`}>{x.time ? `${x.estimated ? '≈' : ''}${x.time}` : '—'}</span>
              <Icon name={x.icon} size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="font-semibold">{x.title}</span>
            </li>
          ))}
          {places.length > 0 ? (
            <li className="flex items-start gap-2">
              <span className="w-12 shrink-0" />
              <Icon name="place" size={16} className="mt-0.5 shrink-0 text-accent" />
              <span>
                {plural(places.length, 'sitio', 'sitios')}{stop ? ` en ${stop.name}` : ''}: {places.slice(0, 3).map((s) => s.name).join(', ')}
                {places.length > 3 && '…'}
              </span>
            </li>
          ) : (
            !last && (
              <li>
                <Link to={href} className="text-accent-deep hover:underline">
                  Aún no hay nada planeado: planear mañana
                </Link>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  )
}

function NoTripToday({ next }: { next: { trip: TripWithStops; inDays: number } | null }) {
  if (!next)
    return (
      <Empty icon="today" title="Hoy no estás de viaje">
        <p className="mt-1 text-ink-soft">Cuando estés de viaje, aquí verás qué toca ahora, cómo llegar y dónde duermes.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link to="/app/viajes/nuevo?plan=1" className="btn btn-accent">
            <Icon name="event_upcoming" size={18} /> Planificar un viaje
          </Link>
          <Link to="/app/bitacora" className="btn btn-ghost">
            Bitácora
          </Link>
        </div>
      </Empty>
    )
  const { trip: t, inDays } = next
  const first = t.stops[1] ?? t.stops[0]
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Eyebrow>Hoy no estás de viaje</Eyebrow>
      <section className="rounded-md bg-ink p-6 text-paper shadow-[var(--shadow-card)]">
        <div className="label-stamp text-paper/70">Tu próximo viaje</div>
        <p className="mt-1 font-display text-4xl font-bold">{inDays === 1 ? 'Mañana' : `Faltan ${inDays} días`}</p>
        <p className="mt-1 text-lg">
          {t.title}
          {t.start_date && <span className="text-paper/70"> · {formatDay(t.start_date)}</span>}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/app/viajes/${t.id}`} className="btn btn-accent">
            Abrir el viaje
          </Link>
          {first && t.start_date && <WeatherChip lat={first.lat} lon={first.lon} date={t.start_date} />}
        </div>
      </section>
      <nav aria-label="Antes de salir" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['equipaje', 'luggage', 'Equipaje'],
            ['documentos', 'description', 'Documentos'],
            ['dias', 'event_note', 'Día a día'],
            ['gastos', 'payments', 'Presupuesto'],
          ] as const
        ).map(([id, icon, label]) => (
          <Link key={id} to={`/app/viajes/${t.id}?tab=${id}`} className="flex flex-col items-center gap-1 rounded-md bg-card p-3 text-center text-sm font-semibold shadow-[var(--shadow-card)] hover:bg-surface-low">
            <Icon name={icon} className="text-accent" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
