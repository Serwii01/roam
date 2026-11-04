import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { DateField, TimeField } from './DatePicker'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { api } from '../lib/api'
import type { Stop, TripWithStops } from '../lib/db'
import { useInvalidateTravel } from '../lib/hooks'
import { parseBookings, type Booking, type FlightBooking, type LodgingBooking } from '../lib/import/booking'

const input = 'w-full rounded-sm bg-card px-3 py-2 text-sm ring-1 ring-outline-soft outline-none focus:ring-2 focus:ring-ink'
const clean = (v: string | null) => v?.trim() || null

/** Parada a la que llega un vuelo: la de ese aeropuerto o, si no, la de ese día. La salida de casa no cuenta. */
function stopForFlight(stops: Stop[], b: FlightBooking) {
  const rest = stops.slice(1)
  return rest.find((s) => b.to && s.to_airport === b.to) ?? rest.find((s) => b.date && s.arrived_on === b.date) ?? null
}

/** Parada en la que se duerme: la última a la que ya se ha llegado el día de la entrada. */
function stopForLodging(stops: Stop[], b: LodgingBooking) {
  return (
    stops
      .slice(1)
      .filter((s) => b.checkIn && s.arrived_on && s.arrived_on <= b.checkIn)
      .at(-1) ?? null
  )
}

function StopSelect({ stops, value, onChange, empty }: { stops: Stop[]; value: string; onChange: (id: string) => void; empty: string }) {
  return (
    <select aria-label="Parada" className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {stops.slice(1).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

function FlightDraft({ trip: t, booking, onSaved, onSkip }: { trip: TripWithStops; booking: FlightBooking; onSaved: () => void; onSkip: () => void }) {
  const [v, setV] = useState(booking)
  const [stopId, setStopId] = useState(stopForFlight(t.stops, booking)?.id ?? '')
  const set = (patch: Partial<FlightBooking>) => setV({ ...v, ...patch })
  const save = useMutation({
    mutationFn: async () => {
      await api.updateStop(stopId, {
        transport_in: 'plane',
        ...(clean(v.flightNo) ? { flight_no: clean(v.flightNo) } : {}),
        ...(clean(v.from) ? { from_airport: clean(v.from) } : {}),
        ...(clean(v.to) ? { to_airport: clean(v.to) } : {}),
      })
      await api.saveLegDetail(t.id, stopId, {
        ...(v.date ? { depart_on: v.date } : {}),
        ...(v.departTime ? { depart_time: v.departTime } : {}),
        ...(v.arriveTime ? { arrive_time: v.arriveTime } : {}),
        ...(clean(v.carrier) ? { carrier: clean(v.carrier) } : {}),
        ...(clean(v.ref) ? { booking_ref: clean(v.ref) } : {}),
      })
    },
    onSuccess: onSaved,
  })
  return (
    <form
      className="space-y-2 rounded-sm bg-surface-low p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (stopId) save.mutate()
      }}
    >
      <div className="flex items-center gap-2 font-display font-semibold">
        <Icon name="flight" size={18} className="text-accent" /> Vuelo {v.flightNo ?? ''}
      </div>
      <ErrorNote error={save.error} />
      <StopSelect stops={t.stops} value={stopId} onChange={setStopId} empty="¿A qué parada llega?" />
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="Número de vuelo" className={input} placeholder="Vuelo" value={v.flightNo ?? ''} maxLength={12} onChange={(e) => set({ flightNo: e.target.value.toUpperCase() })} />
        <input aria-label="Aeropuerto de salida" className={input} placeholder="Desde" value={v.from ?? ''} maxLength={3} onChange={(e) => set({ from: e.target.value.toUpperCase() })} />
        <input aria-label="Aeropuerto de llegada" className={input} placeholder="Hasta" value={v.to ?? ''} maxLength={3} onChange={(e) => set({ to: e.target.value.toUpperCase() })} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <DateField value={v.date} onChange={(x) => set({ date: x })} placeholder="Día" label="Día de salida" />
        <TimeField value={v.departTime} onChange={(x) => set({ departTime: x })} label="Hora de salida" />
        <TimeField value={v.arriveTime} onChange={(x) => set({ arriveTime: x })} label="Hora de llegada" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Compañía" className={input} placeholder="Compañía" value={v.carrier ?? ''} maxLength={80} onChange={(e) => set({ carrier: e.target.value })} />
        <input aria-label="Localizador" className={input} placeholder="Localizador" value={v.ref ?? ''} maxLength={80} onChange={(e) => set({ ref: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-accent" disabled={!stopId || save.isPending}>
          Guardar
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          Descartar
        </button>
      </div>
    </form>
  )
}

function LodgingDraft({ trip: t, booking, onSaved, onSkip }: { trip: TripWithStops; booking: LodgingBooking; onSaved: () => void; onSkip: () => void }) {
  const [v, setV] = useState(booking)
  const [stopId, setStopId] = useState(stopForLodging(t.stops, booking)?.id ?? '')
  const set = (patch: Partial<LodgingBooking>) => setV({ ...v, ...patch })
  const save = useMutation({
    mutationFn: () =>
      api.addLodging(t.id, {
        name: v.name!.trim(),
        stop_id: stopId || null,
        address: clean(v.address),
        check_in: v.checkIn,
        check_in_time: v.checkInTime,
        check_out: v.checkOut,
        check_out_time: v.checkOutTime,
        booking_ref: clean(v.ref),
      }),
    onSuccess: onSaved,
  })
  return (
    <form
      className="space-y-2 rounded-sm bg-surface-low p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.name?.trim()) save.mutate()
      }}
    >
      <div className="flex items-center gap-2 font-display font-semibold">
        <Icon name="hotel" size={18} className="text-accent" /> Alojamiento
      </div>
      <ErrorNote error={save.error} />
      <input aria-label="Nombre del alojamiento" className={input} placeholder="Nombre del alojamiento" value={v.name ?? ''} maxLength={160} onChange={(e) => set({ name: e.target.value })} />
      <StopSelect stops={t.stops} value={stopId} onChange={setStopId} empty="Toda la estancia" />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-stamp w-14 text-ink-soft">Entrada</span>
        <DateField value={v.checkIn} onChange={(x) => set({ checkIn: x })} placeholder="Día" label="Día de entrada" />
        <TimeField value={v.checkInTime} onChange={(x) => set({ checkInTime: x })} label="Hora de entrada" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-stamp w-14 text-ink-soft">Salida</span>
        <DateField value={v.checkOut} onChange={(x) => set({ checkOut: x })} placeholder="Día" label="Día de salida" />
        <TimeField value={v.checkOutTime} onChange={(x) => set({ checkOutTime: x })} label="Hora de salida" />
      </div>
      <input aria-label="Dirección" className={input} placeholder="Dirección" value={v.address ?? ''} maxLength={300} onChange={(e) => set({ address: e.target.value })} />
      <input aria-label="Localizador" className={input} placeholder="Localizador" value={v.ref ?? ''} maxLength={80} onChange={(e) => set({ ref: e.target.value })} />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-accent" disabled={!v.name?.trim() || save.isPending}>
          Guardar
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          Descartar
        </button>
      </div>
    </form>
  )
}

/** Crea tramos y alojamientos a partir de un correo de confirmación. Todo se revisa antes de guardar. */
export function BookingImport({ trip: t, onSaved }: { trip: TripWithStops; onSaved: () => void }) {
  const invalidate = useInvalidateTravel()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<(Booking & { key: number })[] | null>(null)
  const [found, setFound] = useState(0)
  const year = Number((t.start_date ?? new Date().toISOString()).slice(0, 4))
  const read = (raw: string) => {
    const list = parseBookings(raw, year).map((b, key) => ({ ...b, key }))
    setFound(list.length)
    setDrafts(list)
  }
  const finish = (key: number) => setDrafts((l) => l?.filter((d) => d.key !== key) ?? null)
  const saved = (key: number) => {
    finish(key)
    onSaved()
    void invalidate()
  }
  const close = () => {
    setOpen(false)
    setText('')
    setDrafts(null)
  }

  if (!open)
    return (
      <button type="button" className="btn btn-ghost mb-4 w-full" onClick={() => setOpen(true)}>
        <Icon name="mail" size={18} /> Añadir desde un correo de reserva
      </button>
    )

  return (
    <div className="mb-4 space-y-2 rounded-sm bg-surface-low p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display font-semibold">Añadir desde un correo</div>
        <button type="button" aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-container" onClick={close}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {drafts === null ? (
        <>
          <textarea aria-label="Texto del correo" className={`${input} min-h-32 resize-y`} placeholder="Pega aquí el texto de la confirmación del vuelo o del hotel" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-accent" disabled={!text.trim()} onClick={() => read(text)}>
              Leer la reserva
            </button>
            <label className="btn btn-ghost cursor-pointer">
              <Icon name="upload_file" size={18} /> Subir .eml
              <input
                type="file"
                accept=".eml,.html,.htm,.txt,message/rfc822,text/html,text/plain"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) read(await file.text())
                }}
              />
            </label>
          </div>
          <p className="text-xs text-ink-soft">El correo se lee en tu móvil: no se envía a ningún sitio ni se guarda.</p>
        </>
      ) : drafts.length ? (
        <>
          <p className="text-sm text-ink-soft">Revisa los datos antes de guardar: se han leído de forma automática.</p>
          {drafts.map((d) =>
            d.kind === 'flight' ? (
              <FlightDraft key={d.key} trip={t} booking={d} onSaved={() => saved(d.key)} onSkip={() => finish(d.key)} />
            ) : (
              <LodgingDraft key={d.key} trip={t} booking={d} onSaved={() => saved(d.key)} onSkip={() => finish(d.key)} />
            ),
          )}
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-ink-soft">{found ? 'Listo: no quedan reservas por revisar.' : 'No se ha encontrado ningún vuelo ni hotel. Prueba a pegar el texto completo del correo.'}</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setText('')
              setDrafts(null)
            }}
          >
            {found ? 'Añadir otra reserva' : 'Probar con otro texto'}
          </button>
        </div>
      )}
    </div>
  )
}
