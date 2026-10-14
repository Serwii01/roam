import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AirportInput } from '../components/AirportInput'
import { Icon } from '../components/Icon'
import { PlaceSearch } from '../components/PlaceSearch'
import { SpotifyField } from '../components/Spotify'
import { Stamp } from '../components/Stamp'
import { ErrorNote, Eyebrow, Flag, Spinner, coords } from '../components/ui'
import { WorldMap } from '../components/WorldMap'
import { api, type TripFields } from '../lib/api'
import { computeStamps } from '../lib/badges'
import type { Stop, TransportMode, TripStyle, TripWithStops } from '../lib/db'
import { haversine } from '../lib/geo'
import { lookupPlaceCodes, type Place } from '../lib/geocode'
import { nearestAirportLocal, preloadAirports } from '../lib/airportIndex'
import { useAirportMap, useCountries, useInvalidateTravel, useTrip } from '../lib/hooks'
import { formatKm, legKm, tripKm } from '../lib/stats'
import { TRANSPORT, TRANSPORT_MODES, TRIP_STYLES } from '../lib/transport'

const STEPS = [
  { id: 'destino', label: 'Destino' },
  { id: 'ruta', label: 'Ruta' },
  { id: 'recuerdos', label: 'Recuerdos' },
  { id: 'sello', label: 'Sello' },
] as const
type StepId = (typeof STEPS)[number]['id']

const EMPTY_DRAFT: TripFields & { title: string } = {
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

export function TripEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const step = (STEPS.find((s) => s.id === params.get('paso'))?.id ?? 'destino') as StepId
  const trip = useTrip(id)
  const invalidate = useInvalidateTravel()
  const countries = useCountries()
  const airports = useAirportMap(trip.data?.stops.flatMap((s) => [s.from_airport, s.to_airport]) ?? [])

  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [, tick] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Carga los campos del viaje existente una sola vez.
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

  const goStep = (s: StepId) => setParams({ paso: s }, { replace: true })

  /** Crea el viaje la primera vez que hace falta un id (añadir parada, foto o guardar). */
  async function ensureTrip(): Promise<TripWithStops> {
    if (trip.data) return trip.data
    const created = await api.createTrip({ ...draft, title: draft.title.trim() || 'Nueva expedición' })
    await invalidate()
    navigate(`/app/viajes/${created.id}/editar?paso=${step}`, { replace: true })
    return { ...created, stops: [], photos: [] }
  }

  function update(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (!id) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateTrip(id, { ...next, title: next.title.trim() || 'Nueva expedición' })
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
    run('Fijando coordenadas', async () => {
      const t = await ensureTrip()
      const codes = await lookupPlaceCodes(p.lat, p.lon).catch(() => ({}) as Awaited<ReturnType<typeof lookupPlaceCodes>>)
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
        arrived_on: prev?.arrived_on ?? draft.start_date ?? null,
        transport_in: transport,
        from_airport,
        to_airport,
      })
    })

  const uploadFiles = (files: FileList | File[], stopId?: string | null) =>
    run('Subiendo fotogramas', async () => {
      const t = await ensureTrip()
      for (const f of [...files].filter((f) => f.type.startsWith('image/')).slice(0, 10)) await api.uploadPhoto(t.id, f, stopId)
    })

  if (id && trip.isLoading) return <Spinner label="Abriendo manifiesto" />

  const t = trip.data
  const stops = t?.stops ?? []
  const last = stops.at(-1)
  const stamps = t ? computeStamps([{ ...t, status: 'done' }]) : []
  const routeCode = stops
    .slice(0, 4)
    .map((s) => s.name.slice(0, 3).toUpperCase())
    .join(' → ')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-highest pb-4">
        <span className="label-code flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" /> ROAM // Manifest protocol [sys-log v1.0]
        </span>
        <span className="flex items-center gap-3">
          {last && <span className="label-code hidden text-ink-soft sm:inline">Coords: {coords(last.lat, last.lon)}</span>}
          <span className="label-code bg-surface-container px-2 py-1">Status: {busy ? 'procesando' : 'logging_active'}</span>
        </span>
      </div>

      <div className="card mt-6 p-5 md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-surface-highest pb-8">
          <div className="max-w-2xl">
            <Eyebrow dot={false}>
              <Icon name="verified" size={16} /> Registro de inmigración digital
            </Eyebrow>
            <h1 className="headline-lg mt-3 md:text-[48px]! md:leading-[52px]!">{id ? 'Editar expedición' : 'Registrar nueva expedición'}</h1>
            <p className="mt-3 text-ink-soft">Inmortaliza tu última ruta, añade coordenadas fotográficas y acuña un nuevo sello en tu pasaporte de navegación global.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goStep(s.id)}
                className={`label-code px-3 py-2 ${step === s.id ? 'bg-ink text-white' : 'bg-surface-low text-ink-soft hover:text-ink'}`}
              >
                {String(i + 1).padStart(2, '0')} {s.label}
              </button>
            ))}
          </div>
        </div>

        <ErrorNote error={error} />

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_480px]">
          <div className="min-w-0">
            {step === 'destino' && <DestinoStep draft={draft} update={update} />}
            {step === 'ruta' && (
              <RutaStep
                trip={t}
                airports={airports}
                onAdd={addPlace}
                busy={busy}
                onChange={(stopId, patch) => run('Guardando', () => api.updateStop(stopId, patch))}
                onRemove={(stopId) => run('Eliminando', () => api.deleteStop(stopId))}
                onMove={(i, dir) =>
                  run('Reordenando', () => {
                    const next = [...stops]
                    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
                    return api.reorderStops(next)
                  })
                }
              />
            )}
            {step === 'recuerdos' && (
              <RecuerdosStep
                trip={t}
                soundtrack={draft.soundtrack_url ?? null}
                onSoundtrack={(url) => update({ soundtrack_url: url })}
                onChange={(stopId, patch) => run('Guardando', () => api.updateStop(stopId, patch))}
                onUpload={uploadFiles}
                onDeletePhoto={(p) => run('Eliminando', () => api.deletePhoto(p))}
                onGoRoute={() => goStep('ruta')}
              />
            )}
            {step === 'sello' && (
              <SelloStep
                stamps={stamps}
                status={draft.status ?? 'done'}
                onStatus={(s) => update({ status: s })}
                countryName={countries.name}
              />
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-md bg-surface-low p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="label-code flex items-center gap-2">
                  <Icon name="polyline" size={18} className="text-accent" /> Cartografía de vector
                </span>
                <span className="label-code text-accent-deep">{stops.length} hitos fijados</span>
              </div>
              <div className="relative">
                <WorldMap className="h-72 shadow-none!" trips={t ? [t] : []} airports={airports} numbered base="modern" controls={false} telemetry={false} legend={false} routeLink={false} />
                {stops.length > 0 && (
                  <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                    <span className="label-code truncate bg-ink px-2 py-1 text-white">● {routeCode}</span>
                    <span className="label-code shrink-0 bg-ink px-2 py-1 text-white">{t ? formatKm(tripKm(t, airports)) : 0} km total</span>
                  </div>
                )}
              </div>
              <ul className="mt-3 space-y-1">
                {stops.map((s, i) => {
                  const next = stops[i + 1]
                  const days = s.arrived_on && next?.arrived_on ? Math.round((Date.parse(next.arrived_on) - Date.parse(s.arrived_on)) / 86_400_000) : null
                  return (
                    <li key={s.id} className="flex items-center justify-between rounded-sm bg-card px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === 0 ? 'bg-accent' : 'bg-ink'}`} />
                        <span className="truncate">
                          {i + 1}. {s.name}
                        </span>
                      </span>
                      {days !== null && <span className="label-stamp text-ink-soft">{days} días</span>}
                    </li>
                  )
                })}
              </ul>
              <button onClick={() => goStep('ruta')} className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm bg-surface-container py-2.5 text-sm hover:bg-surface-high">
                <Icon name="add_location_alt" size={18} /> Añadir parada o ciudad clave
              </button>
            </div>

            <PhotoStrip trip={t} onUpload={(f) => uploadFiles(f)} />

            <div className="rounded-md bg-surface-container p-5">
              <div className="mb-4 flex justify-between">
                <span className="label-code">Vista previa del sello</span>
                <span className="label-code text-accent-deep">Tinta fresca // {stamps.length ? 'ready' : 'esperando ruta'}</span>
              </div>
              <div className="grid min-h-40 place-items-center rounded-md border-2 border-dashed border-accent p-6">
                {stamps[0] ? (
                  <Stamp
                    stampKey={stamps[0].key}
                    countryCode={stamps[0].countryCode}
                    countryName={countries.name(stamps[0].countryCode)}
                    place={stamps[0].place}
                    date={stamps[0].date}
                    airport={stamps[0].airport}
                  />
                ) : (
                  <span className="text-center text-sm text-ink-soft">El sello aparece al añadir un destino en otro país.</span>
                )}
              </div>
              <p className="mt-3 text-center text-sm text-ink-soft">Este sello quedará fijado en tu pasaporte al confirmar la expedición.</p>
            </div>
          </aside>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-surface-highest pt-6">
          <span className="flex items-center gap-2 text-sm text-ink-soft">
            <Icon name="cloud_done" size={18} />
            {busy ? `${busy}…` : savedAt ? `Borrador autoguardado hace ${Math.max(1, Math.round((Date.now() - savedAt) / 1000))} s` : id ? 'Cambios guardados' : 'Sin guardar todavía'}
          </span>
          <div className="flex flex-wrap gap-3">
            {id && (
              <button
                className="btn text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (confirm(`¿Eliminar «${draft.title}» y sus fotos? No se puede deshacer.`))
                    run('Eliminando', () => api.deleteTrip(id)).then(() => navigate('/app/bitacora'))
                }}
              >
                Eliminar
              </button>
            )}
            <button className="btn btn-ghost px-6!" disabled={!!busy} onClick={() => run('Guardando', ensureTrip)}>
              Guardar borrador
            </button>
            <button
              className="btn btn-accent px-6!"
              disabled={!!busy}
              onClick={() =>
                run('Acuñando sello', async () => {
                  const tt = await ensureTrip()
                  await api.updateTrip(tt.id, { ...draft, title: draft.title.trim() || 'Nueva expedición' })
                  navigate(`/app/viajes/${tt.id}`)
                })
              }
            >
              <Icon name="task_alt" size={18} /> Confirmar y acuñar sello
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ n, label, right, children }: { n: number; label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-code">
          {String(n).padStart(2, '0')}. {label}
        </span>
        {right && <span className="label-code text-ink-soft">{right}</span>}
      </div>
      {children}
    </div>
  )
}

function DestinoStep({ draft, update }: { draft: typeof EMPTY_DRAFT; update: (p: Partial<typeof EMPTY_DRAFT>) => void }) {
  const [mate, setMate] = useState('')
  const addMate = () => {
    const name = mate.trim()
    if (name && !draft.companions?.includes(name)) update({ companions: [...(draft.companions ?? []), name], solo: false })
    setMate('')
  }
  return (
    <div className="space-y-8">
      <Field n={1} label="Identificador del viaje" right="Obligatorio">
        <input className="field font-display text-lg" value={draft.title} placeholder="Travesía del Archipiélago: Honshu & Kansai" onChange={(e) => update({ title: e.target.value })} />
      </Field>

      <Field n={2} label="Modalidad operativa">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TRIP_STYLES) as TripStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => update({ style: draft.style === s ? null : s })}
              className={`btn ${draft.style === s ? 'btn-dark' : 'bg-surface-low hover:bg-surface-container'}`}
            >
              <Icon name={TRIP_STYLES[s].icon} size={18} /> {TRIP_STYLES[s].label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field n={3} label="Estado">
          <div className="flex gap-2">
            {(
              [
                ['done', 'Completado'],
                ['planned', 'Planificado'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} onClick={() => update({ status: v })} className={`btn flex-1 ${draft.status === v ? 'btn-dark' : 'bg-surface-low'}`}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field n={4} label="Ventana temporal">
          <div className="flex items-center gap-2">
            <input type="date" className="field min-w-0 py-2.5!" value={draft.start_date ?? ''} onChange={(e) => update({ start_date: e.target.value || null })} />
            <span>–</span>
            <input type="date" className="field min-w-0 py-2.5!" value={draft.end_date ?? ''} min={draft.start_date ?? undefined} onChange={(e) => update({ end_date: e.target.value || null })} />
          </div>
        </Field>
      </div>

      <Field
        n={5}
        label="Manifiesto de tripulación"
        right={
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!draft.solo} onChange={(e) => update({ solo: e.target.checked, companions: e.target.checked ? [] : draft.companions })} />
            Expedición en solitario
          </label>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {draft.companions?.map((c) => (
            <span key={c} className="flex items-center gap-2 rounded-full bg-surface-low py-1 pl-1 pr-3 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
                {c
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              {c}
              <button onClick={() => update({ companions: draft.companions?.filter((x) => x !== c) })} aria-label={`Quitar ${c}`}>
                <Icon name="close" size={16} />
              </button>
            </span>
          ))}
          {!draft.solo && (
            <span className="flex items-center gap-1 rounded-full border border-dashed border-outline px-3 py-1 text-sm">
              <Icon name="person_add" size={16} />
              <input
                className="w-36 bg-transparent outline-none"
                placeholder="Añadir compañero"
                value={mate}
                onChange={(e) => setMate(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMate()}
                onBlur={addMate}
              />
            </span>
          )}
        </div>
      </Field>

      <Field n={6} label="Epígrafe de ruta (memoria vital)" right="1 frase">
        <textarea
          className="field min-h-24 resize-y"
          value={draft.description ?? ''}
          placeholder="El silencio de los bosques de bambú al amanecer antes de que el Shinkansen cruzara hacia Osaka."
          onChange={(e) => update({ description: e.target.value || null })}
        />
      </Field>
    </div>
  )
}

function RutaStep({
  trip,
  airports,
  onAdd,
  busy,
  onChange,
  onRemove,
  onMove,
}: {
  trip: TripWithStops | undefined | null
  airports: ReturnType<typeof useAirportMap>
  onAdd: (p: Place) => void
  busy: string | null
  onChange: (id: string, patch: Partial<Stop>) => void
  onRemove: (id: string) => void
  onMove: (i: number, dir: -1 | 1) => void
}) {
  const stops = trip?.stops ?? []
  return (
    <div>
      <div className="label-code mb-3">07. Ruta y paradas</div>
      <p className="mb-4 text-sm text-ink-soft">
        Añade las paradas en orden, empezando por el punto de partida. Cada lugar guarda automáticamente su región y su provincia; los vuelos proponen el aeropuerto más cercano.
      </p>
      <ol>
        {stops.map((s, i) => (
          <li key={s.id}>
            {i > 0 && (
              <div className="ml-4 border-l-2 border-dashed border-outline-soft py-3 pl-6">
                <div className="flex flex-wrap items-center gap-1">
                  {TRANSPORT_MODES.map((m) => (
                    <button
                      key={m}
                      title={TRANSPORT[m].label}
                      onClick={() => onChange(s.id, { transport_in: m })}
                      className={`grid h-8 w-8 place-items-center rounded-sm transition ${s.transport_in === m ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface-low'}`}
                    >
                      <Icon name={TRANSPORT[m].icon} size={18} />
                    </button>
                  ))}
                  <span className="label-code ml-2 text-ink-soft">
                    {TRANSPORT[s.transport_in ?? 'car'].label} · {formatKm(legKm(stops, i, airports))} km
                  </span>
                </div>
                {s.transport_in === 'plane' && (
                  <div className="mt-2 flex max-w-md items-center gap-2">
                    <AirportInput value={s.from_airport} airport={airports.get(s.from_airport ?? '')} placeholder="Origen (IATA)" onChange={(v) => onChange(s.id, { from_airport: v })} />
                    <Icon name="flight" size={16} className="rotate-90 text-accent" />
                    <AirportInput value={s.to_airport} airport={airports.get(s.to_airport ?? '')} placeholder="Destino (IATA)" onChange={(v) => onChange(s.id, { to_airport: v })} />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 rounded-sm bg-surface-low p-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-xs font-bold text-white ${i === 0 ? 'bg-accent' : 'bg-ink'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <input className="w-full bg-transparent font-display font-semibold outline-none" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && onChange(s.id, { name: e.target.value })} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <Flag code={s.country_code} /> {[s.province_code, s.region_code].filter(Boolean).join(' · ') || s.country_code}
                  <input
                    type="date"
                    className="bg-transparent outline-none"
                    defaultValue={s.arrived_on ?? ''}
                    onBlur={(e) => (e.target.value || null) !== s.arrived_on && onChange(s.id, { arrived_on: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="flex items-center text-ink-soft">
                <button disabled={i === 0} className="p-1 disabled:opacity-20" onClick={() => onMove(i, -1)} title="Subir">
                  <Icon name="arrow_upward" size={18} />
                </button>
                <button disabled={i === stops.length - 1} className="p-1 disabled:opacity-20" onClick={() => onMove(i, 1)} title="Bajar">
                  <Icon name="arrow_downward" size={18} />
                </button>
                <button className="p-1 hover:text-red-700" onClick={() => onRemove(s.id)} title="Quitar parada">
                  <Icon name="delete" size={18} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <PlaceSearch onPick={onAdd} placeholder={stops.length ? 'Añadir siguiente destino…' : 'Punto de partida: ciudad, lugar…'} autoFocus />
        {busy && <div className="label-code mt-2 text-accent-deep">{busy}…</div>}
      </div>
    </div>
  )
}

function RecuerdosStep({
  trip,
  soundtrack,
  onSoundtrack,
  onChange,
  onUpload,
  onDeletePhoto,
  onGoRoute,
}: {
  trip: TripWithStops | undefined | null
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
        <p className="text-ink-soft">Primero añade las paradas de la ruta.</p>
        <button className="btn btn-dark mt-4" onClick={onGoRoute}>
          Ir a la ruta
        </button>
      </div>
    )
  return (
    <div className="space-y-4">
      <div className="rounded-sm bg-surface-low p-4">
        <div className="label-code mb-1">08. Banda sonora del viaje</div>
        <p className="mb-3 text-sm text-ink-soft">La música que te recuerda a este viaje. En Spotify: ··· → Compartir → Copiar enlace.</p>
        <SpotifyField value={soundtrack} onChange={onSoundtrack} />
      </div>
      <div className="label-code pt-2">09. Bitácora por parada</div>
      {trip.stops.map((s, i) => (
        <div key={s.id} className="rounded-sm bg-surface-low p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="headline-sm">
              {i + 1}. {s.name}
            </span>
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => onChange(s.id, { rating: s.rating === n ? null : n })} aria-label={`${n} estrellas`}>
                  <Icon name="star" filled={(s.rating ?? 0) >= n} size={20} className={(s.rating ?? 0) >= n ? 'text-accent' : 'text-outline-soft'} />
                </button>
              ))}
            </span>
          </div>
          <textarea
            className="field mt-3 min-h-20 bg-card!"
            defaultValue={s.notes ?? ''}
            placeholder="Qué pasó aquí: lugares, sensaciones, recomendaciones…"
            onBlur={(e) => (e.target.value || null) !== s.notes && onChange(s.id, { notes: e.target.value || null })}
          />
          <div className="mt-3">
            <SpotifyField compact value={s.song_url ?? null} placeholder="Canción de este día (enlace de Spotify, opcional)" onChange={(url) => onChange(s.id, { song_url: url })} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="min-w-0 flex-1 rounded-sm bg-card px-3 py-2 text-sm outline-none ring-1 ring-outline-soft"
              defaultValue={s.tags.join(', ')}
              placeholder="Etiquetas separadas por comas (Café Reykjavík, Camping…)"
              onBlur={(e) => {
                const tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                if (tags.join() !== s.tags.join()) onChange(s.id, { tags })
              }}
            />
            <label className="btn btn-ghost cursor-pointer">
              <Icon name="add_photo_alternate" size={18} /> Fotos de esta parada
              <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files, s.id)} />
            </label>
          </div>
          {trip.photos.some((p) => p.stop_id === s.id) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trip.photos
                .filter((p) => p.stop_id === s.id)
                .map((p) => (
                  <div key={p.id} className="group relative h-20 w-28 overflow-hidden rounded-sm">
                    <img src={api.photoUrl(p.path)} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => onDeletePhoto(p)} className="absolute right-1 top-1 hidden rounded-xs bg-ink/80 p-0.5 text-white group-hover:block" aria-label="Eliminar foto">
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

function SelloStep({
  stamps,
  status,
  onStatus,
  countryName,
}: {
  stamps: ReturnType<typeof computeStamps>
  status: 'done' | 'planned'
  onStatus: (s: 'done' | 'planned') => void
  countryName: (c: string) => string
}) {
  return (
    <div>
      <div className="label-code mb-3">10. Sellos a acuñar</div>
      {stamps.length ? (
        <div className="grid gap-6 rounded-md bg-surface-low p-6 sm:grid-cols-2">
          {stamps.map((s) => (
            <div key={s.key} className="grid place-items-center py-4">
              <Stamp stampKey={s.key} countryCode={s.countryCode} countryName={countryName(s.countryCode)} place={s.place} date={s.date} airport={s.airport} />
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md bg-surface-low p-6 text-ink-soft">Los sellos se generan para cada país distinto del de partida.</p>
      )}
      <label className="mt-6 flex items-center gap-3 rounded-sm bg-surface-low p-4">
        <input type="checkbox" checked={status === 'done'} onChange={(e) => onStatus(e.target.checked ? 'done' : 'planned')} />
        <span>
          <span className="font-display font-semibold">Expedición completada</span>
          <span className="block text-sm text-ink-soft">Desmárcalo si es un viaje planificado: irá a tu Bucket List y no contará como visitado.</span>
        </span>
      </label>
    </div>
  )
}

function PhotoStrip({ trip, onUpload }: { trip: TripWithStops | undefined | null; onUpload: (f: FileList) => void }) {
  const [over, setOver] = useState(false)
  const photos = trip?.photos ?? []
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <span className="label-code">Fotogramas clave (drag & drop)</span>
        <span className="label-code text-accent-deep">Máx. 10 por subida</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.slice(0, 2).map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-sm bg-surface-container">
            <img src={api.photoUrl(p.path)} alt="" className="h-full w-full object-cover" />
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed text-center ${over ? 'border-accent bg-accent-soft/40' : 'border-outline-soft'} ${photos.length >= 2 ? 'aspect-square' : photos.length === 1 ? 'col-span-2' : 'col-span-3 h-28'}`}
        >
          <Icon name="upload_file" />
          <span className="label-stamp">Soltar archivo{photos.length > 2 ? ` · +${photos.length - 2}` : ''}</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files)} />
        </label>
      </div>
    </div>
  )
}
