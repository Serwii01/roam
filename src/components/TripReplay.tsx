import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, Source, type MapRef } from 'react-map-gl/maplibre'
import { setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import { api } from '../lib/api'
import { loadWorldShapes, type Shapes } from '../lib/countries'
import type { TripWithStops } from '../lib/db'
import { loadModernStyle, MAP_COLORS } from '../lib/mapStyle'
import { buildReplay, replayFrame, type ReplayFrame } from '../lib/replay'
import { formatKm, tripCountries, tripDays, type AirportMap } from '../lib/stats'
import { TRANSPORT } from '../lib/transport'
import { Icon } from './Icon'
import { SpotifyPlayer } from './Spotify'
import { Stamp } from './Stamp'
import { Flag, formatDate, plural } from './ui'

// Vite no resuelve el worker de MapLibre por sí solo: se sirve como asset.
setWorkerUrl(workerUrl)

const COLORS = MAP_COLORS.dark
/** Sin red para el mapa base: el globo con las siluetas de los países, que la app ya tiene guardadas. */
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': COLORS.ocean } }],
}
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

const routeData = (f: ReplayFrame): FeatureCollection => ({
  type: 'FeatureCollection',
  features: f.lines.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
})
const headData = (f: ReplayFrame): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: f.head } }],
})

/** Pantalla completa: la cámara recorre la ruta en el globo y en cada parada salen sus fotos y su sello. */
export function TripReplay({
  trip: t,
  airports,
  countryName,
  onShare,
  onClose,
}: {
  trip: TripWithStops
  airports: AirportMap
  countryName: (code: string) => string
  onShare: () => void
  onClose: () => void
}) {
  const replay = useMemo(() => buildReplay(t, airports, window.innerWidth), [t, airports])
  const calm = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const mapRef = useRef<MapRef>(null)
  const time = useRef(0)
  const kmRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLInputElement>(null)
  const [style, setStyle] = useState<StyleSpecification | null>(null)
  const [offline, setOffline] = useState(false)
  const [world, setWorld] = useState<Shapes | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [music, setMusic] = useState(false)
  // Solo cambia al pasar de escena o de foto: el resto de cada fotograma va directo al mapa, sin renderizar.
  const [step, setStep] = useState({ scene: 0, photo: 0, reached: 0 })

  useEffect(() => {
    loadModernStyle('dark').then(setStyle, () => {
      setOffline(true)
      setStyle(OFFLINE_STYLE)
    })
    loadWorldShapes().then(setWorld, () => {})
  }, [])

  // Sin la barra de desplazamiento de la página detrás.
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = before
    }
  }, [])

  // Las fotos se piden al empezar: si llegan tarde, la parada ya ha pasado.
  useEffect(() => {
    for (const s of replay.scenes) for (const p of s.photos) new Image().src = api.photoUrl(p.path)
  }, [replay])

  const paint = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const f = replayFrame(replay, t.stops, time.current, calm)
    map.jumpTo({ center: f.center, zoom: f.zoom, pitch: f.pitch })
    ;(map.getSource('replay-route') as GeoJSONSource | undefined)?.setData(routeData(f))
    ;(map.getSource('replay-head') as GeoJSONSource | undefined)?.setData(headData(f))
    if (kmRef.current) kmRef.current.textContent = formatKm(f.km)
    if (barRef.current) barRef.current.value = String(time.current)
    const s = replay.scenes[f.scene]
    const photo = s.photos.length ? Math.min(s.photos.length - 1, Math.floor(f.progress * s.photos.length)) : 0
    setStep((old) => (old.scene === f.scene && old.photo === photo && old.reached === f.reached ? old : { scene: f.scene, photo, reached: f.reached }))
  }, [replay, t.stops, calm])

  useEffect(() => {
    if (!loaded) return
    paint()
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      // Con la pestaña en segundo plano no hay fotogramas: al volver sigue donde estaba.
      time.current = Math.min(replay.duration, time.current + Math.min((now - last) / 1000, 0.1))
      last = now
      paint()
      if (time.current >= replay.duration) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [loaded, playing, paint, replay])

  const toggle = useCallback(() => {
    if (time.current >= replay.duration) time.current = 0
    setPlaying((p) => !p)
  }, [replay])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, toggle])

  const scene = replay.scenes[step.scene]
  const stop = t.stops[scene.stop]
  const photo = scene.photos[step.photo]
  const countries = tripCountries(t)
  const reachedCountries = useMemo(() => [...new Set(t.stops.slice(0, step.reached).map((s) => s.country_code))], [t.stops, step.reached])
  const litFilter = useMemo(() => ['in', ['get', 'code'], ['literal', reachedCountries]] as never, [reachedCountries])
  const days = tripDays(t)
  const atStop = scene.kind === 'stop'
  const showPhoto = atStop || scene.kind === 'album'
  const again = () => {
    time.current = 0
    setPlaying(true)
    paint()
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Revive ${t.title}`} className="fixed inset-0 z-[60] overflow-hidden bg-[#0c0c0d] text-white">
      {style && (
        <Map
          ref={mapRef}
          initialViewState={{ longitude: replay.overview.center[0], latitude: replay.overview.center[1], zoom: replay.overview.zoom }}
          mapStyle={style}
          projection={{ type: 'globe' }}
          interactive={false}
          attributionControl={offline ? false : { compact: true }}
          renderWorldCopies={false}
          onLoad={() => setLoaded(true)}
          style={{ width: '100%', height: '100%' }}
        >
          <Source id="replay-world" type="geojson" data={world ?? EMPTY} tolerance={0}>
            {offline && <Layer id="replay-land" type="fill" paint={{ 'fill-color': COLORS.land }} />}
            <Layer id="replay-lit" type="fill" filter={litFilter} paint={{ 'fill-color': COLORS.accent, 'fill-opacity': 0.28 }} />
          </Source>
          <Source id="replay-route" type="geojson" data={EMPTY}>
            <Layer id="replay-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': COLORS.accent, 'line-width': 3.5 }} />
          </Source>
          <Source id="replay-head" type="geojson" data={EMPTY}>
            <Layer id="replay-glow" type="circle" paint={{ 'circle-radius': 16, 'circle-color': COLORS.accent, 'circle-opacity': 0.25 }} />
            <Layer id="replay-dot" type="circle" paint={{ 'circle-radius': 6, 'circle-color': COLORS.accent, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 }} />
          </Source>
        </Map>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[calc(1rem+env(safe-area-inset-top))] md:p-6">
        <div className="min-w-0">
          <div className="label-stamp truncate text-white/70">{t.title}</div>
          <div className="mt-1 font-display text-lg font-semibold">
            <span ref={kmRef}>0</span> km
          </div>
        </div>
        <button type="button" onClick={onClose} className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/40 hover:bg-black/60" aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </div>

      {scene.kind === 'intro' && (
        <div className="replay-fade pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <div className="label-stamp text-white/70">{formatDate(t.start_date, 'month') || 'Tu viaje'}</div>
            <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight md:text-6xl">{t.title}</h2>
          </div>
        </div>
      )}

      {scene.kind === 'leg' && stop && (
        <div key={step.scene} className="replay-fade pointer-events-none absolute inset-x-0 bottom-28 flex justify-center px-4">
          <span className="flex max-w-full items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm backdrop-blur">
            <Icon name={TRANSPORT[stop.transport_in ?? 'car'].icon} size={18} className="text-accent" />
            <span className="truncate">
              {TRANSPORT[stop.transport_in ?? 'car'].label} a {stop.name} · {formatKm(scene.km)} km
            </span>
          </span>
        </div>
      )}

      {showPhoto && stop && (
        <div className={`pointer-events-none absolute inset-x-0 flex flex-col items-center gap-3 px-4 ${atStop ? 'bottom-24 md:bottom-28' : 'inset-y-0 justify-center'}`}>
          {photo && (
            <figure key={photo.id} className="replay-photo w-[min(78vw,26rem)] rotate-[-1.5deg] bg-white p-2 pb-3 text-ink shadow-2xl">
              <img src={api.photoUrl(photo.path)} alt={photo.caption ?? `Foto de ${stop.name}`} className="aspect-[4/3] w-full bg-black/10 object-cover" />
              {photo.caption && <figcaption className="mt-2 truncate px-1 text-center text-sm text-[#1a1c1d]">{photo.caption}</figcaption>}
            </figure>
          )}
          {atStop && (
            <div key={step.scene} className="replay-fade flex max-w-full items-center gap-3 rounded-md bg-black/55 px-4 py-3 backdrop-blur">
              <Flag code={stop.country_code} className="h-6 w-8 shrink-0 rounded-sm" />
              <span className="min-w-0">
                <span className="block truncate font-display text-xl font-semibold leading-tight">{stop.name}</span>
                <span className="block truncate text-sm text-white/70">{[countryName(stop.country_code), formatDate(stop.arrived_on, 'long')].filter(Boolean).join(' · ')}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {atStop && scene.stamp && stop && (
        <div key={`stamp-${step.scene}`} className="stamp-drop pointer-events-none absolute right-4 top-24 text-ink md:right-10 md:top-28">
          <Stamp stampKey={`${t.id}-${stop.country_code}`} countryCode={stop.country_code} countryName={countryName(stop.country_code)} place={stop.name} date={stop.arrived_on ?? t.start_date} size="sm" />
        </div>
      )}

      {scene.kind === 'outro' && (
        <div className="replay-fade absolute inset-0 grid place-items-center bg-black/40 p-6 text-center">
          <div>
            <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight md:text-5xl">{t.title}</h2>
            <p className="mt-4 text-lg text-white/85">
              {[`${formatKm(replay.km)} km`, plural(countries.length, 'país', 'países'), plural(t.stops.length, 'parada', 'paradas'), days && `${days} días`].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-accent" onClick={onShare}>
                <Icon name="ios_share" size={18} /> Compartir imagen
              </button>
              <button type="button" className="btn bg-white/15 text-white hover:bg-white/25" onClick={again}>
                <Icon name="replay" size={18} /> Otra vez
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[calc(2.25rem+env(safe-area-inset-bottom))] pt-6 md:px-6">
        {t.soundtrack_url && (
          // Se oculta sin desmontar: si no, la música se cortaría al cerrar el panel.
          <div className={`mx-auto mb-3 w-full max-w-sm ${music ? '' : 'hidden'}`}>
            <SpotifyPlayer url={t.soundtrack_url} compact />
          </div>
        )}
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button type="button" onClick={toggle} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black" aria-label={playing ? 'Pausar' : 'Reproducir'}>
            <Icon name={playing ? 'pause' : 'play_arrow'} filled />
          </button>
          <input
            ref={barRef}
            type="range"
            min={0}
            max={replay.duration}
            step={0.1}
            defaultValue={0}
            aria-label="Momento del viaje"
            className="min-w-0 flex-1 accent-[var(--color-accent)]"
            onChange={(e) => {
              time.current = Number(e.target.value)
              paint()
            }}
          />
          {t.soundtrack_url && (
            <button type="button" onClick={() => setMusic((m) => !m)} aria-pressed={music} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${music ? 'bg-accent text-white' : 'bg-white/15'}`} aria-label="Banda sonora del viaje">
              <Icon name="music_note" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
