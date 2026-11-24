import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DateRangeField, daysBetween, formatDay } from '../DatePicker'
import { Icon } from '../Icon'
import { SpotifyLogo, SpotifyPlayer } from '../Spotify'
import type { BudgetStart } from '../TripBudget'
import { tripPeople } from '../../lib/tripPeople'
import { Flag, plural } from '../ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { isNote, type TripStyle, type TripWithStops } from '../../lib/db'
import { isReturnHome } from '../../lib/days'
import { balancesOf, formatMoney, isSettlement, netBalances, totalSpent } from '../../lib/money'
import { TRANSPORT, TRIP_STYLES } from '../../lib/transport'
import type { TripTab } from '../../pages/TripLog'

/** Los destinos del viaje (sin la salida ni la vuelta a casa), con sus fechas y noches. */
export function Destinations({ trip: t, onOpen }: { trip: TripWithStops; onOpen: () => void }) {
  const stops = t.stops
  const back = stops.some((_, i) => isReturnHome(stops, i))
  const list = stops.map((s, i) => ({ s, i })).filter(({ i }) => stops.length === 1 || (i > 0 && !isReturnHome(stops, i)))
  const nights = (i: number) => {
    const a = stops[i].arrived_on
    const b = stops[i + 1]?.arrived_on ?? (i === stops.length - 1 ? t.end_date : null)
    return a && b && b > a ? daysBetween(a, b) - 1 : null
  }
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="headline-sm flex items-center gap-2 uppercase">
          <Icon name="pin_drop" className="text-accent" /> Destinos
        </h2>
        {stops.length > 1 && (
          <span className="text-xs text-ink-soft">
            Desde {stops[0].name}
            {back ? ' · con vuelta a casa' : ''}
          </span>
        )}
      </div>
      {list.length ? (
        <ol className="space-y-1.5">
          {list.map(({ s, i }, n) => {
            const nn = nights(i)
            const prev = i > 0 ? s.transport_in : null
            return (
              <li key={s.id}>
                <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-sm bg-surface-low px-3 py-2.5 text-left transition hover:bg-surface-container">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-paper">{n + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-display font-semibold">
                      <span className="truncate">{s.name}</span> <Flag code={s.country_code} />
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {[s.arrived_on && formatDay(s.arrived_on, false), nn !== null && (nn === 0 ? 'de paso' : plural(nn, 'noche', 'noches')), t.sights.filter((x) => x.stop_id === s.id && !isNote(x)).length > 0 && plural(t.sights.filter((x) => x.stop_id === s.id && !isNote(x)).length, 'sitio', 'sitios')]
                        .filter(Boolean)
                        .join(' · ') || 'Sin fecha'}
                    </span>
                  </span>
                  {prev && <Icon name={TRANSPORT[prev].icon} size={18} className="shrink-0 text-accent" />}
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-sm text-ink-soft">Solo está la salida. Añade a dónde vas en la pestaña Ruta.</p>
      )}
    </section>
  )
}

/** Presupuesto y gasto de un vistazo, con acceso directo a editarlos. */
export function BudgetGlance({ trip: t, onOpen }: { trip: TripWithStops; onOpen: (start?: BudgetStart) => void }) {
  const budget = useQuery({ queryKey: ['budget', t.id], queryFn: () => api.getBudget(t.id) })
  const expenses = useQuery({ queryKey: ['expenses', t.id], queryFn: () => api.listExpenses(t.id) })
  const members = useQuery({ queryKey: ['members', t.id], queryFn: () => api.listTripMembers(t.id) })
  const me = useAuth().user?.id ?? ''
  if (budget.isLoading || expenses.isLoading) return <div className="card h-32 animate-pulse" />
  const list = expenses.data ?? []
  const currency = budget.data?.currency ?? 'EUR'
  const spent = totalSpent(list)
  const limit = budget.data?.amount ?? null
  const pct = limit ? spent / limit : null
  // Tu saldo, sin entrar en los gastos (con los compañeros ya cargados: si no, saldría otro).
  const people = members.data ? tripPeople(members.data, t.companions ?? [], me).map((p) => p.key) : []
  const { paid, owed } = balancesOf(list, people)
  const mine = people.length > 1 ? (netBalances(paid, owed).get(`u:${me}`) ?? 0) : 0
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="headline-sm flex items-center gap-2 uppercase">
          <Icon name="savings" className="text-accent" /> Presupuesto
        </h2>
        {list.length > 0 && (
          <button type="button" className="label-code text-accent-deep hover:underline" onClick={() => onOpen()}>
            {plural(list.filter((e) => !isSettlement(e)).length, 'gasto', 'gastos')} →
          </button>
        )}
      </div>
      {list.length || limit ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className="font-display text-3xl font-bold tracking-tight">{formatMoney(spent, currency)}</span>
            <span className="text-sm text-ink-soft">{limit ? <>de <b className="text-ink">{formatMoney(limit, currency)}</b></> : 'sin presupuesto fijado'}</span>
          </div>
          {pct !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container">
              <div className={`h-full rounded-full ${pct > 1 ? 'bg-red-600' : pct > 0.85 ? 'bg-accent' : 'bg-ink'}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
            </div>
          )}
          {mine !== 0 && (
            <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-sm bg-surface-low px-3 py-2 text-left font-semibold" onClick={() => onOpen('balances')}>
              <span className={mine > 0 ? 'text-emerald-700' : 'text-red-700'}>
                {mine > 0 ? 'Te deben' : 'Debes'} {formatMoney(Math.abs(mine), currency)}
              </span>
              <Icon name="arrow_forward" size={18} className="text-ink-soft" />
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-soft">{t.status === 'planned' ? 'Fija cuánto quieres gastar y apunta lo que ya hayas reservado.' : 'Apunta lo que gastasteis y reparte las cuentas.'}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => onOpen('budget')}>
          <Icon name="edit" size={18} /> {limit ? 'Editar presupuesto' : 'Fijar presupuesto'}
        </button>
        <button type="button" className="btn btn-dark" onClick={() => onOpen('expense')}>
          <Icon name="add" size={18} /> Apuntar gasto
        </button>
      </div>
    </section>
  )
}

/** Lo que falta para tener el viaje listo, con un toque a la pestaña donde se hace. */
export function PrepChecklist({ trip: t, onTab }: { trip: TripWithStops; onTab: (tab: TripTab) => void }) {
  const budget = useQuery({ queryKey: ['budget', t.id], queryFn: () => api.getBudget(t.id) })
  const expenses = useQuery({ queryKey: ['expenses', t.id], queryFn: () => api.listExpenses(t.id) })
  const packing = useQuery({ queryKey: ['packing', t.id], queryFn: () => api.listPacking(t.id) })
  const docs = useQuery({ queryKey: ['documents', t.id], queryFn: () => api.listDocuments(t.id) })
  const packed = packing.data?.filter((x) => x.packed).length ?? 0
  const items: { label: string; hint: string; icon: string; done: boolean; go: () => void }[] = [
    { label: 'Fechas', hint: t.start_date ? 'Hechas' : 'Ida y vuelta', icon: 'calendar_month', done: !!t.start_date, go: () => document.getElementById('detalles')?.scrollIntoView({ behavior: 'smooth' }) },
    { label: 'Ruta', hint: t.stops.length ? plural(t.stops.length, 'parada', 'paradas') : 'Por dónde vas', icon: 'route', done: t.stops.length >= 2, go: () => onTab('ruta') },
    { label: 'Día a día', hint: t.sights.length ? plural(t.sights.filter((x) => !isNote(x)).length, 'plan', 'planes') : 'Qué ver cada día', icon: 'event_note', done: t.sights.length > 0, go: () => onTab('dias') },
    {
      label: 'Presupuesto',
      hint: budget.data?.amount ? 'Fijado' : expenses.data?.length ? plural(expenses.data.filter((e) => !isSettlement(e)).length, 'gasto', 'gastos') : 'Cuánto gastar',
      icon: 'savings',
      done: !!budget.data?.amount || !!expenses.data?.length,
      go: () => onTab('gastos'),
    },
    { label: 'Equipaje', hint: packing.data?.length ? `${packed}/${packing.data.length} en la maleta` : 'Plantillas y sugerencias', icon: 'luggage', done: !!packing.data?.length, go: () => onTab('equipaje') },
    { label: 'Documentos', hint: docs.data?.length ? plural(docs.data.length, 'archivo', 'archivos') : 'Billetes y reservas', icon: 'description', done: !!docs.data?.length, go: () => onTab('documentos') },
  ]
  const done = items.filter((x) => x.done).length
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="headline-sm flex items-center gap-2 uppercase">
          <Icon name="checklist" className="text-accent" /> Prepara el viaje
        </h2>
        <span className="label-code text-ink-soft">
          {done} de {items.length}
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-container">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((x) => (
          <button key={x.label} type="button" onClick={x.go} className="flex items-center gap-2.5 rounded-sm bg-surface-low px-3 py-2.5 text-left transition hover:bg-surface-container">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${x.done ? 'bg-accent text-white' : 'bg-card text-ink-soft ring-1 ring-outline-soft'}`}>
              <Icon name={x.done ? 'check' : x.icon} size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{x.label}</span>
              <span className="block truncate text-xs text-ink-soft">{x.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Fechas, tipo de viaje, compañía y descripción, editables aquí mismo (sin pasar por el asistente). */
export function TripDetails({ trip: t, saving, onSave }: { trip: TripWithStops; saving: boolean; onSave: (patch: Parameters<typeof api.updateTrip>[1]) => void }) {
  const [mate, setMate] = useState('')
  const [desc, setDesc] = useState(t.description ?? '')
  const [allStyles, setAllStyles] = useState(false)
  useEffect(() => setDesc(t.description ?? ''), [t.description])
  const addMate = () => {
    const n = mate.trim().slice(0, 80)
    setMate('')
    if (n && !t.companions.some((c) => c.toLowerCase() === n.toLowerCase())) onSave({ companions: [...t.companions, n], solo: false })
  }
  const styles = Object.keys(TRIP_STYLES) as TripStyle[]
  const shown = allStyles ? styles : styles.filter((s, i) => i < 8 || s === t.style)
  const row = 'grid gap-2 border-t border-surface-highest py-4 first:border-t-0 first:pt-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-start'
  const label = 'label-stamp pt-2 text-ink-soft'

  return (
    <section className="card p-4" id="detalles">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="headline-sm uppercase">Detalles</h2>
        <span className="label-code text-ink-soft">{saving ? 'Guardando…' : 'Se guarda solo'}</span>
      </div>
      <div className={row}>
        <span className={label}>Fechas</span>
        <DateRangeField start={t.start_date} end={t.end_date} onChange={(start_date, end_date) => onSave({ start_date, end_date })} />
      </div>
      <div className={row}>
        <span className={label}>Tipo de viaje</span>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={t.style === s}
              onClick={() => onSave({ style: t.style === s ? null : s })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${t.style === s ? 'bg-ink text-paper' : 'bg-surface-low hover:bg-surface-container'}`}
            >
              <Icon name={TRIP_STYLES[s].icon} size={16} /> {TRIP_STYLES[s].label}
            </button>
          ))}
          {!allStyles && styles.length > shown.length && (
            <button type="button" onClick={() => setAllStyles(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-accent-deep hover:bg-surface-low">
              +{styles.length - shown.length} más
            </button>
          )}
        </div>
      </div>
      <div className={row}>
        <span className={label}>Con quién</span>
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={t.solo}
              onClick={() => onSave({ solo: !t.solo, companions: t.solo ? t.companions : [] })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${t.solo ? 'bg-ink text-paper' : 'bg-surface-low hover:bg-surface-container'}`}
            >
              <Icon name="person" size={16} /> En solitario
            </button>
            {t.companions.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface-low py-1 pl-3 pr-1 text-sm">
                {c}
                <button type="button" aria-label={`Quitar a ${c}`} onClick={() => onSave({ companions: t.companions.filter((x) => x !== c) })} className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-container">
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
            {!t.solo && (
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-outline px-3 py-1 text-sm">
                <Icon name="person_add" size={16} className="text-ink-soft" />
                <input
                  aria-label="Añadir compañero"
                  className="w-36 bg-transparent outline-none"
                  placeholder="Nombre y Enter"
                  value={mate}
                  onChange={(e) => setMate(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMate())}
                  onBlur={addMate}
                />
              </span>
            )}
          </div>
          {!t.solo && <p className="mt-1.5 text-xs text-ink-soft">Aunque no tengan cuenta, entran en el reparto de gastos. Para que editen contigo, invítales en «Compañeros».</p>}
        </div>
      </div>
      <div className={row}>
        <span className={label}>Descripción</span>
        <textarea
          aria-label="Descripción"
          className="field min-h-20 resize-y"
          maxLength={2000}
          placeholder={t.status === 'planned' ? 'Templos, ramen y onsen…' : 'Una frase que resuma el viaje'}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => (desc.trim() || null) !== (t.description || null) && onSave({ description: desc.trim() || null })}
        />
      </div>
    </section>
  )
}

export function ReadDetails({ trip: t }: { trip: TripWithStops }) {
  if (!t.style && !t.description && !t.companions.length && !t.solo) return null
  return (
    <section className="card space-y-3 p-4">
      {t.style && (
        <div className="flex items-center gap-2 text-sm">
          <Icon name={TRIP_STYLES[t.style].icon} className="text-accent" /> {TRIP_STYLES[t.style].label}
        </div>
      )}
      {(t.solo || t.companions.length > 0) && (
        <div className="flex items-center gap-2 text-sm">
          <Icon name="group" className="text-accent" /> {t.solo ? 'En solitario' : `Con ${t.companions.join(', ')}`}
        </div>
      )}
      {t.description && <p className="leading-relaxed">{t.description}</p>}
    </section>
  )
}

export function Soundtrack({ trip: t }: { trip: TripWithStops }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="headline-sm uppercase">Banda sonora</h3>
        <span className="label-code flex items-center gap-1.5 text-ink-soft">
          <SpotifyLogo className="h-4 w-4 text-[#1DB954]" /> Spotify
        </span>
      </div>
      {t.soundtrack_url ? (
        <SpotifyPlayer url={t.soundtrack_url} />
      ) : (
        <Link to={`/app/viajes/${t.id}/editar?paso=recuerdos`} className="flex items-center gap-3 rounded-sm bg-surface-low p-4 text-sm hover:bg-surface-container">
          <Icon name="music_note" className="text-accent" />
          <span>
            <span className="block font-display font-semibold">Añade la música de este viaje</span>
            <span className="text-ink-soft">Una playlist, un álbum o una canción de Spotify.</span>
          </span>
        </Link>
      )}
    </div>
  )
}
