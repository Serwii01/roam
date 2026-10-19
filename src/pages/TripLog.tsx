import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { DateRangeField } from '../components/DatePicker'
import { DayPlan } from '../components/DayPlan'
import { Icon } from '../components/Icon'
import { PhotoViewer, type ViewerPhoto } from '../components/PhotoViewer'
import { SpotifyLogo, SpotifyPlayer } from '../components/Spotify'
import { StopSights } from '../components/StopSights'
import { TripBudget } from '../components/TripBudget'
import { TripCrew } from '../components/TripCrew'
import { TripShareLink } from '../components/TripShareLink'
import { PassportAlert, WeatherChip } from '../components/Weather'
import { Empty, ErrorNote, Flag, Spinner, StatTile, Stars, coords, formatDate, plural } from '../components/ui'
import { WorldMap } from '../components/WorldMap'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { NewSight } from '../lib/api/types'
import type { Sight, Stop, TripStyle, TripWithStops } from '../lib/db'
import { IMAGE_ACCEPT, looksLikeImage } from '../lib/images'
import { useAirportMap, useCountries, useInvalidateTravel, usePassports, useProfile, useTravelMutation, useTrip } from '../lib/hooks'
import { passportWarnings } from '../lib/passportCheck'
import { tripCardData } from '../lib/shareData'
import { formatKm, legKm, tripCountries, tripDays, tripKm, tripModes } from '../lib/stats'
import { TRANSPORT, TRIP_STYLES } from '../lib/transport'
import { DocumentsTab, PackingTab, WeatherTab } from './Planner'

const ShareSheet = lazy(() => import('../components/ShareSheet').then((m) => ({ default: m.ShareSheet })))

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'dashboard', private: false },
  { id: 'dias', label: 'Día a día', icon: 'event_note', private: true },
  { id: 'ruta', label: 'Ruta', icon: 'route', private: false },
  { id: 'fotos', label: 'Fotos', icon: 'photo_library', private: false },
  { id: 'gastos', label: 'Gastos', icon: 'payments', private: true },
  { id: 'equipaje', label: 'Equipaje', icon: 'luggage', private: true },
  { id: 'documentos', label: 'Documentos', icon: 'description', private: true },
] as const
export type TripTab = (typeof TABS)[number]['id']

const today = () => new Date().toISOString().slice(0, 10)

/**
 * /app/viajes/:id — la página de un viaje, por pestañas: resumen (con los datos editables ahí mismo),
 * día a día, ruta, fotos, gastos, equipaje y documentos.
 */
export function TripLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const trip = useTrip(id)
  const { name, byCode } = useCountries()
  const airports = useAirportMap(trip.data?.stops.flatMap((s) => [s.from_airport, s.to_airport]) ?? [])
  const [viewer, setViewer] = useState<number | null>(null)
  const [sharing, setSharing] = useState(false)
  const me = useAuth().user?.id
  const passports = usePassports()
  const profile = useProfile()
  const save = useTravelMutation((patch: Parameters<typeof api.updateTrip>[1]) => api.updateTrip(id!, patch))
  const invalidate = useInvalidateTravel()
  const remove = useMutation({
    mutationFn: () => api.deleteTrip(id!),
    onSuccess: async () => {
      await invalidate()
      navigate('/app/bitacora', { replace: true })
    },
  })
  const tabsRef = useRef<HTMLElement>(null)

  const t = trip.data
  const participant = !!t && (t.user_id === me || (t.member_count ?? 0) > 0)
  const owner = !!t && t.user_id === me
  const tabs = TABS.filter((x) => participant || !x.private)
  const tab: TripTab = tabs.find((x) => x.id === params.get('tab'))?.id ?? 'resumen'
  const goTab = (next: TripTab) => {
    setParams(next === 'resumen' ? {} : { tab: next }, { replace: true })
    // Si la barra de pestañas quedó arriba, se vuelve a ella para ver el principio de la pestaña.
    const top = tabsRef.current?.getBoundingClientRect().top ?? 0
    if (top < 64) window.scrollBy({ top: top - 64 })
  }

  // Todas las fotos en el orden de la ruta (las que no tienen parada, al final), para la galería y el visor.
  const gallery = useMemo<(ViewerPhoto & { stopId: string | null; stopName?: string })[]>(() => {
    if (!t) return []
    const order = new Map(t.stops.map((s, i) => [s.id, i]))
    return [...t.photos]
      .sort((a, b) => (order.get(a.stop_id ?? '') ?? Infinity) - (order.get(b.stop_id ?? '') ?? Infinity))
      .map((p) => {
        const stop = t.stops.find((s) => s.id === p.stop_id)
        const when = stop?.arrived_on ? formatDate(stop.arrived_on, 'long') : null
        return { id: p.id, url: api.photoUrl(p.path), stopId: p.stop_id, stopName: stop?.name, caption: [p.caption, stop?.name, when].filter(Boolean).join(' · ') || t.title }
      })
  }, [t])
  // `name` cambia en cada render; lo que importa es `byCode`.
  const shareData = useMemo(() => t && tripCardData(t, airports, name), [t, airports, byCode])
  const sharePhotos = useMemo(() => [...new Set([...(t?.cover_url ? [t.cover_url] : []), ...gallery.map((g) => g.url)])], [t, gallery])
  const openPhoto = (pid: string) => setViewer(Math.max(0, gallery.findIndex((g) => g.id === pid)))
  const legs = useMemo(() => (t ? t.stops.slice(1).map((s, j) => ({ stop: s, km: legKm(t.stops, j + 1, airports) })) : []), [t, airports])

  if (trip.isLoading) return <Spinner label="Abriendo bitácora" />
  if (!t)
    return (
      <Empty icon="search_off" title="Esta expedición no existe">
        <Link to="/app/bitacora" className="btn btn-dark mt-4">
          Volver a la bitácora
        </Link>
      </Empty>
    )

  const km = tripKm(t, airports)
  const days = tripDays(t)
  const countries = tripCountries(t)
  const modes = tripModes(t)
  const mainMode = modes.sort((a, b) => legs.filter((l) => l.stop.transport_in === b).length - legs.filter((l) => l.stop.transport_in === a).length)[0]
  const first = t.stops[0]
  const destinations = countries.filter((c) => c !== first?.country_code)
  const planned = t.status === 'planned'

  const setStatus = (status: 'planned' | 'done') => {
    if (status === t.status) return
    const future = t.start_date && t.start_date > today()
    if (status === 'done' && future && !confirm('Las fechas de este viaje aún no han llegado. ¿Marcarlo igualmente como realizado?')) return
    save.mutate({ status })
  }
  const counts: Partial<Record<TripTab, number>> = { fotos: t.photos.length, ruta: t.stops.length, dias: t.sights.length }

  const map = (
    <WorldMap className="h-80 shadow-none!" trips={[t]} airports={airports} countries={countries} numbered base="modern" telemetry={false} legend={false} routeLink={false} />
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/app/bitacora" className="label-code flex items-center gap-1 text-ink-soft hover:text-ink">
          <Icon name="arrow_back" size={14} /> Bitácora
        </Link>
        <span className="label-code bg-accent px-2 py-1 text-white">EXP · {t.start_date?.slice(0, 4) ?? 'S/F'}</span>
        {participant ? (
          <div className="flex rounded-full bg-surface-low p-0.5" role="radiogroup" aria-label="Estado del viaje">
            {(['planned', 'done'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={t.status === s}
                disabled={save.isPending}
                onClick={() => setStatus(s)}
                className={`label-code rounded-full px-2.5 py-1 transition ${t.status === s ? (s === 'done' ? 'bg-ink text-white' : 'bg-accent-soft text-accent-ink') : 'text-ink-soft hover:text-ink'}`}
              >
                {s === 'done' ? 'Realizado' : 'Planificado'}
              </button>
            ))}
          </div>
        ) : (
          <span className={`label-code px-2 py-1 ${t.status === 'done' ? 'bg-surface-container' : 'bg-accent-soft text-accent-ink'}`}>{t.status === 'done' ? 'Realizado' : 'Planificado'}</span>
        )}
        {first && (
          <span className="label-code hidden items-center gap-1.5 text-ink-soft sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {coords(first.lat, first.lon)}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-4xl flex-[1_1_28rem]">
          {participant ? <TitleEdit title={t.title} onSave={(title) => save.mutate({ title })} /> : <h1 className="display-hero">{t.title}</h1>}
          <p className="mt-3 text-lg text-ink-soft">
            {[
              destinations.map(name).join(', ') || (first && name(first.country_code)),
              km > 0 && `${formatKm(km)} km`,
              days && `${days} días${mainMode ? ` en ${TRANSPORT[mainMode].label.toLowerCase()}` : ''}`,
              t.start_date && formatDate(t.start_date, 'long'),
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {participant && planned && (
            <button className="btn btn-accent" disabled={save.isPending} onClick={() => setStatus('done')}>
              <Icon name="task_alt" size={18} /> Ya lo hice
            </button>
          )}
          <button className={`btn ${planned && participant ? 'btn-ghost' : 'btn-accent'}`} onClick={() => setSharing(true)}>
            <Icon name="ios_share" size={18} /> Compartir imagen
          </button>
          {participant && (
            <MoreMenu
              tripId={t.id}
              owner={owner}
              deleting={remove.isPending}
              onDelete={() => {
                if (confirm(`¿Eliminar «${t.title}» con sus paradas, fotos, gastos y documentos? No se puede deshacer.`)) remove.mutate()
              }}
            />
          )}
        </div>
      </div>
      <ErrorNote error={save.error ?? remove.error} />

      <nav
        ref={tabsRef}
        role="tablist"
        aria-label="Secciones del viaje"
        className="sticky top-16 z-30 -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-surface-highest bg-surface/95 px-4 backdrop-blur [scrollbar-width:none] md:-mx-12 md:px-12 print:hidden"
      >
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => goTab(x.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === x.id ? 'border-accent text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            <Icon name={x.icon} size={18} className={tab === x.id ? 'text-accent' : ''} />
            {x.label}
            {!!counts[x.id] && <span className="rounded-full bg-surface-container px-1.5 text-[11px] text-ink-soft">{counts[x.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'resumen' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
            <div className="min-w-0 space-y-6">
              <div className="card grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
                <StatTile label="Duración" icon="calendar_month" value={days ?? '—'} unit="días" hint={t.start_date ? `${formatDate(t.start_date)} — ${formatDate(t.end_date)}` : 'Sin fechas'} />
                <StatTile label="Distancia" icon="route" value={formatKm(km)} unit="km" hint={`${(km / 40075).toFixed(2)} vueltas a la Tierra`} />
                <StatTile label="Países" icon="public" value={countries.length} hint={countries.join(' · ') || '—'} />
                <StatTile label="Paradas" icon="pin_drop" value={t.stops.length} hint={plural(t.photos.length, 'foto', 'fotos')} />
              </div>
              {planned && participant && <PassportAlert warnings={passportWarnings([t], passports.data ?? [], profile.data?.home_country ?? 'ES')} showTrip={false} />}
              {planned && participant && <PrepChecklist trip={t} onTab={goTab} />}
              {participant ? (
                <TripDetails trip={t} saving={save.isPending} onSave={(patch) => save.mutate(patch)} />
              ) : (
                <ReadDetails trip={t} />
              )}
              {planned && participant && t.stops.length > 0 && (
                <section>
                  <h2 className="headline-sm mb-3 flex items-center gap-2 uppercase">
                    <Icon name="partly_cloudy_day" className="text-accent" /> Tiempo previsto
                  </h2>
                  <WeatherTab trip={t} />
                </section>
              )}
            </div>
            <aside className="min-w-0 space-y-6">
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="headline-sm uppercase">Ruta</h3>
                  <button type="button" className="label-code text-accent-deep hover:underline" onClick={() => goTab('ruta')}>
                    {t.stops.length ? `${plural(t.stops.length, 'parada', 'paradas')} →` : 'Añadir paradas →'}
                  </button>
                </div>
                {map}
              </div>
              {participant && <TripShareLink trip={t} />}
              <TripCrew trip={t} />
              <Soundtrack trip={t} />
            </aside>
          </div>
        )}

        {tab === 'dias' && <DaysTab trip={t} onDates={() => goTab('resumen')} />}

        {tab === 'ruta' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
            <RouteTab trip={t} legs={legs} participant={participant} onPhoto={openPhoto} />
            <aside className="min-w-0 space-y-6 lg:order-none">
              <div className="card p-4 lg:sticky lg:top-32">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="headline-sm uppercase">Mapa</h3>
                  <span className="label-code text-accent-deep">{formatKm(km)} km total</span>
                </div>
                {map}
                {legs.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {legs.map(({ stop, km: lk }, j) => (
                      <li key={stop.id} className="flex items-center gap-3 rounded-sm bg-surface-low px-3 py-2 text-sm">
                        <Icon name={TRANSPORT[stop.transport_in ?? 'car'].icon} size={18} className="text-accent" />
                        <span className="min-w-0 flex-1 truncate">
                          {t.stops[j].name} → {stop.name}
                        </span>
                        <span className="label-code text-ink-soft">{formatKm(lk)} km</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}

        {tab === 'fotos' && <PhotosTab trip={t} gallery={gallery} participant={participant} onOpen={setViewer} />}

        {tab === 'gastos' && (
          <div className="max-w-3xl">
            <TripBudget trip={t} />
          </div>
        )}

        {tab === 'equipaje' && <PackingTab trip={t} home={profile.data?.home_country ?? 'ES'} />}
        {tab === 'documentos' && <DocumentsTab trip={t} />}
      </div>

      {sharing && shareData && (
        <Suspense fallback={null}>
          <ShareSheet data={shareData} photos={sharePhotos} onClose={() => setSharing(false)} />
        </Suspense>
      )}
      {viewer !== null && gallery.length > 0 && <PhotoViewer photos={gallery} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

// ───────────────────────────── Cabecera ─────────────────────────────

/** Título editable con un toque (Enter guarda, Escape cancela). */
function TitleEdit({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  useEffect(() => setValue(title), [title])
  const commit = () => {
    setEditing(false)
    const v = value.trim().slice(0, 120)
    if (v && v !== title) onSave(v)
    else setValue(title)
  }
  if (editing)
    return (
      <input
        aria-label="Nombre del viaje"
        className="display-hero w-full rounded-sm bg-card px-2 outline-none ring-2 ring-accent"
        value={value}
        maxLength={120}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setValue(title)
            setEditing(false)
          }
        }}
      />
    )
  // El lápiz va pegado a la última palabra para que no salte solo a otra línea.
  const words = title.split(' ')
  const last = words.pop()
  return (
    <h1 className="display-hero">
      <button type="button" onClick={() => setEditing(true)} className="group text-left" title="Cambiar el nombre">
        {words.length > 0 && `${words.join(' ')} `}
        <span className="whitespace-nowrap">
          {last}
          <Icon name="edit" size={22} className="ml-2 align-middle text-ink-soft opacity-40 transition group-hover:opacity-100" />
        </span>
      </button>
    </h1>
  )
}

function MoreMenu({ tripId, owner, deleting, onDelete }: { tripId: string; owner: boolean; deleting: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const item = 'flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-surface-low'
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-ghost" aria-expanded={open} aria-label="Más opciones" onClick={() => setOpen(!open)}>
        <Icon name="more_horiz" size={18} /> <span className="hidden sm:inline">Más</span>
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-64 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.18)]" role="menu">
          <Link to={`/app/viajes/${tripId}/editar?paso=ruta`} className={item} role="menuitem">
            <Icon name="add_location_alt" size={18} /> Añadir o mover paradas
          </Link>
          <Link to={`/app/viajes/${tripId}/editar?paso=recuerdos`} className={item} role="menuitem">
            <Icon name="music_note" size={18} /> Notas, música y portada
          </Link>
          <Link to={`/app/viajes/${tripId}/editar`} className={item} role="menuitem">
            <Icon name="edit_note" size={18} /> Abrir el asistente completo
          </Link>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false)
              setTimeout(() => window.print(), 50)
            }}
          >
            <Icon name="picture_as_pdf" size={18} /> Exportar PDF
          </button>
          {owner && (
            <>
              <div className="my-1 h-px bg-surface-highest" />
              <button
                type="button"
                role="menuitem"
                disabled={deleting}
                className={`${item} text-red-700 hover:bg-red-50`}
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                <Icon name="delete" size={18} /> {deleting ? 'Eliminando…' : 'Eliminar viaje'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Resumen ─────────────────────────────

/** Lo que falta para tener el viaje listo, con un toque a la pestaña donde se hace. */
function PrepChecklist({ trip: t, onTab }: { trip: TripWithStops; onTab: (tab: TripTab) => void }) {
  const budget = useQuery({ queryKey: ['budget', t.id], queryFn: () => api.getBudget(t.id) })
  const expenses = useQuery({ queryKey: ['expenses', t.id], queryFn: () => api.listExpenses(t.id) })
  const packing = useQuery({ queryKey: ['packing', t.id], queryFn: () => api.listPacking(t.id) })
  const docs = useQuery({ queryKey: ['documents', t.id], queryFn: () => api.listDocuments(t.id) })
  const packed = packing.data?.filter((x) => x.packed).length ?? 0
  const items: { label: string; hint: string; icon: string; done: boolean; go: () => void }[] = [
    { label: 'Fechas', hint: t.start_date ? 'Hechas' : 'Ida y vuelta', icon: 'calendar_month', done: !!t.start_date, go: () => document.getElementById('detalles')?.scrollIntoView({ behavior: 'smooth' }) },
    { label: 'Ruta', hint: t.stops.length ? plural(t.stops.length, 'parada', 'paradas') : 'Por dónde vas', icon: 'route', done: t.stops.length >= 2, go: () => onTab('ruta') },
    { label: 'Día a día', hint: t.sights.length ? plural(t.sights.length, 'plan', 'planes') : 'Qué ver cada día', icon: 'event_note', done: t.sights.length > 0, go: () => onTab('dias') },
    {
      label: 'Presupuesto',
      hint: budget.data?.amount ? 'Fijado' : expenses.data?.length ? plural(expenses.data.length, 'gasto', 'gastos') : 'Cuánto gastar',
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
function TripDetails({ trip: t, saving, onSave }: { trip: TripWithStops; saving: boolean; onSave: (patch: Parameters<typeof api.updateTrip>[1]) => void }) {
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${t.style === s ? 'bg-ink text-white' : 'bg-surface-low hover:bg-surface-container'}`}
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${t.solo ? 'bg-ink text-white' : 'bg-surface-low hover:bg-surface-container'}`}
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

function ReadDetails({ trip: t }: { trip: TripWithStops }) {
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

function Soundtrack({ trip: t }: { trip: TripWithStops }) {
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

// ───────────────────────────── Día a día ─────────────────────────────

function DaysTab({ trip: t, onDates }: { trip: TripWithStops; onDates: () => void }) {
  const add = useTravelMutation(({ stopId, sight }: { stopId: string; sight: NewSight }) => api.addSight(stopId, sight))
  const update = useTravelMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateSight>[1] }) => api.updateSight(id, patch))
  const remove = useTravelMutation((x: Pick<Sight, 'id'>) => api.deleteSight(x.id))
  if (!t.stops.length)
    return (
      <Empty icon="add_location_alt" title="Primero, la ruta">
        <p className="mt-1 text-ink-soft">El día a día se organiza por las paradas del viaje.</p>
        <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-accent mt-4">
          Añadir paradas
        </Link>
      </Empty>
    )
  return (
    <div>
      <ErrorNote error={add.error ?? update.error ?? remove.error} />
      {!t.start_date && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-sm bg-surface-low px-4 py-3 text-sm">
          <Icon name="date_range" className="text-accent" />
          <span className="flex-1">Pon las fechas del viaje para verlo organizado por días.</span>
          <button type="button" className="btn btn-dark py-1.5!" onClick={onDates}>
            Poner fechas
          </button>
        </div>
      )}
      <DayPlan
        trip={t}
        ops={{
          add: (stopId, sight) => add.mutate({ stopId, sight }),
          update: (id, patch) => update.mutate({ id, patch }),
          remove: (id) => remove.mutate({ id }),
        }}
      />
    </div>
  )
}

// ───────────────────────────── Ruta ─────────────────────────────

function RouteTab({
  trip: t,
  legs,
  participant,
  onPhoto,
}: {
  trip: TripWithStops
  legs: { stop: Stop; km: number }[]
  participant: boolean
  onPhoto: (id: string) => void
}) {
  const dayOf = (d: string | null) => (d && t.start_date ? Math.round((Date.parse(d) - Date.parse(t.start_date)) / 86_400_000) + 1 : null)
  const kmAt = legs.reduce<number[]>((acc, l) => [...acc, acc.at(-1)! + l.km], [0])
  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="headline-sm flex items-center gap-2 uppercase">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Paradas
        </h2>
        {participant && (
          <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-dark py-1.5!">
            <Icon name="edit_road" size={18} /> Añadir o mover paradas
          </Link>
        )}
      </div>
      {!t.stops.length && (
        <Empty icon="add_location_alt" title="Sin paradas todavía">
          {participant && (
            <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-accent mt-4">
              Añadir la ruta
            </Link>
          )}
        </Empty>
      )}
      <ol className="space-y-4">
        {t.stops.map((s, i) => {
          const d = dayOf(s.arrived_on)
          const photos = t.photos.filter((p) => p.stop_id === s.id)
          return (
            <li key={s.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="headline-sm flex flex-wrap items-center gap-2">
                  <span className={`label-code px-1.5 py-0.5 text-white ${i % 2 ? 'bg-accent' : 'bg-ink'}`}>{d ? `Día ${String(d).padStart(2, '0')}` : `Parada ${i + 1}`}</span>
                  {s.name}
                  <Flag code={s.country_code} />
                </h3>
                <span className="flex items-center gap-2">
                  <WeatherChip lat={s.lat} lon={s.lon} date={s.arrived_on} />
                  <span className="label-code text-ink-soft">{s.arrived_on ? formatDate(s.arrived_on).toUpperCase() : '—'}</span>
                </span>
              </div>
              {i > 0 && s.transport_in && (
                <div className="label-code mt-2 flex items-center gap-1.5 text-ink-soft">
                  <Icon name={TRANSPORT[s.transport_in].icon} size={16} className="text-accent" />
                  {TRANSPORT[s.transport_in].label}
                  {s.transport_in === 'plane' && s.from_airport && s.to_airport && ` · ${s.flight_no ? `${s.flight_no} · ` : ''}${s.from_airport} → ${s.to_airport}`}
                  {` · ${formatKm(legs[i - 1].km)} km`}
                </div>
              )}
              <StopNotes stop={s} editable={participant} />
              {t.status === 'done' && t.sights.some((x) => x.stop_id === s.id) && (
                <div className="mt-4 rounded-sm bg-surface-low p-3">
                  <StopSights stop={s} sights={t.sights.filter((x) => x.stop_id === s.id)} planned={false} readOnly onAdd={() => {}} onToggle={() => {}} onRemove={() => {}} />
                </div>
              )}
              {s.song_url && <SpotifyPlayer url={s.song_url} compact className="mt-4" />}
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {photos.slice(0, 6).map((p) => (
                    <button key={p.id} onClick={() => onPhoto(p.id)} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-surface-container" aria-label={`Ver foto de ${s.name}`}>
                      <img src={api.photoUrl(p.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="label-code mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {s.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                  {s.rating && <Stars value={s.rating} />}
                </div>
                <span className="text-accent-deep">Km {formatKm(kmAt[i])}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Notas de una parada, editables en el sitio. */
function StopNotes({ stop: s, editable }: { stop: Stop; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(s.notes ?? '')
  const save = useTravelMutation((notes: string | null) => api.updateStop(s.id, { notes }))
  useEffect(() => setValue(s.notes ?? ''), [s.notes])
  if (editing)
    return (
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(value.trim() || null, { onSuccess: () => setEditing(false) })
        }}
      >
        <textarea aria-label={`Notas de ${s.name}`} className="field min-h-24 resize-y" autoFocus value={value} maxLength={4000} onChange={(e) => setValue(e.target.value)} />
        <ErrorNote error={save.error} />
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost py-1.5!" onClick={() => (setValue(s.notes ?? ''), setEditing(false))}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-dark py-1.5!" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    )
  return (
    <div className="mt-3">
      {s.notes ? <p className="whitespace-pre-line leading-relaxed">{s.notes}</p> : !editable && <p className="text-ink-soft">Sin notas.</p>}
      {editable && (
        <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-accent-deep hover:underline">
          <Icon name={s.notes ? 'edit' : 'edit_note'} size={16} /> {s.notes ? 'Editar notas' : 'Añadir notas'}
        </button>
      )}
    </div>
  )
}

// ───────────────────────────── Fotos ─────────────────────────────

function PhotosTab({
  trip: t,
  gallery,
  participant,
  onOpen,
}: {
  trip: TripWithStops
  gallery: (ViewerPhoto & { stopId: string | null; stopName?: string })[]
  participant: boolean
  onOpen: (i: number) => void
}) {
  const [stopId, setStopId] = useState<string>('')
  const [progress, setProgress] = useState<string | null>(null)
  const upload = useTravelMutation(async (files: File[]) => {
    const images = files.filter(looksLikeImage).slice(0, 10)
    const failed: string[] = []
    for (const [i, f] of images.entries()) {
      setProgress(`Subiendo ${i + 1} de ${images.length}`)
      try {
        await api.uploadPhoto(t.id, f, stopId || null)
      } catch (e) {
        failed.push(e instanceof Error ? e.message : f.name)
      }
    }
    setProgress(null)
    const problems = [...(files.length > images.length ? ['Solo se suben 10 imágenes cada vez.'] : []), ...failed]
    if (problems.length) throw new Error(problems.join(' '))
  })
  // Por parada, en el orden de la ruta; las sueltas al final.
  const groups = useMemo(() => {
    const g: { key: string; title: string; items: { i: number; url: string; id: string }[] }[] = []
    gallery.forEach((p, i) => {
      const key = p.stopId ?? ''
      let grp = g.find((x) => x.key === key)
      if (!grp) g.push((grp = { key, title: p.stopName ?? 'Sin parada', items: [] }))
      grp.items.push({ i, url: p.url, id: p.id })
    })
    return g
  }, [gallery])

  return (
    <div>
      {participant && (
        <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
          <Icon name="add_photo_alternate" className="text-accent" />
          <span className="flex-1 text-sm">
            <b className="font-display">Añadir fotos</b>
            <span className="block text-ink-soft">Hasta 10 cada vez. Las HEIC del iPhone se convierten solas.</span>
          </span>
          {t.stops.length > 0 && (
            <select aria-label="Parada de las fotos" className="h-10 rounded-full bg-surface-low px-3 text-sm ring-1 ring-outline-soft" value={stopId} onChange={(e) => setStopId(e.target.value)}>
              <option value="">Sin parada</option>
              {t.stops.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.name}
                </option>
              ))}
            </select>
          )}
          <label className={`btn cursor-pointer ${upload.isPending ? 'btn-ghost' : 'btn-accent'}`}>
            <Icon name={upload.isPending ? 'sync' : 'upload'} size={18} className={upload.isPending ? 'animate-spin' : ''} /> {progress ?? 'Elegir fotos'}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              disabled={upload.isPending}
              onChange={(e) => {
                if (e.target.files?.length) upload.mutate([...e.target.files])
                e.target.value = ''
              }}
            />
          </label>
          <div className="w-full">
            <ErrorNote error={upload.error} />
          </div>
        </div>
      )}
      {!gallery.length ? (
        <Empty icon="photo_library" title="Aún no hay fotos">
          {participant && <p className="mt-1 text-ink-soft">Súbelas arriba o crea el viaje desde tus fotos para que se coloquen solas.</p>}
        </Empty>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="label-stamp mb-2 flex items-center justify-between text-ink-soft">
                <span>{g.title}</span>
                <span>{plural(g.items.length, 'foto', 'fotos')}</span>
              </h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {g.items.map((p) => (
                  <button key={p.id} onClick={() => onOpen(p.i)} aria-label={`Ver foto ${p.i + 1} (${g.title})`} className="group relative aspect-square overflow-hidden rounded-sm bg-surface-container">
                    <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
