import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ask, deleteTripQuestion } from '../components/ConfirmDialog'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AirportInput } from '../components/AirportInput'
import { DateField, DateRangeField, daysBetween, formatDay } from '../components/DatePicker'
import { AddFlight, FlightField } from '../components/FlightLookup'
import { Icon } from '../components/Icon'
import { PlaceSearch } from '../components/PlaceSearch'
import { SpotifyField } from '../components/Spotify'
import { Stamp } from '../components/Stamp'
import { DayPlan } from '../components/DayPlan'
import { TripBudget } from '../components/TripBudget'
import { ErrorNote, Flag, Spinner, plural } from '../components/ui'
import { WorldMap } from '../components/LazyWorldMap'
import { api, type TripFields } from '../lib/api'
import type { NewSight } from '../lib/api/types'
import { useAuth } from '../lib/auth'
import { computeStamps } from '../lib/badges'
import { isNote, type Sight, type Stop, type TransportMode, type TripStyle, type TripWithStops } from '../lib/db'
import { haversine } from '../lib/geo'
import type { FlightAirport, FlightRoute } from '../lib/flights'
import { lookupPlaceCodes, type Place } from '../lib/geocode'
import { datesAfterEdit, datesAfterMove, isReturnHome } from '../lib/days'
import { appendStops, type DraftStop } from '../lib/import/common'
import { knownPlaceNear } from '../lib/placesIndex'
import { nearestAirportLocal, preloadAirports } from '../lib/airportIndex'
import { IMAGE_ACCEPT, looksLikeImage } from '../lib/images'
import { useAirportMap, useCountries, useInvalidateTravel, useProfile, useTrip } from '../lib/hooks'
import { formatKm, legKm, tripKm } from '../lib/stats'
import { TRANSPORT, TRANSPORT_MODES, TRIP_STYLES } from '../lib/transport'

const STEPS = [
  { id: 'destino', label: 'Viaje' },
  { id: 'ruta', label: 'Ruta' },
  { id: 'dias', label: 'Día a día' },
  { id: 'recuerdos', label: 'Recuerdos' },
  { id: 'sello', label: 'Resumen' },
] as const
type StepId = (typeof STEPS)[number]['id']
type Draft = TripFields & { title: string }

const EMPTY_DRAFT: Draft = {
  title: '',
  style: null,
  start_date: null,
  end_date: null,
  solo: false,
  companions: [],
  description: null,
  status: 'done',
  soundtrack_url: null,
}

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function TripEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const step = (STEPS.find((s) => s.id === params.get('paso'))?.id ?? 'destino') as StepId
  const stepIdx = STEPS.findIndex((s) => s.id === step)
  const trip = useTrip(id)
  const me = useAuth().user?.id
  const profile = useProfile()
  const invalidate = useInvalidateTravel()
  const countries = useCountries()
  const airports = useAirportMap(trip.data?.stops.flatMap((s) => [s.from_airport, s.to_airport]) ?? [])

  // «Planificar viaje» abre el editor con ?plan=1: el viaje nace planificado.
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY_DRAFT, status: params.get('plan') === '1' ? 'planned' : 'done' }))
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [, tick] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Carga los campos del viaje existente una sola vez (no pisa lo que se está escribiendo).
  const loadedId = useRef<string | null>(null)
  useEffect(() => {
    if (trip.data && loadedId.current !== trip.data.id) {
      loadedId.current = trip.data.id
      const { title, style, start_date, end_date, solo, companions, description, status, soundtrack_url } = trip.data
      setDraft({ title, style, start_date, end_date, solo, companions, description, status, soundtrack_url: soundtrack_url ?? null })
    }
  }, [trip.data])

  // El índice de aeropuertos se descarga en segundo plano para que la búsqueda sea instantánea.
  useEffect(() => {
    preloadAirports().catch(() => {})
  }, [])

  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(i)
  }, [])

  const goStep = (s: StepId) => {
    setParams({ paso: s }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Crea el viaje la primera vez que hace falta un id (añadir parada, foto o guardar). */
  async function ensureTrip(): Promise<TripWithStops> {
    if (trip.data) return trip.data
    const created = await api.createTrip(tripFields(draft))
    const full: TripWithStops = { ...created, stops: [], photos: [], sights: [], member_count: 0 }
    // El viaje recién creado ya está en caché: al cambiar de dirección no se pierde lo elegido.
    loadedId.current = created.id
    qc.setQueryData(['trip', created.id], full)
    await invalidate()
    navigate(`/app/viajes/${created.id}/editar?paso=${step}`, { replace: true })
    return full
  }

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch }
    // Ida después de la vuelta: la vuelta pasa a ser ese mismo día.
    if (next.start_date && next.end_date && next.end_date < next.start_date) next.end_date = next.start_date
    setDraft(next)
    if (!id) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateTrip(id, tripFields(next))
        setSavedAt(Date.now())
        invalidate()
      } catch (e) {
        setError(e)
      }
    }, 600)
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    setError(null)
    try {
      await fn()
      await invalidate()
      setSavedAt(Date.now())
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const addPlace = (p: Place) =>
    run('Añadiendo parada', async () => {
      const t = await ensureTrip()
      // Un país entero no tiene región: consultar su centro marcaría una región al azar como visitada.
      const codes = p.kind === 'country' ? {} : await lookupPlaceCodes(p.lat, p.lon).catch(() => ({}) as Awaited<ReturnType<typeof lookupPlaceCodes>>)
      const wanted = [codes.regionCode, codes.provinceCode].filter((c): c is string => !!c)
      const known = new Set((await api.getSubdivisions(wanted)).map((s) => s.code))
      const prev = t.stops.at(-1)
      let transport: TransportMode | null = null
      let from_airport: string | null = null
      let to_airport: string | null = null
      if (prev) {
        const km = haversine([prev.lon, prev.lat], [p.lon, p.lat])
        transport = km > 600 ? 'plane' : km < 5 ? 'walk' : 'car'
        if (transport === 'plane') {
          ;[from_airport, to_airport] = await Promise.all([nearestAirportLocal(prev.lat, prev.lon), nearestAirportLocal(p.lat, p.lon)]).then((r) =>
            r.map((x) => x ?? null),
          )
        }
      }
      await api.addStop(t, {
        name: p.name,
        country_code: codes.countryCode ?? p.countryCode,
        region_code: codes.regionCode && known.has(codes.regionCode) ? codes.regionCode : null,
        province_code: codes.provinceCode && known.has(codes.provinceCode) ? codes.provinceCode : null,
        lat: p.lat,
        lon: p.lon,
        // Volver a la ciudad de salida es la vuelta a casa: por defecto, el último día del viaje.
        arrived_on:
          t.stops.length && draft.end_date && haversine([t.stops[0].lon, t.stops[0].lat], [p.lon, p.lat]) < 30 ? draft.end_date : (prev?.arrived_on ?? draft.start_date ?? null),
        transport_in: transport,
        from_airport,
        to_airport,
      })
    })

  const uploadFiles = (files: FileList | File[], stopId?: string | null) =>
    run('Subiendo fotos', async () => {
      const all = [...files]
      const images = all.filter(looksLikeImage).slice(0, 10)
      const rejected = all.filter((f) => !looksLikeImage(f)).map((f) => f.name)
      const t = await ensureTrip()
      const failed: string[] = []
      for (const [i, f] of images.entries()) {
        setBusy(`Subiendo foto ${i + 1} de ${images.length}${/.(heic|heif)$/i.test(f.name) ? ' (convirtiendo HEIC)' : ''}`)
        try {
          await api.uploadPhoto(t.id, f, stopId)
        } catch (e) {
          failed.push(e instanceof Error ? e.message : f.name)
        }
      }
      const problems = [
        ...(rejected.length ? [`No son imágenes: ${rejected.join(', ')}.`] : []),
        ...(all.length > 10 ? ['Solo se suben 10 fotos cada vez.'] : []),
        ...failed,
      ]
      if (problems.length) throw new Error(problems.join(' '))
    })

  const sightOps: SightOps = {
    add: (stopId, x) => run('Añadiendo sitio', () => api.addSight(stopId, x)),
    toggle: (x) => run('Guardando', () => api.updateSight(x.id, { done: !x.done })),
    update: (sid, patch) => run('Guardando', () => api.updateSight(sid, patch)),
    remove: (x) => run('Quitando sitio', () => api.deleteSight(x.id)),
  }

  /** Vuelo por número: añade la ciudad de llegada (y antes la de salida si la ruta no termina allí). */
  const addFlight = (route: FlightRoute, date: string | null) =>
    run('Añadiendo vuelo', async () => {
      const t = await ensureTrip()
      const known = new Set((await api.getAirports([route.from.iata, route.to.iata])).map((a) => a.iata))
      const cityOf = async (a: FlightAirport): Promise<DraftStop> => {
        const q = await knownPlaceNear(a.lat, a.lon, a.countryCode, 50).catch(() => undefined)
        return { name: q?.es ?? a.city, lat: q?.lat ?? a.lat, lon: q?.lon ?? a.lon, countryCode: a.countryCode, arrived_on: date }
      }
      const last = t.stops.at(-1)
      const drafts: DraftStop[] = []
      if (!last || haversine([last.lon, last.lat], [route.from.lon, route.from.lat]) > 100) drafts.push(await cityOf(route.from))
      drafts.push({
        ...(await cityOf(route.to)),
        transport: 'plane',
        from_airport: known.has(route.from.iata) ? route.from.iata : null,
        to_airport: known.has(route.to.iata) ? route.to.iata : null,
        flight_no: route.flight,
      })
      await appendStops(t, drafts)
    })

  /** Reparte los días del viaje entre las paradas: la primera el día de ida, la última el de vuelta. */
  const spreadDates = () =>
    run('Repartiendo fechas', async () => {
      const t = trip.data
      if (!t || !draft.start_date || !draft.end_date || t.stops.length < 2) return
      const span = daysBetween(draft.start_date, draft.end_date) - 1
      const n = t.stops.length
      await Promise.all(
        t.stops.map((s, i) => {
          const d = addDays(draft.start_date!, Math.round((i * span) / (n - 1)))
          return d === s.arrived_on ? null : api.updateStop(s.id, { arrived_on: d })
        }),
      )
    })

  /** Guarda todo y abre la bitácora del viaje. */
  const finish = () =>
    run(draft.status === 'planned' ? 'Guardando plan' : 'Guardando viaje', async () => {
      clearTimeout(saveTimer.current)
      const tt = await ensureTrip()
      await api.updateTrip(tt.id, tripFields(draft))
      navigate(`/app/viajes/${tt.id}`)
    })

  if (id && trip.isLoading) return <Spinner label="Abriendo el viaje" />

  const t = trip.data
  const stops = t?.stops ?? []
  const planned = draft.status === 'planned'
  const stamps = t && !planned ? computeStamps([{ ...t, status: 'done' }]) : []
  const isOwner = !id || t?.user_id === me
  const last = stepIdx === STEPS.length - 1
  const saveLabel = busy ? `${busy}…` : savedAt ? `Guardado hace ${Math.max(1, Math.round((Date.now() - savedAt) / 1000))} s` : id ? 'Cambios guardados' : 'Se guarda al añadir la primera parada'

  return (
    <div className="card relative">
      {/* Cabecera: título, estado y pasos */}
      <div className="border-b border-surface-highest p-5 md:px-10 md:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className={`label-code inline-flex items-center gap-1.5 rounded-sm px-2 py-1 ${planned ? 'bg-accent-soft text-accent-ink' : 'bg-surface-container'}`}>
              <Icon name={planned ? 'event_upcoming' : 'task_alt'} size={16} /> {planned ? 'Viaje planificado' : 'Viaje realizado'}
            </span>
            <h1 className="headline-lg mt-2 truncate md:text-[40px]! md:leading-[44px]!">
              {draft.title.trim() || (id ? 'Editar viaje' : planned ? 'Nuevo plan de viaje' : 'Nuevo viaje')}
            </h1>
          </div>
          <span className="flex items-center gap-2 text-sm text-ink-soft">
            <Icon name={busy ? 'sync' : 'cloud_done'} size={18} className={busy ? 'animate-spin' : ''} /> {saveLabel}
          </span>
        </div>
        <nav aria-label="Pasos" className="-mx-5 mt-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0">
          {STEPS.map((s, i) => {
            const active = s.id === step
            const passed = i < stepIdx
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goStep(s.id)}
                aria-current={active ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold transition ${active ? 'bg-ink text-paper' : 'bg-surface-low text-ink-soft hover:text-ink'}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${active ? 'bg-accent text-white' : passed ? 'bg-ink text-paper' : 'bg-card'}`}>
                  {passed ? <Icon name="check" size={16} /> : i + 1}
                </span>
                {s.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="p-5 md:p-10">
        <ErrorNote error={error} />

        {step === 'dias' && (
          <div>
            <h2 className="headline-md">{planned ? '¿Qué vais a ver cada día?' : '¿Qué visitasteis cada día?'}</h2>
            <p className="mb-5 mt-1 text-ink-soft">Un día por cada día del viaje, con la ciudad en la que estáis. Busca sitios, elige de las ideas o escribe lo que quieras; la hora es opcional.</p>
            {t ? (
              <DayPlan
                trip={{ ...t, start_date: draft.start_date ?? null, end_date: draft.end_date ?? null, status: draft.status ?? t.status }}
                ops={{ add: sightOps.add, update: sightOps.update, remove: (sid) => sightOps.remove({ id: sid } as Sight) }}
                onSetDates={(a, b) => update({ start_date: a, end_date: b })}
              />
            ) : (
              <p className="rounded-md bg-surface-low p-6 text-ink-soft">
                Primero añade la ruta.{' '}
                <button type="button" className="font-semibold underline" onClick={() => goStep('ruta')}>
                  Ir a la ruta
                </button>
              </p>
            )}
          </div>
        )}
        <div className={`grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px] ${step === 'dias' ? 'hidden' : ''}`}>
          <div className="min-w-0">
            {step === 'destino' && <DestinoStep draft={draft} update={update} />}
            {step === 'ruta' && (
              <RutaStep
                trip={t}
                airports={airports}
                planned={planned}
                range={[draft.start_date ?? null, draft.end_date ?? null]}
                busy={busy}
                onAdd={addPlace}
                onChange={(stopId, patch) =>
                  run('Guardando', async () => {
                    const i = stops.findIndex((x) => x.id === stopId)
                    // Al cambiar un día de llegada, el resto de fechas se ajusta solo.
                    if (i < 0 || !('arrived_on' in patch) || Object.keys(patch).length > 1) return api.updateStop(stopId, patch)
                    const changes = datesAfterEdit(stops, i, patch.arrived_on ?? null, draft.end_date ?? null)
                    await Promise.all([...changes].map(([sid, d]) => api.updateStop(sid, { arrived_on: d })))
                  })
                }
                onRemove={(stopId) => run('Quitando parada', () => api.deleteStop(stopId))}
                onMove={(from, to) =>
                  run('Reordenando', () => {
                    const next = [...stops]
                    const [moved] = next.splice(from, 1)
                    next.splice(to, 0, moved)
                    // Las fechas siguen a las posiciones: los días se quedan y cambia qué ciudad va cada día.
                    const changes = datesAfterMove(next, draft.end_date ?? null)
                    return Promise.all([api.reorderStops(next), ...[...changes].map(([sid, d]) => api.updateStop(sid, { arrived_on: d }))])
                  })
                }
                onSpread={spreadDates}
                onAddFlight={addFlight}
                onEditDates={() => goStep('destino')}
                home={stops[0]?.country_code ?? profile.data?.home_country ?? undefined}
              />
            )}
            {step === 'recuerdos' && (
              <RecuerdosStep
                trip={t}
                planned={planned}
                soundtrack={draft.soundtrack_url ?? null}
                onSoundtrack={(url) => update({ soundtrack_url: url })}
                onChange={(stopId, patch) => run('Guardando', () => api.updateStop(stopId, patch))}
                onUpload={uploadFiles}
                onDeletePhoto={(p) => run('Eliminando foto', () => api.deletePhoto(p))}
                onGoRoute={() => goStep('ruta')}
              />
            )}
            {step === 'sello' && (
              <ResumenStep
                trip={t}
                draft={draft}
                airports={airports}
                stamps={stamps}
                countryName={countries.name}
                onStatus={(s) => update({ status: s })}
                canDelete={!!id && isOwner}
                onDelete={async () => {
                  if (id && (await ask(deleteTripQuestion(draft.title || 'este viaje'))))
                    run('Eliminando', () => api.deleteTrip(id)).then(() => navigate('/app/bitacora'))
                }}
              />
            )}
          </div>

          {/* Lateral (pantallas grandes): mapa, fotos y sello */}
          <aside className="hidden space-y-6 lg:block">
            <RouteMap trip={t} airports={airports} />
            <PhotoStrip trip={t} onUpload={(f) => uploadFiles(f)} />
            <div className="rounded-md bg-surface-container p-5">
              <div className="label-code mb-3 flex justify-between">
                <span>{planned ? 'Sellos' : 'Vista previa de los sellos'}</span>
                {!planned && stamps.length > 1 && <span className="text-ink-soft">{stamps.length}</span>}
              </div>
              <div className="grid min-h-40 place-items-center rounded-md border-2 border-dashed border-accent/60 p-6">
                {planned ? (
                  <span className="text-center text-sm text-ink-soft">Los sellos se estampan cuando marques el viaje como realizado.</span>
                ) : stamps.length ? (
                  // Todos los sellos del viaje, en el orden de la ruta.
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {[...stamps].reverse().map((x) => (
                      <Stamp
                        key={x.key}
                        size={stamps.length > 1 ? 'sm' : 'md'}
                        stampKey={x.key}
                        countryCode={x.countryCode}
                        countryName={countries.name(x.countryCode)}
                        place={x.place}
                        date={x.date}
                        airport={x.airport}
                        domestic={x.domestic}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-center text-sm text-ink-soft">Aparece al añadir un destino en otro país o al llegar en avión a un aeropuerto nacional.</span>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Barra de acciones: fija abajo mientras se edita */}
      <div className="sticky bottom-0 z-30 flex items-center justify-between gap-3 rounded-b-md border-t border-surface-highest bg-card/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:px-10">
        <div className="flex items-center gap-2">
          {stepIdx > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => goStep(STEPS[stepIdx - 1].id)}>
              <Icon name="arrow_back" size={18} /> <span className="hidden sm:inline">Atrás</span>
            </button>
          )}
          {!last && (
            <button type="button" className="btn hidden text-ink-soft hover:text-ink sm:inline-flex" disabled={!!busy} onClick={finish}>
              Guardar y salir
            </button>
          )}
        </div>
        {last ? (
          <button type="button" className="btn btn-accent px-6!" disabled={!!busy} onClick={finish}>
            <Icon name={planned ? 'event_upcoming' : 'task_alt'} size={18} /> {planned ? 'Guardar plan' : 'Guardar viaje'}
          </button>
        ) : (
          <button type="button" className="btn btn-dark px-6!" onClick={() => goStep(STEPS[stepIdx + 1].id)}>
            Siguiente: {STEPS[stepIdx + 1].label} <Icon name="arrow_forward" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-display font-semibold">{label}</span>
        {hint && <span className="text-sm text-ink-soft">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ───────────────────────────── Paso 1: el viaje ─────────────────────────────

function DestinoStep({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const [mate, setMate] = useState('')
  const planned = draft.status === 'planned'
  const now = today()
  const addMate = () => {
    const name = mate.trim()
    if (name && !draft.companions?.includes(name)) update({ companions: [...(draft.companions ?? []), name], solo: false })
    setMate('')
  }
  const future = !planned && !!draft.start_date && draft.start_date > now
  const past = planned && !!(draft.end_date ?? draft.start_date) && (draft.end_date ?? draft.start_date)! < now

  return (
    <div className="space-y-8">
      <Field label="¿Ya lo has hecho?">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['done', 'task_alt', 'Ya lo hice', 'Cuenta en tu mapa, tu pasaporte y tus sellos.'],
              ['planned', 'event_upcoming', 'Lo estoy planeando', 'Va a tus planes. No cuenta como visitado hasta que lo hagas.'],
            ] as const
          ).map(([v, icon, title, text]) => {
            const on = draft.status === v
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => update({ status: v })}
                className={`flex items-start gap-3 rounded-md border-2 p-4 text-left transition ${on ? 'border-accent bg-accent-soft/40' : 'border-surface-highest hover:border-outline'}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${on ? 'bg-accent text-white' : 'bg-surface-low text-ink-soft'}`}>
                  <Icon name={icon} />
                </span>
                <span>
                  <span className="block font-display font-semibold">{title}</span>
                  <span className="block text-sm text-ink-soft">{text}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Nombre del viaje">
        <input
          className="field font-display text-lg"
          maxLength={120}
          value={draft.title}
          placeholder={planned ? 'Verano en Japón' : 'Ruta por la Toscana'}
          onChange={(e) => update({ title: e.target.value })}
        />
      </Field>

      <Field label="Fechas" hint="Opcional">
        <DateRangeField start={draft.start_date ?? null} end={draft.end_date ?? null} onChange={(s, e) => update({ start_date: s, end_date: e })} />
        {future && (
          <Suggestion icon="event_upcoming" text="Estas fechas aún no han llegado. ¿Es un viaje que estás planeando?" action="Sí, es un plan" onClick={() => update({ status: 'planned' })} />
        )}
        {past && <Suggestion icon="task_alt" text="Las fechas ya pasaron. ¿Hiciste este viaje?" action="Sí, ya lo hice" onClick={() => update({ status: 'done' })} />}
      </Field>

      <Field label="Tipo de viaje" hint="Opcional">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TRIP_STYLES) as TripStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={draft.style === s}
              onClick={() => update({ style: draft.style === s ? null : s })}
              className={`btn ${draft.style === s ? 'btn-dark' : 'bg-surface-low hover:bg-surface-container'}`}
            >
              <Icon name={TRIP_STYLES[s].icon} size={18} /> {TRIP_STYLES[s].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="¿Con quién?" hint="Para editar juntos, invítales desde la bitácora del viaje">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={!!draft.solo}
            onClick={() => update({ solo: !draft.solo, companions: draft.solo ? draft.companions : [] })}
            className={`btn ${draft.solo ? 'btn-dark' : 'bg-surface-low hover:bg-surface-container'}`}
          >
            <Icon name="person" size={18} /> En solitario
          </button>
          {draft.companions?.map((c) => (
            <span key={c} className="flex items-center gap-2 rounded-full bg-surface-low py-1 pl-1 pr-2 text-sm">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[10px] font-bold text-paper">
                {c
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              {c}
              <button type="button" className="grid h-7 w-7 place-items-center rounded-full hover:bg-surface-container" onClick={() => update({ companions: draft.companions?.filter((x) => x !== c) })} aria-label={`Quitar a ${c}`}>
                <Icon name="close" size={16} />
              </button>
            </span>
          ))}
          {!draft.solo && (
            <span className="flex items-center gap-1 rounded-full border border-dashed border-outline px-3 py-1.5 text-sm">
              <Icon name="person_add" size={16} />
              <input
                className="w-40 bg-transparent outline-none"
                placeholder="Nombre y Enter"
                value={mate}
                onChange={(e) => setMate(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMate()}
                onBlur={addMate}
              />
            </span>
          )}
        </div>
      </Field>

      <Field label="Descripción" hint="Una frase que lo resuma">
        <textarea
          className="field min-h-24 resize-y"
          value={draft.description ?? ''}
          placeholder={planned ? 'Templos, ramen y onsen. Volar a Tokio y bajar en tren hasta Osaka.' : 'El silencio de los bosques de bambú al amanecer.'}
          onChange={(e) => update({ description: e.target.value || null })}
        />
      </Field>
    </div>
  )
}

function Suggestion({ icon, text, action, onClick }: { icon: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-sm bg-accent-soft/50 px-4 py-3 text-sm text-accent-ink">
      <Icon name={icon} size={18} />
      <span className="flex-1">{text}</span>
      <button type="button" className="btn btn-dark py-1.5!" onClick={onClick}>
        {action}
      </button>
    </div>
  )
}

// ───────────────────────────── Paso 2: la ruta ─────────────────────────────

function RutaStep({
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
  const drag = useStopDrag(stops.length, onMove)
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

function RouteMap({ trip, airports, compact }: { trip: TripWithStops | undefined | null; airports: ReturnType<typeof useAirportMap>; compact?: boolean }) {
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

// ───────────────────────────── Paso 3: recuerdos ─────────────────────────────

function RecuerdosStep({
  trip,
  planned,
  soundtrack,
  onSoundtrack,
  onChange,
  onUpload,
  onDeletePhoto,
  onGoRoute,
}: {
  trip: TripWithStops | undefined | null
  planned: boolean
  soundtrack: string | null
  onSoundtrack: (url: string | null) => void
  onChange: (id: string, patch: Partial<Stop>) => void
  onUpload: (files: FileList, stopId?: string | null) => void
  onDeletePhoto: (p: TripWithStops['photos'][number]) => void
  onGoRoute: () => void
}) {
  if (!trip?.stops.length)
    return (
      <div className="rounded-md bg-surface-low p-8 text-center">
        <Icon name="route" size={32} className="text-ink-soft" />
        <p className="mt-2 text-ink-soft">Primero añade las paradas de la ruta.</p>
        <button type="button" className="btn btn-dark mt-4" onClick={onGoRoute}>
          Ir a la ruta
        </button>
      </div>
    )
  return (
    <div className="space-y-4">
      <div>
        <h2 className="headline-md">{planned ? 'Ideas y notas' : 'Recuerdos'}</h2>
        <p className="mt-1 text-ink-soft">
          {planned ? 'Apunta qué quieres ver en cada parada. Las fotos podrás subirlas a la vuelta.' : 'Notas, fotos, música y valoración de cada parada. Todo es opcional.'}
        </p>
      </div>
      <div className="lg:hidden">
        <PhotoStrip trip={trip} onUpload={(f) => onUpload(f)} />
      </div>
      <div className="rounded-md bg-surface-low p-4">
        <div className="font-display font-semibold">Banda sonora del viaje</div>
        <p className="mb-3 text-sm text-ink-soft">La música que te recuerda a este viaje. En Spotify: ··· → Compartir → Copiar enlace.</p>
        <SpotifyField value={soundtrack} onChange={onSoundtrack} />
      </div>
      {trip.stops.map((s, i) => (
        <div key={s.id} className="rounded-md bg-surface-low p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="headline-sm flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs text-paper">{i + 1}</span> {s.name}
            </span>
            {!planned && (
              <span className="flex items-center" role="group" aria-label="Valoración">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="grid h-9 w-9 place-items-center" onClick={() => onChange(s.id, { rating: s.rating === n ? null : n })} aria-label={`${n} estrellas`}>
                    <Icon name="star" filled={(s.rating ?? 0) >= n} size={22} className={(s.rating ?? 0) >= n ? 'text-accent' : 'text-outline-soft'} />
                  </button>
                ))}
              </span>
            )}
          </div>
          <textarea
            className="field mt-3 min-h-20 bg-card!"
            defaultValue={s.notes ?? ''}
            placeholder={planned ? 'Qué quieres ver o hacer aquí…' : 'Qué pasó aquí: lugares, sensaciones, recomendaciones…'}
            onBlur={(e) => (e.target.value || null) !== s.notes && onChange(s.id, { notes: e.target.value || null })}
          />
          <div className="mt-3">
            <SpotifyField compact value={s.song_url ?? null} placeholder="Canción de este día (enlace de Spotify, opcional)" onChange={(url) => onChange(s.id, { song_url: url })} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="min-w-0 flex-1 rounded-sm bg-card px-3 py-2.5 text-sm outline-none ring-1 ring-outline-soft focus:ring-ink"
              defaultValue={s.tags.join(', ')}
              placeholder="Etiquetas separadas por comas (Museo, Playa…)"
              onBlur={(e) => {
                const tags = e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)
                if (tags.join() !== s.tags.join()) onChange(s.id, { tags })
              }}
            />
            {!planned && (
              <label className="btn btn-ghost cursor-pointer">
                <Icon name="add_photo_alternate" size={18} /> Fotos
                <input type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files, s.id)} />
              </label>
            )}
          </div>
          {trip.photos.some((p) => p.stop_id === s.id) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trip.photos
                .filter((p) => p.stop_id === s.id)
                .map((p) => (
                  <div key={p.id} className="relative h-20 w-28 overflow-hidden rounded-sm">
                    <img src={api.photoThumbUrl(p.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => onDeletePhoto(p)} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Eliminar foto">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────── Paso 4: resumen ─────────────────────────────

function ResumenStep({
  trip,
  draft,
  airports,
  stamps,
  countryName,
  onStatus,
  canDelete,
  onDelete,
}: {
  trip: TripWithStops | undefined | null
  draft: Draft
  airports: ReturnType<typeof useAirportMap>
  stamps: ReturnType<typeof computeStamps>
  countryName: (c: string) => string
  onStatus: (s: 'done' | 'planned') => void
  canDelete: boolean
  onDelete: () => void
}) {
  const planned = draft.status === 'planned'
  const stops = trip?.stops ?? []
  const countries = [...new Set(stops.map((s) => s.country_code))]
  const days = draft.start_date && draft.end_date ? daysBetween(draft.start_date, draft.end_date) : null
  return (
    <div className="space-y-6">
      <div>
        <h2 className="headline-md">Resumen</h2>
        <p className="mt-1 text-ink-soft">Revisa que todo esté bien y guarda.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Paradas', String(stops.length)],
          ['Países', String(countries.length)],
          ['Distancia', `${trip ? formatKm(tripKm(trip, airports)) : 0} km`],
          ['Días', days ? String(days) : '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-sm bg-surface-low p-3">
            <div className="label-stamp text-ink-soft">{l}</div>
            <div className="font-display text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      {planned ? (
        <div className="rounded-md border-2 border-accent/40 bg-accent-soft/30 p-5">
          <div className="flex items-start gap-3">
            <Icon name="event_upcoming" className="text-accent" />
            <div className="flex-1">
              <div className="font-display font-semibold">Es un viaje planificado</div>
              <p className="mt-1 text-sm text-ink-soft">
                Aparece en tus planes y en la Bucket List, pero no cuenta como visitado ni da sellos. Cuando vuelvas, márcalo como realizado.
              </p>
              <button type="button" className="btn btn-dark mt-3" onClick={() => onStatus('done')}>
                <Icon name="task_alt" size={18} /> Ya lo hice: marcar como realizado
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 font-display font-semibold">{stamps.length ? `${plural(stamps.length, 'sello', 'sellos')} para tu pasaporte` : 'Sellos'}</div>
          {stamps.length ? (
            <div className="grid gap-6 rounded-md bg-surface-low p-6 sm:grid-cols-2">
              {stamps.map((s) => (
                <div key={s.key} className="grid place-items-center py-4">
                  <Stamp stampKey={s.key} countryCode={s.countryCode} countryName={countryName(s.countryCode)} place={s.place} date={s.date} airport={s.airport} domestic={s.domestic} />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-surface-low p-5 text-sm text-ink-soft">Cada país distinto del de salida te da un sello, y cada aeropuerto nacional al que llegas en avión también.</p>
          )}
          <button type="button" className="mt-3 text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline" onClick={() => onStatus('planned')}>
            ¿Aún no lo has hecho? Pásalo a planificado
          </button>
        </div>
      )}

      {trip && <TripBudget trip={{ ...trip, ...draft, start_date: draft.start_date ?? null, end_date: draft.end_date ?? null, status: draft.status ?? trip.status }} />}

      {canDelete && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-highest pt-6">
          <span className="text-sm text-ink-soft">Eliminar borra el viaje, sus paradas y sus fotos.</span>
          <button type="button" className="btn text-red-700 hover:bg-red-50" onClick={onDelete}>
            <Icon name="delete" size={18} /> Eliminar viaje
          </button>
        </div>
      )}
    </div>
  )
}

function PhotoStrip({ trip, onUpload }: { trip: TripWithStops | undefined | null; onUpload: (f: FileList) => void }) {
  const [over, setOver] = useState(false)
  const photos = trip?.photos ?? []
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <span className="font-display font-semibold">Fotos del viaje</span>
        <span className="text-sm text-ink-soft">{photos.length ? plural(photos.length, 'foto', 'fotos') : 'Hasta 10 cada vez'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.slice(0, 2).map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-sm bg-surface-container">
            <img src={api.photoThumbUrl(p.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
          </div>
        ))}
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed p-2 text-center text-sm ${over ? 'border-accent bg-accent-soft/40' : 'border-outline-soft hover:border-ink'} ${photos.length >= 2 ? 'aspect-square' : photos.length === 1 ? 'col-span-2' : 'col-span-3 h-28'}`}
        >
          <Icon name="add_photo_alternate" />
          <span>{photos.length > 2 ? `+${photos.length - 2} · añadir` : 'Añadir fotos'}</span>
          <input type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files)} />
        </label>
      </div>
    </div>
  )
}

interface SightOps {
  update: (id: string, patch: Parameters<typeof api.updateSight>[1]) => void
  add: (stopId: string, s: NewSight) => void
  toggle: (s: Sight) => void
  remove: (s: Sight) => void
}

/** Campos del viaje listos para guardar: siempre cumplen las restricciones de la base de datos. */
function tripFields<T extends { title: string; start_date?: string | null; end_date?: string | null }>(d: T): T {
  const end = d.start_date && d.end_date && d.end_date < d.start_date ? d.start_date : d.end_date
  return { ...d, title: d.title.trim().slice(0, 120) || 'Nueva expedición', end_date: end }
}

/**
 * Arrastrar paradas para reordenar, con ratón o con el dedo (pointer events), desde un asa. La parada
 * sigue al puntero y las demás se apartan para dejarle hueco; al soltar se guarda el nuevo orden.
 */
function useStopDrag(count: number, onMove: (from: number, to: number) => void) {
  const list = useRef<HTMLOListElement>(null)
  const [state, setState] = useState<{ from: number; to: number; dy: number; h: number } | null>(null)
  const info = useRef<{ startY: number; scroll0: number; mids: number[] } | null>(null)

  const handle = (i: number) =>
    count > 1 ? (
      <button
        type="button"
        aria-label="Arrastrar para cambiar el orden"
        title="Arrastra para cambiar el orden"
        className="-ml-1 grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center self-center rounded-xs text-ink-soft hover:bg-surface-container hover:text-ink active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          const items = [...(list.current?.querySelectorAll<HTMLElement>(':scope > li[data-stop-index]') ?? [])]
          // El centro de cada tarjeta (sin el tramo de transporte de encima) decide dónde cae.
          const cards = items.map((el) => el.querySelector<HTMLElement>('[data-stop-card]') ?? el)
          info.current = {
            startY: e.clientY,
            scroll0: scrollY,
            mids: cards.map((el) => {
              const r = el.getBoundingClientRect()
              return r.top + scrollY + r.height / 2
            }),
          }
          setState({ from: i, to: i, dy: 0, h: items[i]?.getBoundingClientRect().height ?? 0 })
        }}
        onPointerMove={(e) => {
          const d = info.current
          if (!d || !state) return
          // Desplaza la página si se arrastra cerca del borde (útil en el móvil).
          if (e.clientY < 90) scrollBy(0, -12)
          else if (e.clientY > innerHeight - 90) scrollBy(0, 12)
          const dy = e.clientY - d.startY + (scrollY - d.scroll0)
          const y = d.mids[state.from] + dy
          let to = 0
          d.mids.forEach((m, j) => j !== state.from && m < y && to++)
          setState({ ...state, to, dy })
        }}
        onPointerUp={() => {
          if (state && state.to !== state.from) onMove(state.from, state.to)
          info.current = null
          setState(null)
        }}
        onPointerCancel={() => {
          info.current = null
          setState(null)
        }}
        onKeyDown={(e) => {
          // Con teclado: flechas arriba y abajo.
          const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
          if (to >= 0 && to < count) {
            e.preventDefault()
            onMove(i, to)
          }
        }}
      >
        <Icon name="drag_indicator" size={20} />
      </button>
    ) : null

  const style = (i: number): React.CSSProperties | undefined => {
    if (!state) return undefined
    const { from, to, dy, h } = state
    if (i === from) return { transform: `translateY(${dy}px)` }
    if (from < to && i > from && i <= to) return { transform: `translateY(${-h}px)` }
    if (from > to && i < from && i >= to) return { transform: `translateY(${h}px)` }
    return undefined
  }

  return { list, state, handle, style }
}

