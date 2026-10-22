import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRangeField, TimeField, formatDay } from './DatePicker'
import { Icon } from './Icon'
import { useDragOrder } from './useDragOrder'
import { WeatherChip } from './Weather'
import { Flag, plural } from './ui'
import { WorldMap } from './LazyWorldMap'
import type { NewSight } from '../lib/api/types'
import { api } from '../lib/api'
import { dayLogistics, type DayLogistic } from '../lib/arrival'
import { isNote, type Sight, type Stop, type TripWithStops } from '../lib/db'
import { useAirportMap } from '../lib/hooks'
import { dayInfo, orderDay, reorderDay, setDayTime, sightDay, tripDays, weekday, type DayInfo, type DayPatch } from '../lib/days'
import { googleMapsDayLinks } from '../lib/googleMaps'
import { dayHops, dayPoints, dayTotals, distance, minutes, routeLegs, type Hop } from '../lib/hops'
import { searchSights, suggestSights, type SightSuggestion } from '../lib/sights'

export interface DayPlanOps {
  add: (stopId: string, s: NewSight) => void
  update: (id: string, patch: Partial<Pick<Sight, 'name' | 'done' | 'position' | 'day' | 'time' | 'stop_id'>>) => void
  remove: (id: string) => void
}

/** Viaje de mentira para dibujar en el mapa los sitios de un día (y su ciudad si aún no hay ninguno). */
function dayMapTrip(trip: TripWithStops, info: DayInfo | undefined, sights: Sight[]): TripWithStops {
  const pts = sights.filter((s): s is Sight & { lat: number; lon: number } => s.lat != null && s.lon != null)
  const base = info?.stop
  const stops: Stop[] = (pts.length ? pts.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon, id: s.id })) : base ? [{ name: base.name, lat: base.lat, lon: base.lon, id: base.id }] : []).map((p, i) => ({
    id: `d-${p.id}`,
    trip_id: trip.id,
    user_id: null,
    position: i,
    name: p.name,
    country_code: base?.country_code ?? 'XX',
    region_code: null,
    province_code: null,
    lat: p.lat,
    lon: p.lon,
    arrived_on: null,
    notes: null,
    rating: null,
    tags: [],
    song_url: null,
    transport_in: i ? 'walk' : null,
    from_airport: null,
    to_airport: null,
  }))
  return { ...trip, id: `${trip.id}-day`, stops, photos: [], sights: [] }
}

/**
 * Plan día a día (estilo Wanderlog): una tarjeta por día del viaje con la ciudad en la que se está, el
 * tiempo y los sitios a ver (o vistos), con hora opcional, orden y casilla. Los sitios se buscan en
 * Wikipedia cerca de la ciudad, se añaden de las ideas o se escriben.
 */
export function DayPlan({ trip, ops, editable = true, onSetDates }: { trip: TripWithStops; ops: DayPlanOps; editable?: boolean; onSetDates?: (start: string | null, end: string | null) => void }) {
  const planned = trip.status === 'planned'
  const days = useMemo(() => tripDays(trip), [trip])
  const infos = useMemo(() => days.map((d) => dayInfo(trip.stops, d)), [days, trip.stops])
  const byDay = useMemo(() => {
    const m = new Map<string, Sight[]>()
    for (const s of trip.sights) {
      const d = sightDay(s, trip.stops, days)
      if (d) m.set(d, [...(m.get(d) ?? []), s])
    }
    for (const [d, list] of m) m.set(d, orderDay(list))
    return m
  }, [trip.sights, trip.stops, days])
  // Vuelos, trenes y alojamientos (los mismos datos que «Alojamiento y transporte»): horarios de cada día y a qué
  // hora más o menos se llega al alojamiento. Sin acceso (no participante), las listas llegan vacías.
  const lodgings = useQuery({ queryKey: ['lodgings', trip.id], queryFn: () => api.listLodgings(trip.id) })
  const legs = useQuery({ queryKey: ['legs', trip.id], queryFn: () => api.listLegDetails(trip.id) })
  const airports = useAirportMap(trip.stops.map((s) => s.to_airport))
  const logistics = useMemo(() => dayLogistics(trip, lodgings.data ?? [], legs.data ?? [], airports), [trip, lodgings.data, legs.data, airports])
  const [active, setActive] = useState<string | null>(null)
  const current = active && days.includes(active) ? active : (days.find((_, i) => !infos[i].travel) ?? days[0])
  const refs = useRef(new Map<string, HTMLElement>())

  if (!trip.stops.length)
    return <p className="rounded-md bg-surface-low p-6 text-ink-soft">Primero añade la ruta: las ciudades en las que vas a estar.</p>
  if (!days.length)
    return (
      <div className="rounded-md bg-surface-low p-5">
        <p className="mb-3">Pon las fechas del viaje para organizarlo día a día.</p>
        {onSetDates ? <DateRangeField start={null} end={null} onChange={onSetDates} /> : null}
      </div>
    )

  const ci = days.indexOf(current)
  const currentSights = byDay.get(current) ?? []
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0">
        {/* Saltar a un día */}
        <nav aria-label="Días" className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-1 mb-4 flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-card/95 px-1 py-2 backdrop-blur [scrollbar-width:none]">
          {days.map((d, i) => {
            const n = byDay.get(d)?.length ?? 0
            return (
              <button
                key={d}
                type="button"
                aria-current={d === current ? 'date' : undefined}
                onClick={() => {
                  setActive(d)
                  refs.current.get(d)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${d === current ? 'bg-ink text-paper' : 'bg-surface-low text-ink-soft hover:text-ink'}`}
              >
                Día {i + 1}
                {n > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${d === current ? 'bg-accent text-white' : 'bg-surface-container'}`}>{n}</span>}
              </button>
            )
          })}
        </nav>

        <ol className="space-y-4">
          {days.map((d, i) => (
            <li
              key={d}
              ref={(el) => {
                if (el) refs.current.set(d, el)
              }}
              className="scroll-mt-32"
              onMouseEnter={() => setActive(d)}
              onFocusCapture={() => setActive(d)}
            >
              <DayCard
                n={i + 1}
                info={infos[i]}
                sights={byDay.get(d) ?? []}
                logistics={logistics.get(d) ?? []}
                allNames={new Set(trip.sights.map((s) => s.name.toLowerCase()))}
                days={days}
                infos={infos}
                planned={planned}
                editable={editable}
                ops={ops}
                active={d === current}
              />
            </li>
          ))}
        </ol>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-md bg-surface-low p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="font-display font-semibold">
              Día {ci + 1} · {infos[ci]?.stop?.name}
            </span>
            <span className="label-code text-ink-soft">{plural(currentSights.length, 'sitio', 'sitios')}</span>
          </div>
          {infos[ci]?.stop && <GoogleMapsDay sights={currentSights} stop={infos[ci].stop} compact />}
          <WorldMap className="h-[460px] shadow-none!" trips={[dayMapTrip(trip, infos[ci], currentSights)]} airports={new Map()} numbered base="modern" maxZoom={15} controls={false} telemetry={false} legend={false} routeLink={false} />
        </div>
      </aside>
    </div>
  )
}

/**
 * Abre en Google Maps los sitios del día en el orden del plan: uno, como búsqueda; varios, como ruta a pie
 * (en Google Maps se puede cambiar a transporte público o coche). Con más de 11 sitios, en varias partes.
 */
function GoogleMapsDay({ sights, stop, compact = false }: { sights: Sight[]; stop: Stop; compact?: boolean }) {
  const links = googleMapsDayLinks(sights, stop)
  if (!links.length) return null
  const label = sights.length === 1 ? 'Ver en Google Maps' : 'Ruta del día en Google Maps'
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'mb-2 px-1' : 'mt-3'}`}>
      {links.map((href, i) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={compact ? 'label-code flex items-center gap-1 text-accent-deep hover:underline' : 'btn btn-ghost px-3! py-1.5! text-sm'}
        >
          <Icon name="directions_walk" size={compact ? 14 : 18} className="text-accent" />
          {links.length > 1 ? `${label} · parte ${i + 1}` : label}
          <Icon name="open_in_new" size={compact ? 12 : 14} className="text-ink-soft" />
        </a>
      ))}
    </div>
  )
}

function DayCard({
  n,
  info,
  sights,
  logistics,
  allNames,
  days,
  infos,
  planned,
  editable,
  ops,
  active,
}: {
  n: number
  info: DayInfo
  sights: Sight[]
  logistics: DayLogistic[]
  allNames: Set<string>
  days: string[]
  infos: DayInfo[]
  planned: boolean
  editable: boolean
  ops: DayPlanOps
  active: boolean
}) {
  const { day, stop, travel, next } = info
  const [openTravel, setOpenTravel] = useState(false)
  const showAdd = editable && stop && (!travel || openTravel || sights.length > 0)
  const places = sights.filter((s) => !isNote(s))
  const done = places.filter((s) => s.done).length
  // Número de cada sitio sin contar las notas.
  const numberOf = new Map(places.map((s, i) => [s.id, i + 1]))
  const apply = (patches: DayPatch[]) => patches.forEach(({ id, ...patch }) => ops.update(id, patch))
  // Arrastrar (o Subir/Bajar): el orden lo decides tú y las horas se quedan en su sitio (src/lib/days.ts).
  const reorder = (from: number, to: number) => to >= 0 && to < sights.length && apply(reorderDay(sights, from, to))
  const drag = useDragOrder(editable ? sights.length : 0, reorder, { card: '[data-sight-card]' })
  // Trayectos entre sitios: estimación al momento y, con red, la ruta a pie real (src/lib/hops.ts).
  const pairs = dayPoints(sights)
  const pairsKey = pairs.map(([a, b]) => `${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}`).join('|')
  const route = useQuery({
    queryKey: ['walk-route', pairsKey],
    queryFn: ({ signal }) => routeLegs(pairs, signal),
    enabled: pairs.length > 0,
    staleTime: Infinity,
    gcTime: 30 * 86_400_000,
    retry: false,
  })
  const hops = dayHops(sights, route.data)
  const hopTo = new Map(hops.map((h) => [h.to.id, h]))
  const totals = dayTotals(hops)
  const toDay = (s: Sight, d: string) => {
    const target = infos.find((x) => x.day === d)?.stop
    ops.update(s.id, { day: d, ...(target && target.id !== s.stop_id ? { stop_id: target.id } : {}) })
  }

  return (
    <section className={`rounded-md border bg-card p-4 transition md:p-5 ${active ? 'border-ink/30 shadow-[var(--shadow-card)]' : 'border-surface-highest'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display font-bold text-paper ${travel ? 'bg-outline' : 'bg-ink'}`}>{n}</span>
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold capitalize">
              {weekday(day)} <span className="font-normal normal-case text-ink-soft">· {formatDay(day)}</span>
            </div>
            <div className="flex items-center gap-1.5 truncate text-sm text-ink-soft">
              {stop && <Flag code={stop.country_code} />}
              {travel === 'out' ? (
                <>
                  Salida desde {stop?.name}
                  {next && (
                    <>
                      {' '}
                      <Icon name="arrow_forward" size={14} /> {next.name}
                    </>
                  )}
                </>
              ) : travel === 'back' ? (
                <>
                  <Icon name="home" size={14} /> Vuelta a casa · {stop?.name}
                </>
              ) : (
                stop?.name
              )}
            </div>
          </div>
        </div>
        <span className="flex items-center gap-2">
          {planned && places.length > 0 && (
            <span className="label-stamp text-ink-soft">
              {done}/{places.length} vistos
            </span>
          )}
          {stop && !travel && <WeatherChip lat={stop.lat} lon={stop.lon} date={day} />}
        </span>
      </div>

      {logistics.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-accent/40 pl-3" aria-label="Transporte y alojamiento">
          {logistics.map((x, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`w-12 shrink-0 pt-0.5 text-xs tabular-nums ${x.estimated ? 'text-accent-deep' : 'text-ink-soft'}`}>
                {x.time ? `${x.estimated ? '≈' : ''}${x.time}` : '—'}
              </span>
              <Icon name={x.icon} size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="font-semibold">{x.title}</span>
                {x.detail && <span className="block text-xs text-ink-soft">{x.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {sights.length > 0 && (
        <ol className="mt-3 space-y-1.5" ref={drag.list}>
          {sights.map((s, i) => (
            <SightRow
              key={s.id}
              handle={editable ? drag.handle(i) : null}
              dragStyle={drag.style(i)}
              dragging={drag.state?.from === i}
              settling={!!drag.state && drag.state.from !== i}
              sight={s}
              hop={hopTo.get(s.id)}
              stop={stop}
              index={i}
              number={numberOf.get(s.id) ?? 0}
              total={sights.length}
              planned={planned}
              editable={editable}
              days={days}
              onToggle={() => ops.update(s.id, { done: !s.done })}
              onTime={(time) => apply(setDayTime(sights, s.id, time))}
              onRename={(name) => ops.update(s.id, { name })}
              onMove={(dir) => reorder(i, i + dir)}
              onDay={(d) => toDay(s, d)}
              onRemove={() => ops.remove(s.id)}
            />
          ))}
        </ol>
      )}
      {hops.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Icon name={totals.walkMin > 0 ? 'directions_walk' : 'directions_subway'} size={14} className="text-accent" />
            {hops.some((h) => !h.routed) ? '≈' : ''}
            {minutes(totals.minutes)} de trayectos en el día
          </span>
          {totals.walkMin > 0 && <span>{distance(totals.km)} andando</span>}
          {totals.transitMin > 0 && totals.walkMin > 0 && <span>{minutes(totals.transitMin)} en transporte</span>}
          {hops.some((h) => h.tight != null) && (
            <span className="inline-flex items-center gap-1 font-semibold text-red-700">
              <Icon name="warning" size={14} /> {plural(hops.filter((h) => h.tight != null).length, 'trayecto no cabe', 'trayectos no caben')} en las horas apuntadas
            </span>
          )}
        </p>
      )}
      {stop && <GoogleMapsDay sights={places} stop={stop} />}

      {showAdd && stop ? (
        <div className="mt-3">
          <SightPicker
            lat={stop.lat}
            lon={stop.lon}
            city={stop.name}
            taken={allNames}
            placeholder={planned ? `¿Qué vas a ver en ${stop.name}?` : `¿Qué visitaste en ${stop.name}?`}
            onAdd={(x) => ops.add(stop.id, { ...x, day, done: !planned, position: sights.length })}
          />
          <NoteAdder onAdd={(name) => ops.add(stop.id, { name, kind: 'note', day, done: false, position: sights.length })} />
        </div>
      ) : editable && travel && stop ? (
        <button type="button" className="mt-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink" onClick={() => setOpenTravel(true)}>
          <Icon name="add" size={16} /> Añadir algo este día
        </button>
      ) : null}
    </section>
  )
}

function SightRow({
  handle,
  dragStyle,
  dragging,
  settling,
  sight: s,
  hop,
  stop,
  index,
  number,
  total,
  planned,
  editable,
  days,
  onToggle,
  onTime,
  onRename,
  onMove,
  onDay,
  onRemove,
}: {
  /** Asa para arrastrar (useDragOrder) y cómo se mueve la fila mientras tanto. */
  handle: React.ReactNode
  dragStyle?: React.CSSProperties
  dragging: boolean
  settling: boolean
  sight: Sight
  /** Trayecto desde el sitio anterior hasta este. */
  hop?: Hop<Sight>
  stop?: Stop
  index: number
  /** Número del sitio en el día (las notas no cuentan). */
  number: number
  total: number
  planned: boolean
  editable: boolean
  days: string[]
  onToggle: () => void
  onTime: (t: string | null) => void
  onRename: (n: string) => void
  onMove: (dir: -1 | 1) => void
  onDay: (d: string) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(s.name)
  const [menu, setMenu] = useState(false)
  useEffect(() => setName(s.name), [s.name])
  const note = isNote(s)
  return (
    <li style={dragStyle} className={dragging ? 'relative z-20' : settling ? 'transition-transform duration-150' : ''}>
      {hop && <HopLine hop={hop} stop={stop} faded={dragging || settling} />}
      <div data-sight-card className={`rounded-sm px-2 py-1.5 ${note ? 'border border-dashed border-outline-soft bg-card' : 'bg-surface-low'} ${dragging ? 'shadow-2xl ring-2 ring-accent' : ''}`}>
        <div className="flex items-center gap-1.5">
          {handle}
          {note ? (
            <span className="grid h-7 w-7 shrink-0 place-items-center text-ink-soft" aria-label="Nota">
              <Icon name="sticky_note_2" size={18} />
            </span>
          ) : planned ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={s.done}
              disabled={!editable}
              onClick={onToggle}
              aria-label={s.done ? `Desmarcar ${s.name}` : `Marcar ${s.name} como visto`}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition ${s.done ? 'border-accent bg-accent text-white' : 'border-ink text-ink hover:bg-surface-container'}`}
            >
              {s.done ? <Icon name="check" size={16} /> : number}
            </button>
          ) : (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">{number}</span>
          )}
          {editable ? (
            <TimeField value={s.time ?? null} label={`Hora de ${s.name}`} onChange={(t) => t !== (s.time?.slice(0, 5) ?? null) && onTime(t)} />
          ) : (
            s.time && <span className="w-12 shrink-0 text-xs tabular-nums text-ink-soft">{s.time.slice(0, 5)}</span>
          )}
          {editable ? (
            <input
              aria-label={note ? 'Nota' : 'Sitio'}
              className={`min-w-0 flex-1 rounded-xs bg-transparent px-1 py-1 outline-none focus:bg-card ${note ? 'italic text-ink-soft' : planned && s.done ? 'text-ink-soft line-through' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== s.name && onRename(name.trim().slice(0, 160))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <span className={`min-w-0 flex-1 truncate ${note ? 'italic text-ink-soft' : planned && s.done ? 'text-ink-soft line-through' : ''}`}>{s.name}</span>
          )}
          {s.wiki_url && (
            <a href={s.wiki_url} target="_blank" rel="noreferrer" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-container hover:text-ink" aria-label={`${s.name} en Wikipedia`}>
              <Icon name="open_in_new" size={16} />
            </a>
          )}
          {editable && (
            <button type="button" aria-label={`Opciones de ${s.name}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-container hover:text-ink">
              <Icon name="more_vert" size={18} />
            </button>
          )}
        </div>
        {menu && editable && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-surface-highest pt-1.5 text-sm">
            <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 ring-1 ring-outline-soft disabled:opacity-30">
              <Icon name="arrow_upward" size={14} /> Subir
            </button>
            <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 ring-1 ring-outline-soft disabled:opacity-30">
              <Icon name="arrow_downward" size={14} /> Bajar
            </button>
            <label className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 ring-1 ring-outline-soft">
              <Icon name="event" size={14} /> Pasar al
              <select
                aria-label="Pasar a otro día"
                className="bg-transparent outline-none"
                value=""
                onChange={(e) => {
                  if (e.target.value) onDay(e.target.value)
                  setMenu(false)
                }}
              >
                <option value="">día…</option>
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    Día {i + 1} · {formatDay(d, false)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={onRemove} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-red-700 hover:bg-red-50">
              <Icon name="delete" size={14} /> Quitar
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Entre dos sitios: «12 min andando · 950 m» (abre el tramo en Google Maps); si andando es mucho, también en
 * transporte; y un aviso si las horas apuntadas no dan para llegar.
 */
function HopLine({ hop, stop, faded }: { hop: Hop<Sight>; stop?: Stop; faded: boolean }) {
  const approx = hop.routed ? '' : '≈'
  const near = hop.walkMin <= 2
  const link = (mode: 'walking' | 'transit') => googleMapsDayLinks([hop.from, hop.to], stop, mode)[0]
  return (
    <div className={`mb-1 ml-5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-l-2 border-dotted border-outline-soft py-0.5 pl-4 text-xs text-ink-soft transition-opacity ${faded ? 'opacity-30' : ''}`}>
      <a href={link('walking')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink hover:underline" title={`De ${hop.from.name} a ${hop.to.name} andando, en Google Maps`}>
        <Icon name="directions_walk" size={14} className="text-accent" />
        {near ? 'Al lado' : `${approx}${minutes(hop.walkMin)} andando`} · {distance(hop.km)}
      </a>
      {hop.transitMin != null && (
        <a href={link('transit')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink hover:underline" title={`De ${hop.from.name} a ${hop.to.name} en transporte, en Google Maps`}>
          <Icon name="directions_subway" size={14} className="text-accent" />≈{minutes(hop.transitMin)} en metro, bus o taxi
        </a>
      )}
      {hop.tight != null && (
        <span className="inline-flex items-center gap-1 font-semibold text-red-700">
          <Icon name="warning" size={14} />
          {hop.tight === 0 ? 'No da tiempo: misma hora que el anterior' : `No da tiempo: solo ${minutes(hop.tight)} desde las ${hop.from.time!.slice(0, 5)}`}
        </span>
      )}
    </div>
  )
}

/** «+ Nota»: un apunte entre sitios (descanso, comida, «cerveza en la terraza»…), con su hora y su orden. */
function NoteAdder({ onAdd }: { onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const save = () => {
    const t = text.trim().slice(0, 160)
    if (t) onAdd(t)
    setText('')
    setOpen(false)
  }
  if (!open)
    return (
      <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink" onClick={() => setOpen(true)}>
        <Icon name="sticky_note_2" size={16} /> Añadir una nota (descanso, comida…)
      </button>
    )
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input
        autoFocus
        aria-label="Nota"
        className="field min-w-0 flex-1 py-2!"
        placeholder="Descanso + cerveza en la terraza"
        maxLength={160}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      <button className="btn btn-dark shrink-0" disabled={!text.trim()}>
        Añadir
      </button>
    </form>
  )
}

/** Buscador de sitios cerca de una ciudad (Wikipedia), con ideas y texto libre. */
export function SightPicker({ lat, lon, city, taken, placeholder, onAdd }: { lat: number; lon: number; city: string; taken: Set<string>; placeholder: string; onAdd: (s: NewSight) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SightSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [ideas, setIdeas] = useState<SightSuggestion[] | null>(null)
  const [ideasError, setIdeasError] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setSearching(true)
      searchSights(q, lat, lon, ctrl.signal)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, lat, lon])

  useEffect(() => {
    if (!ideasOpen || ideas) return
    setIdeasError(false)
    suggestSights(lat, lon, city)
      .then(setIdeas)
      .catch(() => setIdeasError(true))
  }, [ideasOpen, ideas, lat, lon, city])

  const pick = (s: SightSuggestion) => {
    onAdd({ name: s.title, lat: s.lat, lon: s.lon, wiki_url: s.url ?? null })
    setQ('')
    setResults([])
  }
  const free = () => {
    const name = q.trim().slice(0, 160)
    if (!name) return
    onAdd({ name })
    setQ('')
    setResults([])
  }

  return (
    <div>
      <div className="relative">
        <div className="flex items-center gap-2 rounded-sm bg-surface-low px-3 ring-1 ring-outline-soft focus-within:bg-card focus-within:ring-2 focus-within:ring-ink">
          <Icon name="add_location_alt" size={18} className="text-accent" />
          <input
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            value={q}
            placeholder={placeholder}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !q.trim()) return
              e.preventDefault()
              const first = results[0]
              if (first && first.title.toLowerCase().startsWith(q.trim().toLowerCase())) pick(first)
              else free()
            }}
          />
          {searching && <Icon name="sync" size={16} className="animate-spin text-ink-soft" />}
        </div>
        {q.trim().length >= 2 && (results.length > 0 || !searching) && (
          <ul className="card absolute z-40 mt-1 max-h-72 w-full overflow-auto p-1">
            {results.map((r) => (
              <li key={r.title}>
                <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-low">
                  <Icon name="location_on" size={16} className="mt-0.5 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.title}</span>
                    {r.description && <span className="block truncate text-xs text-ink-soft">{r.description}</span>}
                  </span>
                  <span className="label-stamp shrink-0 text-ink-soft">{r.km < 1 ? '<1 km' : `${Math.round(r.km).toLocaleString('es-ES')} km`}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={free} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-low">
                <Icon name="edit" size={16} /> Añadir «{q.trim()}» tal cual
              </button>
            </li>
          </ul>
        )}
      </div>
      <div className="mt-2">
        {!ideasOpen ? (
          <button type="button" onClick={() => setIdeasOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep hover:underline">
            <Icon name="auto_awesome" size={16} /> Ideas en {city}
          </button>
        ) : ideasError ? (
          <p className="text-sm text-ink-soft">
            No se pudieron cargar las ideas.{' '}
            <button type="button" className="font-semibold underline" onClick={() => setIdeas(null)}>
              Reintentar
            </button>
          </p>
        ) : !ideas ? (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <Icon name="sync" size={16} className="animate-spin" /> Buscando sitios conocidos…
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {ideas
              .filter((s) => !taken.has(s.title.toLowerCase()))
              .slice(0, 10)
              .map((s) => (
                <button key={s.title} type="button" onClick={() => pick(s)} title={s.description} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-outline-soft transition hover:ring-ink">
                  <Icon name="add" size={14} className="text-accent" /> {s.title}
                </button>
              ))}
            <span className="text-[11px] text-ink-soft">
              Ideas de{' '}
              <a href="https://es.wikipedia.org" target="_blank" rel="noreferrer" className="underline">
                Wikipedia
              </a>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
