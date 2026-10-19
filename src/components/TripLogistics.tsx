import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ask } from './ConfirmDialog'
import { DateField, TimeField, daysBetween, formatDay } from './DatePicker'
import { Icon } from './Icon'
import { ErrorNote, Flag, plural } from './ui'
import { api } from '../lib/api'
import type { LegPatch, NewLodging } from '../lib/api/types'
import { isReturnHome } from '../lib/days'
import type { LegDetail, Lodging, Stop, TripWithStops } from '../lib/db'
import { TRANSPORT } from '../lib/transport'

type Mode = 'whole' | 'stops'

const CARRIER_HINT: Partial<Record<string, string>> = { plane: 'Iberia, Vueling…', train: 'Renfe, Ouigo…', bus: 'Alsa, FlixBus…', boat: 'Baleària…', car: 'Coche de alquiler…' }
const when = (d: string | null, t: string | null) => [d && formatDay(d, false), t].filter(Boolean).join(' · ')

/**
 * Alojamiento y transporte del viaje, en el orden de la ruta: cada tramo con su salida, horarios y
 * localizador, y los alojamientos (uno para toda la estancia o uno o varios por parada). Privado del viaje.
 */
export function TripLogistics({ trip: t }: { trip: TripWithStops }) {
  const qc = useQueryClient()
  const lodgings = useQuery({ queryKey: ['lodgings', t.id], queryFn: () => api.listLodgings(t.id) })
  const legs = useQuery({ queryKey: ['legs', t.id], queryFn: () => api.listLegDetails(t.id) })
  const list = lodgings.data ?? []
  const whole = list.filter((l) => !l.stop_id || !t.stops.some((s) => s.id === l.stop_id))
  const [mode, setMode] = useState<Mode | null>(null)
  // Sin elegir: «todo el viaje» si solo hay alojamientos de estancia completa.
  const current: Mode = mode ?? (whole.length && whole.length === list.length ? 'whole' : 'stops')
  const [editing, setEditing] = useState<string | null>(null) // 'leg:<stopId>' · 'lod:<id>' · 'new:<stopId|whole>'
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['lodgings', t.id] }), qc.invalidateQueries({ queryKey: ['legs', t.id] })])
  const legOf = (stopId: string) => legs.data?.find((l) => l.stop_id === stopId)
  const stops = t.stops

  if (lodgings.isLoading || legs.isLoading) return <div className="card h-40 animate-pulse" />

  const addButton = (key: string, label: string) =>
    editing === `new:${key}` ? (
      <LodgingForm trip={t} stopId={key === 'whole' ? null : key} onDone={() => (setEditing(null), refresh())} onCancel={() => setEditing(null)} />
    ) : (
      <button
        type="button"
        onClick={() => setEditing(`new:${key}`)}
        className="flex w-full items-center gap-2 rounded-sm border border-dashed border-outline px-3 py-2.5 text-left text-sm text-ink-soft transition hover:border-ink hover:text-ink"
      >
        <Icon name="add_home" size={18} className="text-accent" /> {label}
      </button>
    )
  const lodgingCard = (l: Lodging) =>
    editing === `lod:${l.id}` ? (
      <LodgingForm key={l.id} trip={t} stopId={l.stop_id} editing={l} onDone={() => (setEditing(null), refresh())} onCancel={() => setEditing(null)} />
    ) : (
      <LodgingCard key={l.id} lodging={l} onEdit={() => setEditing(`lod:${l.id}`)} />
    )

  return (
    <section className="card p-4" id="logistica">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="headline-sm flex items-center gap-2 uppercase">
          <Icon name="luggage" className="text-accent" /> Alojamiento y transporte
        </h2>
        <span className="label-code flex items-center gap-1 text-ink-soft" title="Solo lo ven los participantes del viaje">
          <Icon name="lock" size={14} /> Privado
        </span>
      </div>
      <ErrorNote error={lodgings.error ?? legs.error} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Alojamiento:</span>
        <div className="flex rounded-full bg-surface-low p-0.5" role="radiogroup" aria-label="Tipo de alojamiento">
          {(
            [
              ['whole', 'Uno para todo el viaje'],
              ['stops', 'Por parada'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={current === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${current === m ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(current === 'whole' || whole.length > 0) && (
        <div className="mb-4 space-y-2">
          <div className="label-stamp text-ink-soft">Toda la estancia</div>
          {whole.map(lodgingCard)}
          {current === 'whole' && addButton('whole', whole.length ? 'Añadir otro alojamiento' : 'Añadir el alojamiento del viaje')}
        </div>
      )}

      {stops.length === 0 ? (
        <p className="text-sm text-ink-soft">Añade la ruta para organizar los tramos y dónde dormís en cada parada.</p>
      ) : (
        <ol className="relative space-y-2 border-l-2 border-dashed border-outline-soft pl-4">
          {stops.map((s, i) => {
            const home = i === 0 || isReturnHome(stops, i)
            const here = list.filter((l) => l.stop_id === s.id)
            return (
              <li key={s.id} className="space-y-2">
                {i > 0 && s.transport_in && (
                  editing === `leg:${s.id}` ? (
                    <LegForm trip={t} stop={s} prev={stops[i - 1]} detail={legOf(s.id)} onDone={() => (setEditing(null), refresh())} onCancel={() => setEditing(null)} />
                  ) : (
                    <LegRow stop={s} prev={stops[i - 1]} detail={legOf(s.id)} onEdit={() => setEditing(`leg:${s.id}`)} />
                  )
                )}
                <div className="relative flex items-center gap-2 pt-1">
                  <span className={`absolute -left-[23px] h-3 w-3 rounded-full ring-4 ring-card ${home ? 'bg-accent' : 'bg-ink'}`} />
                  <span className="font-display font-semibold">{s.name}</span>
                  <Flag code={s.country_code} />
                  {s.arrived_on && <span className="text-xs text-ink-soft">{formatDay(s.arrived_on, false)}</span>}
                  {home && <span className="label-stamp text-ink-soft">{i === 0 ? 'Salida' : 'Vuelta a casa'}</span>}
                </div>
                {here.map(lodgingCard)}
                {current === 'stops' && !home && addButton(s.id, here.length ? `Otro alojamiento en ${s.name}` : `¿Dónde dormís en ${s.name}?`)}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function LegRow({ stop: s, prev, detail: d, onEdit }: { stop: Stop; prev: Stop; detail?: LegDetail; onEdit: () => void }) {
  const mode = TRANSPORT[s.transport_in ?? 'car']
  const depart = when(d?.depart_on ?? null, d?.depart_time ?? null)
  const arrive = when(s.arrived_on && s.arrived_on !== d?.depart_on ? s.arrived_on : null, d?.arrive_time ?? null)
  const route = s.transport_in === 'plane' && s.from_airport && s.to_airport ? `${s.from_airport} → ${s.to_airport}` : `${prev.name} → ${s.name}`
  const extra = [s.flight_no, d?.carrier].filter(Boolean).join(' · ')
  return (
    <button type="button" onClick={onEdit} aria-label={`Editar el tramo a ${s.name}`} className="group flex w-full items-center gap-3 rounded-sm bg-surface-low px-3 py-2.5 text-left text-sm transition hover:bg-surface-container">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-accent ring-1 ring-outline-soft">
        <Icon name={mode.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {mode.label} · {route}
        </span>
        <span className="block text-xs text-ink-soft">
          {depart || arrive ? `${depart ? `Sale ${depart}` : ''}${depart && arrive ? ' → ' : ''}${arrive ? `llega ${arrive}` : ''}` : 'Añade horarios y localizador'}
          {extra && ` · ${extra}`}
          {d?.booking_ref && ` · Ref. ${d.booking_ref}`}
        </span>
      </span>
      <Icon name="edit" size={16} className="shrink-0 text-ink-soft opacity-50 transition group-hover:opacity-100" />
    </button>
  )
}

function LodgingCard({ lodging: l, onEdit }: { lodging: Lodging; onEdit: () => void }) {
  const nights = l.check_in && l.check_out ? daysBetween(l.check_in, l.check_out) - 1 : null
  return (
    <div className="flex items-start gap-3 rounded-sm bg-surface-low px-3 py-2.5 text-sm">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white">
        <Icon name="hotel" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{l.name}</div>
        <div className="text-xs text-ink-soft">
          {[l.check_in && `Entrada ${when(l.check_in, l.check_in_time)}`, l.check_out && `Salida ${when(l.check_out, l.check_out_time)}`, nights !== null && nights > 0 && plural(nights, 'noche', 'noches')]
            .filter(Boolean)
            .join(' · ') || 'Sin fechas'}
        </div>
        {(l.address || l.booking_ref || l.url) && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {l.address && (
              <a className="inline-flex items-center gap-1 text-accent-deep hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.address}`)}`} target="_blank" rel="noreferrer">
                <Icon name="location_on" size={14} /> {l.address}
              </a>
            )}
            {l.booking_ref && <span className="text-ink-soft">Ref. {l.booking_ref}</span>}
            {l.url && (
              <a className="inline-flex items-center gap-1 text-accent-deep hover:underline" href={l.url} target="_blank" rel="noreferrer">
                <Icon name="open_in_new" size={14} /> Reserva
              </a>
            )}
          </div>
        )}
        {l.notes && <p className="mt-1 text-xs">{l.notes}</p>}
      </div>
      <button type="button" onClick={onEdit} aria-label={`Editar ${l.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-container hover:text-ink">
        <Icon name="edit" size={16} />
      </button>
    </div>
  )
}

const input = 'w-full rounded-sm bg-card px-3 py-2 text-sm ring-1 ring-outline-soft outline-none focus:ring-2 focus:ring-ink'
const clean = (v: string) => v.trim() || null

function LodgingForm({
  trip: t,
  stopId,
  editing,
  onDone,
  onCancel,
}: {
  trip: TripWithStops
  stopId: string | null
  editing?: Lodging
  onDone: () => void
  onCancel: () => void
}) {
  const i = t.stops.findIndex((s) => s.id === stopId)
  const stop = t.stops[i]
  // Por defecto: de la llegada a la parada hasta la llegada a la siguiente (o la estancia entera).
  const [v, setV] = useState({
    name: editing?.name ?? '',
    address: editing?.address ?? '',
    check_in: editing ? editing.check_in : stop ? stop.arrived_on : t.start_date,
    check_in_time: editing ? editing.check_in_time : '15:00',
    check_out: editing ? editing.check_out : stop ? (t.stops[i + 1]?.arrived_on ?? t.end_date) : t.end_date,
    check_out_time: editing ? editing.check_out_time : '11:00',
    booking_ref: editing?.booking_ref ?? '',
    url: editing?.url ?? '',
    notes: editing?.notes ?? '',
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })
  const badDates = !!v.check_in && !!v.check_out && v.check_out < v.check_in
  const url = clean(v.url)
  const badUrl = !!url && !/^https?:\/\//.test(url)
  const save = useMutation({
    mutationFn: () => {
      const body: NewLodging = {
        name: v.name.trim().slice(0, 160),
        stop_id: stopId,
        address: clean(v.address),
        check_in: v.check_in,
        check_in_time: v.check_in_time,
        check_out: v.check_out,
        check_out_time: v.check_out_time,
        booking_ref: clean(v.booking_ref),
        url,
        notes: clean(v.notes),
      }
      return editing ? api.updateLodging(editing.id, body) : api.addLodging(t.id, body)
    },
    onSuccess: onDone,
  })
  const remove = useMutation({ mutationFn: () => api.deleteLodging(editing!.id), onSuccess: onDone })

  return (
    <form
      className="space-y-2 rounded-sm bg-surface-low p-3 ring-2 ring-accent"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.name.trim() && !badDates && !badUrl) save.mutate()
      }}
    >
      <div className="font-display font-semibold">{editing ? 'Editar alojamiento' : stop ? `Alojamiento en ${stop.name}` : 'Alojamiento de todo el viaje'}</div>
      <input aria-label="Nombre del alojamiento" className={input} placeholder="Hotel, apartamento, camping…" value={v.name} maxLength={160} autoFocus onChange={(e) => set({ name: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-stamp w-14 text-ink-soft">Entrada</span>
          <DateField value={v.check_in} min={t.start_date} max={t.end_date} onChange={(d) => set({ check_in: d })} placeholder="Día" label="Día de entrada" />
          <TimeField value={v.check_in_time} onChange={(x) => set({ check_in_time: x })} label="Hora de entrada" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-stamp w-14 text-ink-soft">Salida</span>
          <DateField value={v.check_out} min={t.start_date} max={t.end_date} onChange={(d) => set({ check_out: d })} placeholder="Día" label="Día de salida" />
          <TimeField value={v.check_out_time} onChange={(x) => set({ check_out_time: x })} label="Hora de salida" />
        </div>
      </div>
      {badDates && <p className="text-xs font-semibold text-red-700">La salida no puede ser antes de la entrada.</p>}
      <input aria-label="Dirección" className={input} placeholder="Dirección (opcional)" value={v.address} maxLength={300} onChange={(e) => set({ address: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Localizador" className={input} placeholder="Localizador o nº de reserva" value={v.booking_ref} maxLength={80} onChange={(e) => set({ booking_ref: e.target.value })} />
        <input aria-label="Enlace de la reserva" className={input} placeholder="https://… (enlace a la reserva)" value={v.url} maxLength={500} inputMode="url" onChange={(e) => set({ url: e.target.value })} />
      </div>
      {badUrl && <p className="text-xs font-semibold text-red-700">El enlace tiene que empezar por https://</p>}
      <textarea aria-label="Notas del alojamiento" className={`${input} min-h-16 resize-y`} placeholder="Notas: desayuno incluido, código de la puerta…" value={v.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
      <ErrorNote error={save.error ?? remove.error} />
      <div className="flex items-center justify-between gap-2 pt-1">
        {editing ? (
          <button
            type="button"
            className="btn text-red-700 hover:bg-red-50"
            disabled={remove.isPending}
            aria-label="Borrar alojamiento"
            onClick={async () => (await ask({ title: `¿Borrar «${editing.name}»?`, confirm: 'Borrar', danger: true })) && remove.mutate()}
          >
            <Icon name="delete" size={18} />
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-dark" disabled={!v.name.trim() || badDates || badUrl || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </span>
      </div>
    </form>
  )
}

function LegForm({ trip: t, stop: s, prev, detail: d, onDone, onCancel }: { trip: TripWithStops; stop: Stop; prev: Stop; detail?: LegDetail; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState({
    depart_on: d ? d.depart_on : (s.arrived_on ?? prev.arrived_on),
    depart_time: d?.depart_time ?? null,
    arrive_time: d?.arrive_time ?? null,
    carrier: d?.carrier ?? '',
    booking_ref: d?.booking_ref ?? '',
    notes: d?.notes ?? '',
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })
  const mode = s.transport_in ?? 'car'
  const save = useMutation({
    mutationFn: () => {
      const body: LegPatch = { depart_on: v.depart_on, depart_time: v.depart_time, arrive_time: v.arrive_time, carrier: clean(v.carrier), booking_ref: clean(v.booking_ref), notes: clean(v.notes) }
      return api.saveLegDetail(t.id, s.id, body)
    },
    onSuccess: onDone,
  })
  return (
    <form
      className="space-y-2 rounded-sm bg-surface-low p-3 ring-2 ring-accent"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="flex items-center gap-2 font-display font-semibold">
        <Icon name={TRANSPORT[mode].icon} size={18} className="text-accent" /> {prev.name} → {s.name}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-stamp w-14 text-ink-soft">Sale</span>
        <DateField value={v.depart_on} min={t.start_date} max={t.end_date} onChange={(x) => set({ depart_on: x })} placeholder="Día" label="Día de salida" />
        <TimeField value={v.depart_time} onChange={(x) => set({ depart_time: x })} label="Hora de salida" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-stamp w-14 text-ink-soft">Llega</span>
        <span className="text-xs text-ink-soft">{s.arrived_on ? formatDay(s.arrived_on, false) : 'el día de llegada a la parada'}</span>
        <TimeField value={v.arrive_time} onChange={(x) => set({ arrive_time: x })} label="Hora de llegada" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Compañía" className={input} placeholder={`Compañía (${CARRIER_HINT[mode] ?? 'opcional'})`} value={v.carrier} maxLength={80} onChange={(e) => set({ carrier: e.target.value })} />
        <input aria-label="Localizador del tramo" className={input} placeholder="Localizador o nº de billete" value={v.booking_ref} maxLength={80} onChange={(e) => set({ booking_ref: e.target.value })} />
      </div>
      <input aria-label="Notas del tramo" className={input} placeholder="Notas: terminal, asiento, andén…" value={v.notes} maxLength={500} onChange={(e) => set({ notes: e.target.value })} />
      <ErrorNote error={save.error} />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-dark" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
