import { useState } from 'react'
import { DateField } from './DatePicker'
import { Icon } from './Icon'
import { api } from '../lib/api'
import type { Stop } from '../lib/db'
import { lookupFlight, normalizeFlight, type FlightRoute } from '../lib/flights'

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'invalid' } | { kind: 'notfound' } | { kind: 'error' } | { kind: 'found'; route: FlightRoute }

function useFlightSearch() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  async function search(code: string): Promise<FlightRoute | null> {
    const n = normalizeFlight(code)
    if (!n) {
      setState({ kind: 'invalid' })
      return null
    }
    setState({ kind: 'loading' })
    try {
      const route = await lookupFlight(n)
      setState(route ? { kind: 'found', route } : { kind: 'notfound' })
      return route
    } catch {
      setState({ kind: 'error' })
      return null
    }
  }
  return { state, search, reset: () => setState({ kind: 'idle' }) }
}

function StatusLine({ state }: { state: State }) {
  if (state.kind === 'loading') return <p className="mt-1.5 text-sm text-ink-soft">Buscando el vuelo…</p>
  if (state.kind === 'invalid') return <p className="mt-1.5 text-sm text-red-700">Escribe la aerolínea y el número, por ejemplo IB6251.</p>
  if (state.kind === 'notfound') return <p className="mt-1.5 text-sm text-ink-soft">No conocemos ese vuelo. Elige los aeropuertos a mano.</p>
  if (state.kind === 'error') return <p className="mt-1.5 text-sm text-red-700">No se pudo consultar el vuelo. Inténtalo otra vez.</p>
  if (state.kind === 'found') {
    const { route: r } = state
    return (
      <p className="mt-1.5 text-sm">
        <b>{r.airline}</b> · {r.from.city} ({r.from.iata}) → {r.to.city} ({r.to.iata})
      </p>
    )
  }
  return null
}

/** Nº de vuelo de un tramo en avión: al buscarlo rellena los aeropuertos de salida y llegada. */
export function FlightField({ stop, onChange }: { stop: Stop; onChange: (patch: Partial<Stop>) => void }) {
  const [code, setCode] = useState(stop.flight_no ?? '')
  const { state, search } = useFlightSearch()
  async function go() {
    const r = await search(code)
    const n = normalizeFlight(code)
    if (!n) return
    if (!r) {
      onChange({ flight_no: n })
      return
    }
    // Solo aeropuertos que están en la base de datos (si no, se quedan los que había).
    const known = new Set((await api.getAirports([r.from.iata, r.to.iata])).map((a) => a.iata))
    onChange({
      flight_no: r.flight,
      from_airport: known.has(r.from.iata) ? r.from.iata : stop.from_airport,
      to_airport: known.has(r.to.iata) ? r.to.iata : stop.to_airport,
    })
  }
  return (
    <div className="mt-2 max-w-md">
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm bg-card px-3 ring-1 ring-outline-soft focus-within:ring-2 focus-within:ring-ink">
          <Icon name="airplane_ticket" size={18} className="text-accent" />
          <input
            aria-label="Número de vuelo"
            className="w-full bg-transparent py-2 text-sm uppercase outline-none placeholder:normal-case"
            placeholder="Nº de vuelo (opcional): IB6251"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                go()
              }
            }}
          />
        </div>
        <button type="button" className="btn btn-ghost py-1.5!" disabled={!code.trim() || state.kind === 'loading'} onClick={go}>
          Buscar
        </button>
      </div>
      <StatusLine state={state} />
    </div>
  )
}

/** «Añadir un vuelo» en la ruta: con el número y el día añade la ciudad de llegada (y la de salida si hace falta). */
export function AddFlight({ defaultDate, onAdd, busy }: { defaultDate: string | null; onAdd: (route: FlightRoute, date: string | null) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [date, setDate] = useState<string | null>(defaultDate)
  const { state, search, reset } = useFlightSearch()
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep hover:underline">
        <Icon name="flight_takeoff" size={16} /> Añadir un vuelo por su número
      </button>
    )
  return (
    <div className="rounded-sm bg-card p-3 ring-1 ring-outline-soft">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display font-semibold">Añadir un vuelo</span>
        <button type="button" aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-container" onClick={() => (setOpen(false), reset())}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search(code)
        }}
      >
        <input
          aria-label="Número de vuelo"
          className="field w-40 py-2! uppercase placeholder:normal-case"
          placeholder="IB6251"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (state.kind !== 'idle') reset()
          }}
          autoFocus
        />
        <DateField value={date} onChange={setDate} placeholder="Día del vuelo" label="Día del vuelo" />
        <button type="submit" className="btn btn-ghost" disabled={!code.trim() || state.kind === 'loading'}>
          Buscar
        </button>
      </form>
      <StatusLine state={state} />
      {state.kind === 'found' && (
        <button type="button" className="btn btn-accent mt-3" disabled={busy} onClick={() => (onAdd(state.route, date), setOpen(false), setCode(''), reset())}>
          <Icon name="add_location_alt" size={18} /> Añadir {state.route.to.city} a la ruta
        </button>
      )}
      <p className="mt-2 text-[11px] text-ink-soft">
        Rutas de{' '}
        <a href="https://www.adsbdb.com" target="_blank" rel="noreferrer" className="underline">
          adsbdb
        </a>
        : origen y destino habituales de ese número de vuelo.
      </p>
    </div>
  )
}
