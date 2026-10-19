import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DateField, DateRangeField, formatDay } from '../components/DatePicker'
import { Icon } from '../components/Icon'
import { ErrorNote, Flag, plural } from '../components/ui'
import { WorldMap } from '../components/LazyWorldMap'
import { api } from '../lib/api'
import { haversine } from '../lib/geo'
import type { Stop, TripWithStops } from '../lib/db'
import { useInvalidateTravel, useTrips } from '../lib/hooks'
import { IMAGE_ACCEPT, looksLikeImage } from '../lib/images'
import { createTripWithStops, nameForPoint, type DraftStop } from '../lib/import/common'
import { readPhotos, routeFromPhotos } from '../lib/import/photos'
import { detectTrips, readLocationFiles, type DetectedTrip } from '../lib/import/takeout'

const MAX_UPLOAD = 60
const isCoords = (name: string) => /^-?\d+\.\d+, -?\d+\.\d+$/.test(name)

/** Viaje de mentira para dibujar las paradas propuestas en el mapa antes de guardarlas. */
function previewTrip(stops: DraftStop[]): TripWithStops {
  const now = new Date().toISOString()
  return {
    id: 'preview',
    user_id: '',
    title: '',
    description: null,
    start_date: null,
    end_date: null,
    cover_url: null,
    status: 'done',
    style: null,
    solo: false,
    companions: [],
    soundtrack_url: null,
    created_at: now,
    updated_at: now,
    photos: [],
    sights: [],
    stops: stops.map(
      (s, i): Stop => ({
        id: `p${i}`,
        trip_id: 'preview',
        user_id: null,
        position: i,
        name: s.name,
        country_code: s.countryCode ?? 'XX',
        region_code: null,
        province_code: null,
        lat: s.lat,
        lon: s.lon,
        arrived_on: s.arrived_on,
        notes: null,
        rating: null,
        tags: [],
        song_url: null,
        transport_in: i ? (s.transport ?? 'car') : null,
        from_airport: null,
        to_airport: null,
      }),
    ),
  }
}

export function ImportPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('de') === 'google' ? 'google' : 'fotos'
  return (
    <div>
      <div className="label-code flex items-center gap-2 text-accent-deep">
        <span className="h-2 w-2 rounded-full bg-accent" /> Importar viajes
      </div>
      <h1 className="display-hero mt-3">Tus viajes, sin teclear</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">Crea la ruta a partir de las fotos del viaje o trae de golpe los viajes de tu historial de Google Maps. Todo se lee en tu navegador.</p>
      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {(
          [
            ['fotos', 'photo_library', 'Desde tus fotos'],
            ['google', 'travel_explore', 'Desde Google Maps'],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams({ de: id }, { replace: true })} className={`btn ${tab === id ? 'btn-dark' : 'btn-ghost'}`}>
            <Icon name={icon} size={18} /> {label}
          </button>
        ))}
      </div>
      <div className="mt-6">{tab === 'fotos' ? <PhotoImport /> : <GoogleImport />}</div>
    </div>
  )
}

// ───────────────────────────── Desde fotos ─────────────────────────────

function PhotoImport() {
  const navigate = useNavigate()
  const invalidate = useInvalidateTravel()
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review' | 'creating'>('pick')
  const [progress, setProgress] = useState<[number, number]>([0, 0])
  const [stops, setStops] = useState<(DraftStop & { photos: File[] })[]>([])
  const [info, setInfo] = useState({ total: 0, unplaced: 0 })
  const [title, setTitle] = useState('')
  const [range, setRange] = useState<[string | null, string | null]>([null, null])
  const [status, setStatus] = useState<'done' | 'planned'>('done')
  const [upload, setUpload] = useState(true)
  const [step, setStep] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [over, setOver] = useState(false)

  async function pick(list: FileList | File[]) {
    const files = [...list].filter(looksLikeImage)
    if (!files.length) return
    setError(null)
    setPhase('reading')
    setProgress([0, files.length])
    try {
      const points = await readPhotos(files, (d, t) => setProgress([d, t]))
      const r = await routeFromPhotos(points)
      setStops(r.stops)
      setInfo({ total: files.length, unplaced: r.unplaced })
      setRange([r.start, r.end])
      const main = [...r.stops].sort((a, b) => b.photos.length - a.photos.length)[0]
      setTitle(main ? `Viaje a ${main.name}` : 'Nuevo viaje')
      setPhase('review')
      // Los puntos sin población conocida cerca se nombran con OpenStreetMap (1 consulta por segundo).
      for (const [i, s] of r.stops.entries()) {
        if (!isCoords(s.name)) continue
        const n = await nameForPoint(s.lat, s.lon)
        setStops((cur) => cur.map((x, j) => (j === i && isCoords(x.name) ? { ...x, name: n.name, countryCode: n.countryCode ?? x.countryCode } : x)))
      }
    } catch (e) {
      setError(e)
      setPhase('pick')
    }
  }

  const photoCount = stops.reduce((a, s) => a + s.photos.length, 0)
  async function create() {
    setPhase('creating')
    setError(null)
    try {
      setStep('Creando la ruta…')
      const trip = await createTripWithStops(
        { title: title.trim() || 'Nuevo viaje', status, start_date: range[0], end_date: range[1] ?? range[0] },
        stops,
        (d, t) => setStep(`Guardando parada ${d} de ${t}…`),
      )
      if (upload) {
        const todo = stops.flatMap((s, i) => s.photos.map((f) => ({ f, stopId: trip.stops[i]?.id ?? null }))).slice(0, MAX_UPLOAD)
        for (const [i, { f, stopId }] of todo.entries()) {
          setStep(`Subiendo foto ${i + 1} de ${todo.length}…`)
          await api.uploadPhoto(trip.id, f, stopId).catch(() => {})
        }
      }
      await invalidate()
      navigate(`/app/viajes/${trip.id}/editar?paso=ruta`)
    } catch (e) {
      setError(e)
      setPhase('review')
    }
  }

  if (phase === 'pick' || phase === 'reading')
    return (
      <div className="card p-6 md:p-10">
        <ErrorNote error={error} />
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            pick(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-14 text-center transition ${over ? 'border-accent bg-accent-soft/40' : 'border-outline-soft hover:border-ink'}`}
        >
          {phase === 'reading' ? (
            <>
              <Icon name="sync" size={36} className="animate-spin text-accent" />
              <span className="font-display text-lg font-semibold">
                Leyendo foto {progress[0]} de {progress[1]}…
              </span>
              <span className="h-2 w-64 max-w-full overflow-hidden rounded-full bg-surface-container">
                <span className="block h-full bg-accent transition-all" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
              </span>
            </>
          ) : (
            <>
              <Icon name="add_photo_alternate" size={40} className="text-accent" />
              <span className="font-display text-xl font-semibold">Elige las fotos del viaje</span>
              <span className="max-w-md text-ink-soft">Con dónde y cuándo se hizo cada una, la app propone las paradas y sus fechas. Puedes elegir muchas a la vez (también HEIC del iPhone).</span>
              <span className="btn btn-accent mt-2">Elegir fotos</span>
              <input type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => e.target.files && pick(e.target.files)} />
            </>
          )}
        </label>
        <ul className="mt-6 space-y-2 text-sm text-ink-soft">
          <li className="flex gap-2">
            <Icon name="lock" size={18} className="text-accent" /> Las fotos se leen en tu navegador. Si decides subirlas al viaje, se les quitan la ubicación y los datos de la cámara.
          </li>
          <li className="flex gap-2">
            <Icon name="info" size={18} className="text-accent" /> En el iPhone, al elegir las fotos pulsa «Opciones» y activa «Ubicación»; si no, llegan sin el lugar.
          </li>
        </ul>
      </div>
    )

  const located = info.total - info.unplaced
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="card p-5 md:p-8">
        <ErrorNote error={error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="headline-md">{plural(stops.length, 'parada propuesta', 'paradas propuestas')}</h2>
          <span className="text-sm text-ink-soft">
            {plural(located, 'foto con ubicación', 'fotos con ubicación')}
            {info.unplaced > 0 && ` · ${info.unplaced} sin ubicación (repartidas por fecha)`}
          </span>
        </div>
        {!stops.length ? (
          <div className="mt-4 rounded-sm bg-surface-low p-5">
            <p>Ninguna foto tiene ubicación, así que no se puede saber por dónde pasaste.</p>
            <p className="mt-1 text-sm text-ink-soft">En el iPhone, al elegirlas pulsa «Opciones» → «Ubicación». También puedes crear el viaje a mano.</p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-ghost" onClick={() => setPhase('pick')}>
                Elegir otras
              </button>
              <Link to="/app/viajes/nuevo" className="btn btn-dark">
                Crear a mano
              </Link>
            </div>
          </div>
        ) : (
          <ol className="mt-4 space-y-2">
            {stops.map((s, i) => (
              <li key={i} className="flex items-start gap-3 rounded-md bg-surface-low p-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display font-bold text-white ${i === 0 ? 'bg-accent' : 'bg-ink'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Nombre de la parada ${i + 1}`}
                    className="w-full rounded-xs bg-transparent font-display text-lg font-semibold outline-none focus:bg-card focus:px-1"
                    value={s.name}
                    onChange={(e) => setStops((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    {s.countryCode && <Flag code={s.countryCode} />}
                    <DateField value={s.arrived_on} onChange={(d) => setStops((cur) => cur.map((x, j) => (j === i ? { ...x, arrived_on: d } : x)))} label={`Llegada a ${s.name}`} />
                    <span>{plural(s.photos.length, 'foto', 'fotos')}</span>
                  </div>
                  <Thumbs files={s.photos} />
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 text-ink-soft sm:flex-row">
                  {i > 0 && (
                    <button
                      type="button"
                      title="Unir con la anterior"
                      aria-label="Unir con la anterior"
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-container hover:text-ink"
                      onClick={() => setStops((cur) => cur.flatMap((x, j) => (j === i - 1 ? [{ ...x, photos: [...x.photos, ...cur[i].photos] }] : j === i ? [] : [x])))}
                    >
                      <Icon name="call_merge" size={20} />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Quitar parada"
                    aria-label="Quitar parada"
                    className="grid h-9 w-9 place-items-center rounded-full hover:bg-red-50 hover:text-red-700"
                    onClick={() => setStops((cur) => cur.filter((_, j) => j !== i))}
                  >
                    <Icon name="delete" size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <aside className="space-y-4">
        {stops.length > 0 && (
          <div className="card p-3">
            <WorldMap className="h-64 shadow-none!" trips={[previewTrip(stops)]} airports={new Map()} numbered base="modern" controls={false} telemetry={false} legend={false} routeLink={false} />
          </div>
        )}
        <div className="card space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block font-display font-semibold">Nombre del viaje</span>
            <input className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div>
            <span className="mb-1 block font-display font-semibold">Fechas</span>
            <DateRangeField start={range[0]} end={range[1]} onChange={(a, b) => setRange([a, b])} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['done', 'Ya lo hice'],
                ['planned', 'Planificado'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`btn ${status === v ? 'btn-dark' : 'btn-ghost'}`}>
                {l}
              </button>
            ))}
          </div>
          {photoCount > 0 && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={upload} onChange={(e) => setUpload(e.target.checked)} />
              <span>
                Subir también {photoCount > MAX_UPLOAD ? `las ${MAX_UPLOAD} primeras` : `las ${photoCount}`} fotos al viaje
                <span className="block text-ink-soft">Sin ubicación ni datos de la cámara, cada una en su parada.</span>
              </span>
            </label>
          )}
          {phase === 'creating' ? (
            <div className="flex items-center gap-2 rounded-sm bg-surface-low px-4 py-3 text-sm">
              <Icon name="sync" size={18} className="animate-spin text-accent" /> {step}
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setPhase('pick')}>
                Otras fotos
              </button>
              <button type="button" className="btn btn-accent flex-1" disabled={!stops.length} onClick={create}>
                <Icon name="task_alt" size={18} /> Crear viaje
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Thumbs({ files }: { files: File[] }) {
  const urls = useMemo(() => files.slice(0, 4).map((f) => (/\.(heic|heif)$/i.test(f.name) ? null : URL.createObjectURL(f))), [files])
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls])
  if (!files.length) return null
  return (
    <div className="mt-2 flex gap-1.5">
      {urls.map((u, i) =>
        u ? (
          <img key={i} src={u} alt="" className="h-12 w-16 rounded-xs object-cover" />
        ) : (
          <span key={i} className="grid h-12 w-16 place-items-center rounded-xs bg-surface-container text-[10px] text-ink-soft">
            HEIC
          </span>
        ),
      )}
      {files.length > 4 && <span className="grid h-12 w-12 place-items-center rounded-xs bg-surface-container text-xs text-ink-soft">+{files.length - 4}</span>}
    </div>
  )
}

// ───────────────────────────── Desde Google Maps ─────────────────────────────

function GoogleImport() {
  const invalidate = useInvalidateTravel()
  const existing = useTrips()
  const input = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review' | 'importing' | 'done'>('pick')
  const [msg, setMsg] = useState('')
  const [trips, setTrips] = useState<(DetectedTrip & { title: string; selected: boolean; overlap: boolean })[]>([])
  const [shown, setShown] = useState(30)
  const [error, setError] = useState<unknown>(null)
  const [imported, setImported] = useState(0)

  async function read(files: FileList) {
    setError(null)
    setPhase('reading')
    try {
      const { visits, moves } = await readLocationFiles([...files], setMsg)
      if (!visits.length) throw new Error('No hemos encontrado visitas en ese archivo. Comprueba que es la exportación de la cronología de Google Maps.')
      setMsg(`Buscando viajes entre ${visits.length.toLocaleString('es-ES')} visitas…`)
      const { trips: found } = await detectTrips(visits, moves)
      const mine = existing.data ?? []
      setTrips(
        found.map((t) => {
          const overlap = mine.some((m) => m.start_date && m.start_date <= t.end && (m.end_date ?? m.start_date) >= t.start)
          // El viaje se llama como la parada más lejana de casa.
          const home = t.stops[0]
          const far = (x: DraftStop) => haversine([home.lon, home.lat], [x.lon, x.lat])
          const main = t.stops.slice(1, -1).reduce<DraftStop | undefined>((best, x) => (!best || far(x) > far(best) ? x : best), undefined)
          return { ...t, title: `Viaje a ${main?.name ?? 'destino'}`, selected: !overlap, overlap }
        }),
      )
      setPhase('review')
    } catch (e) {
      setError(e)
      setPhase('pick')
    }
  }

  const selected = trips.filter((t) => t.selected)
  async function importAll() {
    setPhase('importing')
    setError(null)
    let n = 0
    try {
      for (const [i, t] of selected.entries()) {
        // Paradas sin población conocida cerca: nombre con OpenStreetMap antes de guardar.
        const stops: DraftStop[] = []
        for (const s of t.stops) stops.push(isCoords(s.name) ? { ...s, ...(await nameForPoint(s.lat, s.lon)) } : s)
        await createTripWithStops({ title: t.title, status: 'done', start_date: t.start, end_date: t.end }, stops, (d, total) =>
          setMsg(`Viaje ${i + 1} de ${selected.length} · parada ${d} de ${total}`),
        )
        n++
        setImported(n)
      }
      await invalidate()
      setPhase('done')
    } catch (e) {
      setError(e)
      setImported(n)
      setPhase('review')
    }
  }

  if (phase === 'done')
    return (
      <div className="card p-8 text-center">
        <Icon name="task_alt" size={40} className="text-accent" />
        <h2 className="headline-md mt-2">{plural(imported, 'viaje importado', 'viajes importados')}</h2>
        <p className="mt-1 text-ink-soft">Revisa cada uno para añadir fotos, notas o corregir alguna parada.</p>
        <Link to="/app/bitacora" className="btn btn-accent mt-4">
          Ver la bitácora
        </Link>
      </div>
    )

  if (phase === 'pick' || phase === 'reading')
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="card p-6 md:p-8">
          <h2 className="headline-md">Exporta tu cronología</h2>
          <ol className="mt-4 space-y-4">
            {[
              { icon: 'android', t: 'Android', d: 'Ajustes → Ubicación → Servicios de ubicación → Cronología → «Exportar datos de Cronología». Se guarda un archivo Timeline.json.' },
              { icon: 'phone_iphone', t: 'iPhone', d: 'Google Maps → tu foto de perfil → Tu cronología → ⋯ → Ajustes de ubicación y privacidad → «Exportar datos de Cronología» (location-history.json).' },
              { icon: 'cloud_download', t: 'Google Takeout (historial antiguo)', d: 'takeout.google.com → solo «Historial de ubicaciones (Cronología)» → crear exportación. Sube el .zip tal cual.' },
            ].map(({ icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-low">
                  <Icon name={icon} className="text-accent" />
                </span>
                <span>
                  <span className="block font-display font-semibold">{t}</span>
                  <span className="text-sm text-ink-soft">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card flex flex-col justify-center gap-3 p-6 text-center">
          <ErrorNote error={error} />
          {phase === 'reading' ? (
            <>
              <Icon name="sync" size={36} className="mx-auto animate-spin text-accent" />
              <p className="text-sm text-ink-soft">{msg}</p>
            </>
          ) : (
            <>
              <Icon name="upload_file" size={36} className="mx-auto text-accent" />
              <button type="button" className="btn btn-accent mx-auto" onClick={() => input.current?.click()}>
                Subir archivo (.json o .zip)
              </button>
              <input ref={input} type="file" accept=".json,.zip,application/json,application/zip" multiple hidden onChange={(e) => e.target.files && read(e.target.files)} />
              <p className="text-sm text-ink-soft">
                <Icon name="lock" size={14} /> Se procesa en tu navegador: el historial no se sube. Solo se guardan los viajes que elijas.
              </p>
            </>
          )}
        </div>
      </div>
    )

  return (
    <div className="card p-5 md:p-8">
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="headline-md">{plural(trips.length, 'viaje encontrado', 'viajes encontrados')}</h2>
          <p className="text-sm text-ink-soft">Marca los que quieras importar. Los que coinciden en fechas con viajes que ya tienes vienen desmarcados.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setTrips((c) => c.map((t) => ({ ...t, selected: true })))}>
            Todos
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setTrips((c) => c.map((t) => ({ ...t, selected: false })))}>
            Ninguno
          </button>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {trips.slice(0, shown).map((t) => (
          <li key={t.id} className={`flex items-start gap-3 rounded-md p-3 transition ${t.selected ? 'bg-accent-soft/30 ring-1 ring-accent/40' : 'bg-surface-low'}`}>
            <input
              type="checkbox"
              aria-label={`Importar ${t.title}`}
              className="mt-2 h-5 w-5 shrink-0"
              checked={t.selected}
              disabled={phase === 'importing'}
              onChange={(e) => setTrips((c) => c.map((x) => (x.id === t.id ? { ...x, selected: e.target.checked } : x)))}
            />
            <div className="min-w-0 flex-1">
              <input
                aria-label="Nombre del viaje"
                className="w-full rounded-xs bg-transparent font-display text-lg font-semibold outline-none focus:bg-card focus:px-1"
                value={t.title}
                onChange={(e) => setTrips((c) => c.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)))}
              />
              <div className="text-sm text-ink-soft">
                {formatDay(t.start)} – {formatDay(t.end)} · {Math.round(t.km).toLocaleString('es-ES')} km
                {t.overlap && <span className="ml-2 rounded-xs bg-surface-container px-1.5 py-0.5 text-xs">Ya tienes un viaje en esas fechas</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                {t.countries.map((c) => (
                  <Flag key={c} code={c} />
                ))}
                <span className="truncate">{t.stops.map((s) => s.name).join(' → ')}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {trips.length > shown && (
        <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => setShown((n) => n + 30)}>
          Ver más ({trips.length - shown})
        </button>
      )}
      <div className="sticky bottom-0 -mx-5 mt-5 flex items-center justify-between gap-3 border-t border-surface-highest bg-card/95 px-5 py-3 backdrop-blur md:-mx-8 md:px-8">
        <span className="text-sm text-ink-soft">{phase === 'importing' ? msg : `${plural(selected.length, 'viaje seleccionado', 'viajes seleccionados')}`}</span>
        <button type="button" className="btn btn-accent" disabled={!selected.length || phase === 'importing'} onClick={importAll}>
          {phase === 'importing' ? <Icon name="sync" size={18} className="animate-spin" /> : <Icon name="download" size={18} />} Importar {selected.length || ''}
        </button>
      </div>
    </div>
  )
}
