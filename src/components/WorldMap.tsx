import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre'
import { setWorkerUrl, type MapLayerMouseEvent, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { loadWorldShapes, type Shapes } from '../lib/countries'
import type { Stop, TransportMode, TripWithStops } from '../lib/db'
import { bounds, greatCircle, type LngLat } from '../lib/geo'
import { useCountries } from '../lib/hooks'
import { loadModernStyle } from '../lib/mapStyle'
import { formatKm, legEndpoints, tripCountries, tripDays, tripKm, tripModes, type AirportMap } from '../lib/stats'
import { TRANSPORT } from '../lib/transport'
import { Icon } from './Icon'
import { Flag, coords, formatRange } from './ui'

// Vite no resuelve el worker de MapLibre por sí solo: se sirve como asset.
setWorkerUrl(workerUrl)

const ACCENT = '#d53e00'
const INK = '#1a1c1d'
/** Mapa base minimalista del diseño: solo países sobre fondo punteado. */
const MINIMAL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }],
}

export type MapMode = '2d' | '3d' | 'heat'

/** En pantallas táctiles el mapa se mueve con dos dedos, para que un dedo siga desplazando la página. */
export const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export const MAP_LOCALE = {
  'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
  'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para hacer zoom',
  'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para hacer zoom',
}


interface Props {
  trips: TripWithStops[]
  airports: AirportMap
  /** Países a colorear (estilo Been). */
  countries?: string[]
  /** Viaje resaltado en naranja; el resto se dibuja como "archivado". */
  activeTripId?: string
  onCountryClick?: (code: string) => void
  /** Marcadores numerados por parada (vista de un viaje). */
  numbered?: boolean
  /** Tarjeta flotante junto al último pin. */
  pinCard?: { stop: Stop; title: ReactNode; body: ReactNode }
  controls?: boolean
  telemetry?: boolean
  legend?: boolean
  initialMode?: MapMode
  /** Mapa base inicial: minimalista (diseño) o moderno en color. El botón de capas alterna entre ambos. */
  base?: 'minimal' | 'modern'
  /** Tarjeta con la información del viaje al pasar el ratón por una ruta. */
  routeInfo?: boolean
  /** Al hacer clic en una ruta, abrir su bitácora. */
  routeLink?: boolean
  className?: string
}

export function WorldMap({
  trips,
  airports,
  countries,
  activeTripId,
  onCountryClick,
  numbered,
  pinCard,
  controls = true,
  telemetry = true,
  legend = true,
  initialMode = '2d',
  base = 'minimal',
  routeInfo = true,
  routeLink = true,
  className = '',
}: Props) {
  const navigate = useNavigate()
  const countryNames = useCountries()
  const mapRef = useRef<MapRef>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [world, setWorld] = useState<Shapes | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<MapMode>(initialMode)
  const [detail, setDetail] = useState(base === 'modern')
  // Solo el id del viaje bajo el cursor: la posición la siguen RouteCard y Telemetry por su cuenta,
  // así mover el ratón no vuelve a renderizar el mapa entero en cada píxel.
  const [hoverTripId, setHoverTripId] = useState<string | null>(null)
  const hoverPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const highlight = hoverTripId ?? activeTripId

  useEffect(() => {
    loadWorldShapes().then(setWorld)
  }, [])

  const [modernStyle, setModernStyle] = useState<StyleSpecification | null>(null)
  useEffect(() => {
    if (detail && !modernStyle) loadModernStyle().then(setModernStyle, () => setDetail(false))
  }, [detail, modernStyle])

  // MapLibre solo escucha la ventana; esto lo ajusta también cuando cambia el contenedor.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => mapRef.current?.resize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const lines = useMemo(() => {
    const features: FeatureCollection<LineString, RouteProps>['features'] = []
    for (const t of trips) {
      for (let i = 1; i < t.stops.length; i++) {
        const m = t.stops[i].transport_in ?? 'car'
        const [a, b] = legEndpoints(t.stops, i, airports)
        features.push({
          type: 'Feature',
          properties: { mode: m, active: !highlight || t.id === highlight, tripId: t.id },
          geometry: { type: 'LineString', coordinates: m === 'plane' ? greatCircle(a, b) : bendLine(a, b) },
        })
      }
    }
    return { type: 'FeatureCollection', features } as FeatureCollection<LineString, RouteProps>
  }, [trips, airports, highlight])

  const points = useMemo(() => {
    const seen = new Set<string>()
    const out: { stop: Stop; active: boolean; n: number }[] = []
    for (const t of trips) {
      t.stops.forEach((s, i) => {
        const key = numbered ? s.id : `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({ stop: s, active: !highlight || t.id === highlight, n: i + 1 })
      })
    }
    return out
  }, [trips, highlight, numbered])

  const pointsGeo = useMemo<FeatureCollection<Point, { active: boolean }>>(
    () => ({
      type: 'FeatureCollection',
      features: numbered
        ? []
        : points.map(({ stop, active }) => ({ type: 'Feature', properties: { active }, geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] } })),
    }),
    [points, numbered],
  )

  const heat = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: trips.flatMap((t) => t.stops.map((s) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] } }))),
    }),
    [trips],
  )

  // Encuadra el mapa en las rutas (o en el viaje activo) cuando cambian.
  const fitKey = `${activeTripId ?? ''}|${points.length}|${lines.features.length}|${mode}`
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const focus = activeTripId ? trips.filter((t) => t.id === activeTripId) : trips
    const pts: LngLat[] = focus.flatMap((t) => t.stops.map((s) => [s.lon, s.lat] as LngLat))
    const b = bounds(pts)
    if (!b) return
    if (pts.length === 1 || (b[1][0] - b[0][0] < 0.5 && b[1][1] - b[0][1] < 0.5)) map.flyTo({ center: pts[0], zoom: 5, duration: 700 })
    else if (mode === '3d') {
      // En el globo se centra la vista: ajustar los límites acercaba tanto que no se veía la Tierra.
      const span = Math.max(b[1][0] - b[0][0], (b[1][1] - b[0][1]) * 2)
      map.flyTo({ center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom: span > 120 ? 1.5 : span > 40 ? 2.2 : 3.2, duration: 900 })
    } else {
      // Margen proporcional: los mapas pequeños (tarjetas) no pueden reservar 90 px para los controles.
      const h = boxRef.current?.clientHeight ?? 400
      const big = h > 380
      const pad = Math.round(h * 0.12)
      map.fitBounds(b, {
        padding: { top: big ? 90 : pad + (controls ? 44 : 0), bottom: big ? 70 : pad + 16, left: big ? 60 : pad, right: big ? 60 : pad + (controls ? 40 : 0) },
        maxZoom: 6.5,
        duration: 700,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, loaded])

  const visitedFilter = useMemo(() => ['in', ['get', 'code'], ['literal', countries ?? []]] as never, [countries])

  const routeAt = (e: MapLayerMouseEvent) => e.features?.find((f) => f.layer.id === 'routes-hit')?.properties?.tripId as string | undefined

  const onClick = (e: MapLayerMouseEvent) => {
    const tripId = routeAt(e)
    if (tripId && routeLink) return navigate(`/app/viajes/${tripId}`)
    const code = e.features?.find((f) => f.layer.id === 'land')?.properties?.code as string | undefined
    if (code && onCountryClick) onCountryClick(code)
  }

  const onMove = (e: MapLayerMouseEvent) => {
    if (!routeInfo) return
    hoverPoint.current = e.point
    const tripId = routeAt(e) ?? null
    if (tripId !== hoverTripId) setHoverTripId(tripId)
  }

  const hoverTrip = hoverTripId ? trips.find((t) => t.id === hoverTripId) : undefined
  const interactive = [...(onCountryClick && world ? ['land'] : []), ...(routeInfo && mode !== 'heat' ? ['routes-hit'] : [])]

  const lineColor = ['case', ['get', 'active'], ACCENT, INK] as never
  const lineOpacity = ['case', ['get', 'active'], 0.95, 0.35] as never
  const pinCenter = pinCard ? ([pinCard.stop.lon, pinCard.stop.lat] as LngLat) : null

  return (
    <div ref={boxRef} className={`card dot-grid relative overflow-hidden ${className}`}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 20, latitude: 30, zoom: 1.3 }}
        mapStyle={detail && modernStyle ? modernStyle : MINIMAL_STYLE}
        projection={{ type: mode === '3d' ? 'globe' : 'mercator' }}
        attributionControl={detail && modernStyle ? { compact: true } : false}
        interactiveLayerIds={interactive.length ? interactive : undefined}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverTripId(null)}
        onLoad={() => setLoaded(true)}
        cursor={hoverTripId && routeLink ? 'pointer' : onCountryClick ? 'pointer' : 'grab'}
        renderWorldCopies={false}
        cooperativeGestures={IS_TOUCH}
        locale={MAP_LOCALE}
        style={{ width: '100%', height: '100%' }}
      >
        {/*
          Todas las fuentes y capas están siempre montadas, en este orden (de abajo arriba), y cada modo
          solo cambia su visibilidad. Si se montaran al cambiar de modo, MapLibre las añadiría encima de
          todo: el océano del globo tapaba países y rutas (el "mapa gris").
        */}
        <Source id="ocean" type="geojson" data={OCEAN}>
          <Layer id="ocean" type="fill" layout={{ visibility: vis(mode === '3d' && !detail) }} paint={{ 'fill-color': '#eef0f2' }} />
        </Source>

        <Source id="world" type="geojson" data={world ?? EMPTY} tolerance={0}>
          <Layer id="land" type="fill" paint={{ 'fill-color': detail ? 'rgba(0,0,0,0)' : '#e6e5e1' }} />
          <Layer id="land-line" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': detail ? 0 : 1 }} />
          <Layer
            id="visited"
            type="fill"
            filter={visitedFilter}
            layout={{ visibility: vis(!!countries) }}
            paint={{ 'fill-color': ACCENT, 'fill-opacity': detail ? 0.3 : 0.82 }}
          />
          <Layer id="visited-line" type="line" filter={visitedFilter} layout={{ visibility: vis(!!countries) }} paint={{ 'line-color': detail ? ACCENT : '#fff', 'line-width': detail ? 1.2 : 0.8 }} />
        </Source>

        <Source id="heat" type="geojson" data={heat}>
          <Layer
            id="heat"
            type="heatmap"
            layout={{ visibility: vis(mode === 'heat') }}
            paint={{
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 18, 6, 40] as never,
              'heatmap-intensity': 1.2,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(213,62,0,0)',
                0.3,
                'rgba(255,181,159,0.6)',
                0.7,
                'rgba(213,62,0,0.8)',
                1,
                'rgba(133,36,0,0.95)',
              ] as never,
            }}
          />
        </Source>

        <Source id="routes" type="geojson" data={lines}>
          {/* Zona de contacto invisible y ancha, para que sea fácil pasar el ratón por una ruta. */}
          <Layer id="routes-hit" type="line" layout={{ 'line-cap': 'round', visibility: vis(mode !== 'heat') }} paint={{ 'line-color': '#000', 'line-opacity': 0, 'line-width': 16 }} />
          <Layer
            id="routes-ground"
            type="line"
            filter={['!=', ['get', 'mode'], 'plane']}
            layout={{ 'line-cap': 'round', 'line-join': 'round', visibility: vis(mode !== 'heat') }}
            paint={{ 'line-color': lineColor, 'line-opacity': lineOpacity, 'line-width': ['case', ['get', 'active'], 2.6, 1.4] as never }}
          />
          <Layer
            id="routes-air"
            type="line"
            filter={['==', ['get', 'mode'], 'plane']}
            layout={{ visibility: vis(mode !== 'heat') }}
            paint={{
              'line-color': lineColor,
              'line-opacity': lineOpacity,
              'line-width': ['case', ['get', 'active'], 2, 1.2] as never,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>

        <Source id="points" type="geojson" data={pointsGeo}>
          <Layer
            id="points"
            type="circle"
            layout={{ visibility: vis(mode !== 'heat') }}
            paint={{
              'circle-radius': ['case', ['get', 'active'], 5, 4] as never,
              'circle-color': '#ffffff',
              'circle-stroke-width': 3,
              'circle-stroke-color': ['case', ['get', 'active'], ACCENT, INK] as never,
              'circle-pitch-alignment': 'map',
            }}
          />
        </Source>

        {mode !== 'heat' &&
          numbered &&
          points.map(({ stop, n }) => (
            <Marker key={`${stop.id}-${n}`} longitude={stop.lon} latitude={stop.lat} anchor="center">
              <div
                title={stop.name}
                className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-ink font-display text-[11px] font-bold text-white shadow"
              >
                {n}
              </div>
            </Marker>
          ))}

        {pinCard && mode !== 'heat' && (
          <Marker longitude={pinCard.stop.lon} latitude={pinCard.stop.lat} anchor="top-left" offset={[-14, -14]}>
            <div className="pointer-events-none">
              <div className="relative h-7 w-7">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
                <span className="absolute inset-1 grid place-items-center rounded-full bg-accent text-white shadow-[var(--shadow-accent)]">
                  <Icon name="location_on" size={14} filled />
                </span>
              </div>
              <div className="card ml-6 mt-1 w-52 p-3">
                <div className="label-stamp flex items-center justify-between text-accent-deep">
                  {pinCard.title} <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                </div>
                <div className="mt-1 text-sm">{pinCard.body}</div>
              </div>
            </div>
          </Marker>
        )}
      </Map>

      {hoverTrip && (
        <RouteCard
          trip={hoverTrip}
          airports={airports}
          name={countryNames.name}
          mapRef={mapRef}
          start={hoverPoint.current}
          width={boxRef.current?.clientWidth ?? 600}
          height={boxRef.current?.clientHeight ?? 400}
          link={routeLink}
        />
      )}

      {telemetry && (
        <div className="card pointer-events-none absolute left-4 top-4 hidden items-center gap-4 px-4 py-2.5 sm:flex">
          <div>
            <div className="label-stamp text-ink-soft">Sistema telemetría</div>
            <Telemetry mapRef={mapRef} fallback={pinCenter} />
          </div>
        </div>
      )}

      {controls && (
        <div className="absolute right-4 top-4 flex gap-2">
          <div className="card flex p-1">
            {(
              [
                ['2d', '2D plano'],
                ['3d', '3D globo'],
                ['heat', 'Calor'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`label-code rounded-xs px-2.5 py-1.5 ${mode === m ? 'bg-ink text-white' : m === 'heat' ? 'text-accent-deep' : 'text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setDetail(!detail)}
            title={detail ? 'Mapa minimalista' : 'Mapa moderno (agua, calles y nombres)'}
            className={`card grid w-10 place-items-center ${detail ? 'bg-ink! text-white' : ''}`}
          >
            <Icon name="layers" size={20} />
          </button>
        </div>
      )}

      <div className={`absolute bottom-4 right-4 flex-col gap-2 ${controls ? 'flex' : 'hidden'}`}>
        <MapButton icon="add" onClick={() => mapRef.current?.zoomIn()} />
        <MapButton icon="remove" onClick={() => mapRef.current?.zoomOut()} />
        <MapButton
          icon="my_location"
          onClick={() => {
            const b = bounds(trips.flatMap((t) => t.stops.map((s) => [s.lon, s.lat] as LngLat)))
            if (b) mapRef.current?.fitBounds(b, { padding: 60, maxZoom: 6, duration: 700 })
          }}
        />
      </div>

      {legend && (
        <div className="card label-code absolute bottom-4 left-4 hidden gap-5 px-4 py-2 text-[10px] sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Activo / reciente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-ink" /> Archivado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-accent" /> Ruta terrestre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-accent" /> Vuelo
          </span>
        </div>
      )}
    </div>
  )
}

type RouteProps = { mode: TransportMode; active: boolean; tripId: string }

/** Ficha flotante de la expedición al pasar el ratón por su ruta. */
function RouteCard({
  trip,
  airports,
  name,
  mapRef,
  start,
  width,
  height,
  link,
}: {
  trip: TripWithStops
  airports: AirportMap
  name: (code: string) => string
  mapRef: React.RefObject<MapRef | null>
  start: { x: number; y: number }
  width: number
  height: number
  link: boolean
}) {
  const [{ x, y }, setPos] = useState(start)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const move = (e: { point: { x: number; y: number } }) => setPos(e.point)
    map.on('mousemove', move)
    return () => {
      map.off('mousemove', move)
    }
  }, [mapRef])
  const W = 264
  const left = Math.max(8, Math.min(x + 16, width - W - 8))
  const top = y + 16 + 180 > height ? Math.max(8, y - 196) : y + 16
  const origin = trip.stops[0]?.country_code
  const dest = tripCountries(trip).filter((c) => c !== origin)
  const shown = dest.length ? dest : tripCountries(trip)
  const days = tripDays(trip)
  return (
    <div className="card pointer-events-none absolute z-10 p-4" style={{ left, top, width: W }}>
      <div className="label-stamp flex items-center justify-between gap-2 text-accent-deep">
        <span>{trip.status === 'planned' ? 'Expedición planificada' : 'Expedición'}</span>
        <span className="text-ink-soft">{formatKm(tripKm(trip, airports))} km</span>
      </div>
      <div className="headline-sm mt-1 line-clamp-2">{trip.title}</div>
      <div className="label-code mt-1 text-ink-soft">
        {formatRange(trip.start_date, trip.end_date)}
        {days ? ` · ${days} días` : ''}
      </div>
      <div className="mt-2 line-clamp-2 text-xs text-ink-soft">{trip.stops.map((s) => s.name).join(' → ')}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          {shown.slice(0, 4).map((c) => (
            <span key={c} className="flex items-center gap-1">
              <Flag code={c} /> {shown.length <= 2 ? name(c) : ''}
            </span>
          ))}
        </span>
        <span className="flex shrink-0 gap-1 text-accent">
          {tripModes(trip).map((m) => (
            <Icon key={m} name={TRANSPORT[m].icon} size={16} />
          ))}
        </span>
      </div>
      {link && <div className="label-stamp mt-3 border-t border-surface-highest pt-2 text-ink-soft">Clic para abrir la bitácora →</div>}
    </div>
  )
}

/** Coordenadas bajo el cursor ("sistema telemetría"), actualizadas sin renderizar el mapa. */
function Telemetry({ mapRef, fallback }: { mapRef: React.RefObject<MapRef | null>; fallback: LngLat | null }) {
  const [pos, setPos] = useState<LngLat | null>(null)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    let frame = 0
    const move = (e: { lngLat: { lng: number; lat: number } }) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPos([e.lngLat.lng, e.lngLat.lat]))
    }
    const out = () => setPos(null)
    map.on('mousemove', move)
    map.on('mouseout', out)
    return () => {
      cancelAnimationFrame(frame)
      map.off('mousemove', move)
      map.off('mouseout', out)
    }
  }, [mapRef])
  const c = pos ?? fallback
  return <div className="label-code mt-0.5 tracking-[0.08em]">WGS 84 // {c ? coords(c[1], c[0]) : '—'}</div>
}

function MapButton({ icon, onClick }: { icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card grid h-10 w-10 place-items-center hover:bg-surface-low">
      <Icon name={icon} size={20} />
    </button>
  )
}

/** Curva suave para rutas terrestres (como en el diseño), en vez de una recta. */
function bendLine(a: LngLat, b: LngLat, steps = 24): LngLat[] {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const len = Math.hypot(dx, dy)
  if (len < 0.05) return [a, b]
  const bend = Math.min(len * 0.12, 1.5)
  const c: LngLat = [(a[0] + b[0]) / 2 - (dy / len) * bend, (a[1] + b[1]) / 2 + (dx / len) * bend]
  const pts: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push([
      (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
      (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
    ])
  }
  return pts
}

const vis = (on: boolean) => (on ? 'visible' : 'none') as 'visible' | 'none'
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Esfera completa para pintar el océano en el modo globo. */
const OCEAN: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
        ],
      },
    },
  ],
}
