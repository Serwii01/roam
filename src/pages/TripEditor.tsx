import { useEffect, useRef, useState } from 'react'
import { ask, deleteTripQuestion } from '../components/ConfirmDialog'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { daysBetween } from '../components/DatePicker'
import { Icon } from '../components/Icon'
import { Stamp } from '../components/Stamp'
import { DayPlan } from '../components/DayPlan'
import { ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { notifyDone } from '../lib/push'
import { computeStamps } from '../lib/badges'
import type { Sight, TransportMode, TripWithStops } from '../lib/db'
import { haversine } from '../lib/geo'
import type { FlightAirport, FlightRoute } from '../lib/flights'
import { lookupPlaceCodes, type Place } from '../lib/geocode'
import { datesAfterEdit, datesAfterMove } from '../lib/days'
import { appendStops, type DraftStop } from '../lib/import/common'
import { knownPlaceNear } from '../lib/placesIndex'
import { nearestAirportLocal, preloadAirports } from '../lib/airportIndex'
import { looksLikeImage } from '../lib/images'
import { useAirportMap, useCountries, useInvalidateTravel, useProfile, useTrip } from '../lib/hooks'
import type { Draft, SightOps } from '../components/editor/common'
import { DestinoStep } from '../components/editor/DestinoStep'
import { RutaStep, RouteMap } from '../components/editor/RutaStep'
import { RecuerdosStep } from '../components/editor/RecuerdosStep'
import { ResumenStep, PhotoStrip } from '../components/editor/ResumenStep'

const STEPS = [
  { id: 'destino', label: 'Viaje' },
  { id: 'ruta', label: 'Ruta' },
  { id: 'dias', label: 'Día a día' },
  { id: 'recuerdos', label: 'Recuerdos' },
  { id: 'sello', label: 'Resumen' },
] as const
type StepId = (typeof STEPS)[number]['id']

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
  // Estado con el que se abrió: si pasa de planificado a realizado, se avisa a los compañeros al guardar.
  const loadedStatus = useRef<Draft['status']>(undefined)
  useEffect(() => {
    if (trip.data && loadedId.current !== trip.data.id) {
      loadedId.current = trip.data.id
      loadedStatus.current = trip.data.status
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
      if (loadedStatus.current === 'planned' && draft.status === 'done' && (tt.member_count ?? 0) > 0) void notifyDone(tt.id)
      loadedStatus.current = draft.status
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
            {step === 'destino' && <DestinoStep draft={draft} update={update} canStatus={isOwner} />}
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
                onStatus={isOwner ? (s) => update({ status: s }) : undefined}
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

function tripFields<T extends { title: string; start_date?: string | null; end_date?: string | null }>(d: T): T {
  const end = d.start_date && d.end_date && d.end_date < d.start_date ? d.start_date : d.end_date
  return { ...d, title: d.title.trim().slice(0, 120) || 'Nueva expedición', end_date: end }
}
