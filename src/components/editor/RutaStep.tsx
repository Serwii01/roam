import { useEffect, useState, type ReactNode } from 'react'
import { ask } from '../ConfirmDialog'
import { Link } from 'react-router-dom'
import { AirportInput } from '../AirportInput'
import { DateField, formatDay } from '../DatePicker'
import { AddFlight, FlightField } from '../FlightLookup'
import { Icon } from '../Icon'
import { useDragOrder } from '../useDragOrder'
import { PlaceSearch } from '../PlaceSearch'
import { Flag, plural } from '../ui'
import { WorldMap } from '../LazyWorldMap'
import { isNote, type Sight, type Stop, type TripWithStops } from '../../lib/db'
import type { FlightRoute } from '../../lib/flights'
import type { Place } from '../../lib/geocode'
import { isReturnHome } from '../../lib/days'
import { useAirportMap } from '../../lib/hooks'
import { formatKm, legKm, tripKm } from '../../lib/stats'
import { TRANSPORT, TRANSPORT_MODES } from '../../lib/transport'

export function RutaStep({
  trip,
  airports,
  planned,
  range,
  busy,
  onAdd,
  onChange,
  onRemove,
  onMove,
  onSpread,
  onAddFlight,
  onEditDates,
  home,
}: {
  trip: TripWithStops | undefined | null
  airports: ReturnType<typeof useAirportMap>
  planned: boolean
  range: [string | null, string | null]
  busy: string | null
  onAdd: (p: Place) => void
  onChange: (id: string, patch: Partial<Stop>) => void
  onRemove: (id: string) => void
  /** Mueve la parada de la posición `from` a la `to`. */
  onMove: (from: number, to: number) => void
  onSpread: () => void
  onAddFlight: (route: FlightRoute, date: string | null) => void
  onEditDates: () => void
  home?: string
}) {
  const stops = trip?.stops ?? []
  const drag = useDragOrder(stops.length, onMove, { item: ':scope > li[data-stop-index]', card: '[data-stop-card]' })
  const [start, end] = range
  const undated = stops.filter((s) => !s.arrived_on).length
  // Las paradas nuevas heredan el día de la anterior: si todas comparten fecha en un viaje de varios días, conviene repartir.
  const sameDay = stops.length > 1 && undated === 0 && new Set(stops.map((s) => s.arrived_on)).size === 1 && !!start && !!end && start !== end

  return (
    <div>
      <h2 className="headline-md">{planned ? '¿Por dónde vas a ir?' : '¿Por dónde pasaste?'}</h2>
      <p className="mt-1 text-ink-soft">Añade las paradas en orden, desde donde sales. Puedes cambiar el transporte de cada tramo y reordenarlas.</p>

      {/* En el móvil, el mapa va aquí para ver la ruta mientras se añade */}
      {stops.length > 0 && (
        <div className="mt-5 lg:hidden">
          <RouteMap trip={trip} airports={airports} compact />
        </div>
      )}

      {stops.length === 0 ? (
        <div className="mt-6 rounded-md border-2 border-dashed border-outline-soft p-5 md:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent font-display font-bold text-white">1</span>
            <div>
              <div className="font-display text-lg font-semibold">¿Desde dónde sales?</div>
              <div className="text-sm text-ink-soft">Tu ciudad o el primer sitio del viaje.</div>
            </div>
          </div>
          <div className="mt-4">
            <PlaceSearch onPick={onAdd} home={home} placeholder="Madrid, Barcelona, tu pueblo…" autoFocus />
          </div>
          <div className="mt-4">
            <AddFlight defaultDate={start} onAdd={onAddFlight} busy={!!busy} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-surface-highest pt-4 text-sm">
            <span className="text-ink-soft">¿Ya hiciste el viaje?</span>
            <Link to="/app/importar" className="inline-flex items-center gap-1 font-semibold text-accent-deep hover:underline">
              <Icon name="photo_library" size={16} /> Crear la ruta desde tus fotos
            </Link>
            <span className="text-ink-soft">o</span>
            <Link to="/app/importar?de=google" className="inline-flex items-center gap-1 font-semibold text-accent-deep hover:underline">
              <Icon name="travel_explore" size={16} /> importar de Google Maps
            </Link>
          </div>
        </div>
      ) : (
        <>
          {start && end && stops.length > 1 && (undated > 0 || sameDay) && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm bg-surface-low px-4 py-3 text-sm">
              <Icon name="date_range" size={18} className="text-accent" />
              <span className="flex-1">
                {sameDay
                  ? 'Todas las paradas tienen el mismo día.'
                  : undated === stops.length
                    ? 'Las paradas no tienen fecha.' : `${plural(undated, 'parada no tiene', 'paradas no tienen')} fecha.`} Puedo repartir los días del viaje
                ({formatDay(start, false)} – {formatDay(end)}) entre ellas.
              </span>
              <button type="button" className="btn btn-dark py-1.5!" disabled={!!busy} onClick={onSpread}>
                Repartir fechas
              </button>
            </div>
          )}

          {stops.length > 1 && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-soft">
              <Icon name="drag_indicator" size={16} /> Arrastra una parada desde el asa para cambiar el orden.
            </p>
          )}
          <ol className="mt-3" ref={drag.list}>
            {stops.map((s, i) => (
              <li
                key={s.id}
                data-stop-index={i}
                className={drag.state?.from === i ? 'relative z-20' : drag.state ? 'transition-transform duration-150' : undefined}
                style={drag.style(i)}
              >
                {i > 0 && <Leg stop={s} km={legKm(stops, i, airports)} airports={airports} onChange={(patch) => onChange(s.id, patch)} />}
                <StopCard
                  stop={s}
                  index={i}
                  total={stops.length}
                  homeReturn={isReturnHome(stops, i)}
                  range={range}
                  planned={planned}
                  sights={trip?.sights.filter((x) => x.stop_id === s.id && !isNote(x)) ?? []}
                  photos={trip?.photos.filter((p) => p.stop_id === s.id).length ?? 0}
                  onChange={(patch) => onChange(s.id, patch)}
                  onRemove={() => onRemove(s.id)}
                  onMove={(dir) => onMove(i, i + dir)}
                  dragging={drag.state?.from === i}
                  handle={drag.handle(i)}
                />
              </li>
            ))}
          </ol>

          <div className="ml-5 h-6 border-l-2 border-dashed border-outline-soft" />
          <div className="rounded-md bg-surface-low p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-ink font-display font-bold">{stops.length + 1}</span>
              <div>
                <div className="font-display font-semibold">¿Y después?</div>
                <div className="text-sm text-ink-soft">Busca la siguiente parada. Para cerrar el viaje, vuelve a añadir tu ciudad.</div>
              </div>
            </div>
            <PlaceSearch onPick={onAdd} home={home} placeholder="Siguiente ciudad, pueblo o lugar…" autoFocus />
            <div className="mt-3">
              <AddFlight defaultDate={stops.at(-1)?.arrived_on ?? start} onAdd={onAddFlight} busy={!!busy} />
            </div>
          </div>
          {!start && (
            <button type="button" onClick={onEditDates} className="mt-3 text-sm text-ink-soft hover:text-ink">
              <Icon name="calendar_today" size={14} /> Pon las fechas del viaje para marcar los días en las paradas
            </button>
          )}
        </>
      )}
      {busy && (
        <div className="label-code mt-3 flex items-center gap-2 text-accent-deep">
          <Icon name="sync" size={16} className="animate-spin" /> {busy}…
        </div>
      )}
    </div>
  )
}

/** Tramo entre dos paradas: el medio de transporte (con nombre) y, en avión, los aeropuertos. */
function Leg({ stop, km, airports, onChange }: { stop: Stop; km: number; airports: ReturnType<typeof useAirportMap>; onChange: (patch: Partial<Stop>) => void }) {
  const [open, setOpen] = useState(false)
  const mode = stop.transport_in ?? 'car'
  return (
    <div className="ml-5 border-l-2 border-dashed border-outline-soft py-3 pl-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-outline-soft transition hover:ring-ink"
      >
        <Icon name={TRANSPORT[mode].icon} size={18} className="text-accent" />
        <span className="font-semibold">{TRANSPORT[mode].label}</span>
        <span className="text-ink-soft">· {formatKm(km)} km</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-ink-soft" />
      </button>
      {open && (
        <div className="mt-2 grid max-w-xl grid-cols-4 gap-1.5 sm:grid-cols-7">
          {TRANSPORT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                onChange({ transport_in: m })
                setOpen(false)
              }}
              className={`flex flex-col items-center gap-1 rounded-sm px-1 py-2 text-xs transition ${mode === m ? 'bg-ink text-paper' : 'bg-surface-low hover:bg-surface-container'}`}
            >
              <Icon name={TRANSPORT[m].icon} size={20} />
              {TRANSPORT[m].label}
            </button>
          ))}
        </div>
      )}
      {mode === 'plane' && (
        <div className="mt-2 flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          <AirportInput value={stop.from_airport} airport={airports.get(stop.from_airport ?? '')} placeholder="Aeropuerto de salida" onChange={(v) => onChange({ from_airport: v })} />
          <Icon name="flight" size={16} className="hidden rotate-90 text-accent sm:block" />
          <AirportInput value={stop.to_airport} airport={airports.get(stop.to_airport ?? '')} placeholder="Aeropuerto de llegada" onChange={(v) => onChange({ to_airport: v })} />
        </div>
      )}
      {mode === 'plane' && <FlightField key={stop.id} stop={stop} onChange={onChange} />}
    </div>
  )
}

function StopCard({
  stop: s,
  index: i,
  total,
  homeReturn,
  range,
  planned,
  sights,
  photos,
  onChange,
  onRemove,
  onMove,
  dragging,
  handle,
}: {
  stop: Stop
  index: number
  total: number
  homeReturn: boolean
  range: [string | null, string | null]
  planned: boolean
  sights: Sight[]
  photos: number
  onChange: (patch: Partial<Stop>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  dragging?: boolean
  handle?: ReactNode
}) {
  const [name, setName] = useState(s.name)
  useEffect(() => setName(s.name), [s.name])
  const label = i === 0 ? 'Salida' : homeReturn ? 'Vuelta a casa' : i === total - 1 && total > 1 ? 'Última parada' : `Parada ${i + 1}`
  return (
    <div data-stop-card className={`flex items-start gap-2 rounded-md bg-surface-low p-3 transition-shadow sm:items-center sm:gap-3 ${dragging ? 'shadow-[0_12px_32px_rgba(0,0,0,0.22)] ring-2 ring-accent' : ''}`}>
      {handle}
      <span className={`mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full font-display font-bold text-paper sm:mt-0 ${i === 0 || homeReturn ? 'bg-accent' : 'bg-ink'}`}>
        {homeReturn ? <Icon name="home" size={20} /> : i + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="label-stamp text-ink-soft">{label}</div>
        <input
          aria-label={`Nombre de la parada ${i + 1}`}
          className="w-full rounded-xs bg-transparent font-display text-lg font-semibold outline-none focus:bg-card focus:px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== s.name && onChange({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5">
            <Flag code={s.country_code} /> {[s.province_code, s.region_code].filter(Boolean).join(' · ') || s.country_code}
          </span>
          <DateField value={s.arrived_on} min={range[0]} max={range[1]} onChange={(d) => onChange({ arrived_on: d })} placeholder="¿Qué día?" label={`Llegada a ${s.name}`} />
          {!homeReturn && i > 0 && sights.length > 0 && (
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-card px-3 font-semibold text-ink ring-1 ring-outline-soft">
              <Icon name={planned ? 'checklist' : 'museum'} size={14} className="text-accent" /> {plural(sights.length, 'sitio', 'sitios')}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 text-ink-soft sm:flex-row">
        <IconButton icon="arrow_upward" label="Subir" disabled={i === 0} onClick={() => onMove(-1)} />
        <IconButton icon="arrow_downward" label="Bajar" disabled={i === total - 1} onClick={() => onMove(1)} />
        <IconButton
          icon="delete"
          label="Quitar parada"
          danger
          onClick={async () => {
            if (
              !(s.notes || photos) ||
              (await ask({ title: `¿Quitar ${s.name}?`, body: `Se borrarán sus notas${photos ? ' y las fotos quedarán sin parada' : ''}.`, confirm: 'Quitar', danger: true }))
            )
              onRemove()
          }}
        />
      </div>
    </div>
  )
}

function IconButton({ icon, label, onClick, disabled, danger }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-full transition disabled:opacity-20 ${danger ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-surface-container hover:text-ink'}`}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}

export function RouteMap({ trip, airports, compact }: { trip: TripWithStops | undefined | null; airports: ReturnType<typeof useAirportMap>; compact?: boolean }) {
  const stops = trip?.stops ?? []
  return (
    <div className="rounded-md bg-surface-low p-3">
      <div className="relative">
        <WorldMap
          className={`${compact ? 'h-56' : 'h-72'} shadow-none!`}
          trips={trip ? [trip] : []}
          airports={airports}
          numbered
          base="modern"
          controls={false}
          telemetry={false}
          legend={false}
          routeLink={false}
        />
        {stops.length > 0 && (
          <span className="label-code pointer-events-none absolute right-3 top-3 bg-ink px-2 py-1 text-paper">
            {plural(stops.length, 'parada', 'paradas')} · {trip ? formatKm(tripKm(trip, airports)) : 0} km
          </span>
        )}
      </div>
      {!compact && stops.length > 0 && (
        <ol className="mt-3 space-y-1">
          {stops.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-sm bg-card px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === 0 ? 'bg-accent' : 'bg-ink'}`} />
                <span className="truncate">
                  {i + 1}. {s.name}
                </span>
              </span>
              {s.arrived_on && <span className="label-stamp shrink-0 text-ink-soft">{formatDay(s.arrived_on, false)}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
