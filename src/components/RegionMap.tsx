import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, Source, type MapRef } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadRegionShapes, type Shapes } from '../lib/countries'
import { bounds, type LngLat } from '../lib/geo'
import { IS_TOUCH, MAP_LOCALE } from './WorldMap' // además registra el worker de MapLibre

const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }],
}

/** Mapa de las regiones/provincias de un país; las visitadas en naranja, clic para marcar. */
export function RegionMap({
  countryCode,
  visited,
  onToggle,
  className = '',
}: {
  countryCode: string
  visited: Set<string>
  onToggle?: (code: string, name: string) => void
  className?: string
}) {
  const mapRef = useRef<MapRef>(null)
  const [shapes, setShapes] = useState<Shapes | null | undefined>(undefined)
  const [hover, setHover] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setShapes(undefined)
    loadRegionShapes(countryCode).then(setShapes)
  }, [countryCode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !shapes) return
    const pts: LngLat[] = []
    for (const f of shapes.features) {
      const walk = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === 'number') pts.push(c as LngLat)
        else if (Array.isArray(c)) c.forEach(walk)
      }
      walk((f.geometry as { coordinates: unknown }).coordinates)
    }
    // Países que cruzan el antimeridiano (Rusia, Fiyi…): se ignoran las longitudes negativas extremas.
    const filtered = countryCode === 'RU' || countryCode === 'FJ' ? pts.filter((p) => p[0] > 0) : pts
    const b = bounds(filtered)
    if (b) map.fitBounds(b, { padding: 30, duration: 0 })
  }, [shapes, loaded, countryCode])

  const filter = useMemo(() => ['in', ['get', 'code'], ['literal', [...visited]]] as never, [visited])

  const onClick = (e: MapLayerMouseEvent) => {
    const p = e.features?.[0]?.properties as { code?: string; name?: string } | undefined
    if (p?.code && onToggle) onToggle(p.code, p.name ?? p.code)
  }

  if (shapes === null) {
    return <div className={`card dot-grid grid place-items-center text-ink-soft ${className}`}>Sin mapa de regiones para este país</div>
  }

  return (
    <div className={`card dot-grid relative overflow-hidden ${className}`}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 2 }}
        mapStyle={STYLE}
        attributionControl={false}
        interactiveLayerIds={shapes ? ['regions'] : undefined}
        onClick={onClick}
        onMouseMove={(e) => setHover((e.features?.[0]?.properties?.name as string) ?? null)}
        onMouseLeave={() => setHover(null)}
        onLoad={() => setLoaded(true)}
        cursor={onToggle ? 'pointer' : 'default'}
        renderWorldCopies={false}
        cooperativeGestures={IS_TOUCH}
        locale={MAP_LOCALE}
        style={{ width: '100%', height: '100%' }}
      >
        {shapes && (
          <Source id="regions" type="geojson" data={shapes}>
            <Layer id="regions" type="fill" paint={{ 'fill-color': '#e6e5e1' }} />
            <Layer id="regions-visited" type="fill" filter={filter} paint={{ 'fill-color': '#d53e00', 'fill-opacity': 0.85 }} />
            <Layer id="regions-line" type="line" paint={{ 'line-color': '#fff', 'line-width': 1 }} />
          </Source>
        )}
      </Map>
      {hover && <div className="card label-code pointer-events-none absolute left-4 top-4 px-3 py-2">{hover}</div>}
    </div>
  )
}
