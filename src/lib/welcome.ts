// Sello al llegar: en qué país estás, sin enviar la ubicación a ningún sitio (se comprueba en el móvil contra las
// siluetas de los países) y qué países del viaje en marcha ya se han celebrado.
import type { Position } from 'geojson'
import type { Shapes } from './countries'
import type { Stop, TripWithStops } from './db'
import { haversine } from './geo'

const ENABLED = 'roam-arrival-stamps'
/** Lo lanza Hoy al activar el sello, para comprobar la ubicación sin esperar a la próxima vez que se abra la app. */
export const ARRIVAL_ENABLED_EVENT = 'roam-arrival-enabled'

export function arrivalStampsEnabled() {
  try {
    return localStorage.getItem(ENABLED) === 'on'
  } catch {
    return false
  }
}

export function enableArrivalStamps() {
  try {
    localStorage.setItem(ENABLED, 'on')
  } catch {
    // Sin almacenamiento (modo privado), el sello solo funciona en esta visita.
  }
  window.dispatchEvent(new Event(ARRIVAL_ENABLED_EVENT))
}

export const currentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 600_000, timeout: 15_000 }))

function inRing(p: [number, number], ring: Position[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** El primer anillo es el contorno; los demás, agujeros. */
const inPolygon = (p: [number, number], rings: Position[][]) => inRing(p, rings[0]) && !rings.slice(1).some((r) => inRing(p, r))

/** Código del país en ese punto, o null en el mar. Las siluetas están simplificadas: se dejan fuera costas e islas pequeñas. */
export function countryAt(shapes: Shapes, lon: number, lat: number): string | null {
  for (const f of shapes.features) {
    const g = f.geometry
    if (g.type === 'Polygon' ? inPolygon([lon, lat], g.coordinates) : g.type === 'MultiPolygon' && g.coordinates.some((c) => inPolygon([lon, lat], c))) return f.properties.code
  }
  return null
}

const KM_LAT = 110.57
const wrapLon = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d)

/** Distancia en km del punto `p` al segmento a-b (proyección local: basta para unas decenas de km). */
function segmentKm(p: [number, number], kmLon: number, a: Position, b: Position) {
  const ax = wrapLon(a[0] - p[0]) * kmLon
  const ay = (a[1] - p[1]) * KM_LAT
  const dx = wrapLon(b[0] - p[0]) * kmLon - ax
  const dy = (b[1] - p[1]) * KM_LAT - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

const bboxes = new WeakMap<object, [number, number, number, number]>()
function bboxOf(f: Shapes['features'][number]): [number, number, number, number] {
  let b = bboxes.get(f)
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity]
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) for (const [x, y] of poly[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
    bboxes.set(f, b)
  }
  return b
}

/**
 * País cuyo borde queda más cerca, a `maxKm` como mucho. Las siluetas simplificadas recortan la costa unos
 * kilómetros: el centro de Estambul, Reikiavik, Venecia, Copenhague o Hong Kong caen «en el mar».
 */
export function nearestCountry(shapes: Shapes, lon: number, lat: number, maxKm: number): string | null {
  const p: [number, number] = [lon, lat]
  const kmLon = Math.max(1, Math.cos((lat * Math.PI) / 180) * 111.32)
  const mLat = maxKm / KM_LAT
  const mLon = maxKm / kmLon
  let best: { code: string; km: number } | null = null
  for (const f of shapes.features) {
    const [x0, y0, x1, y1] = bboxOf(f)
    const outLon = lon < x0 ? x0 - lon : lon > x1 ? lon - x1 : 0
    if (lat < y0 - mLat || lat > y1 + mLat || Math.min(outLon, 360 - outLon) > mLon) continue
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys)
      for (const ring of poly)
        for (let i = 1; i < ring.length; i++) {
          const km = segmentKm(p, kmLon, ring[i - 1], ring[i])
          if (km <= maxKm && (!best || km < best.km)) best = { code: f.properties.code, km }
        }
  }
  return best?.code ?? null
}

/** Hasta aquí del borde de un país se cuenta como estar en él (la costa recortada por la simplificación). */
const NEAR_BORDER_KM = 15
/** Hasta aquí de una parada del viaje se cuenta como estar en ella (islas que el mapa simplificado no tiene, como Ibiza o Azores). */
const NEAR_STOP_KM = 100
/** En un país que no es del viaje, una parada así de cerca manda: aeropuertos de frontera como Ginebra, que la silueta deja en Francia. */
const BORDER_STOP_KM = 30

/**
 * En qué país del viaje estás: el de las siluetas (o el de la costa más cercana). Si no es ninguno de los del viaje,
 * el de la parada más cercana: fuera de las siluetas, hasta 100 km; dentro de otro país, hasta 30 km.
 */
export function arrivalCountry(shapes: Shapes, trip: TripWithStops, lon: number, lat: number): string | null {
  const found = countryAt(shapes, lon, lat) ?? nearestCountry(shapes, lon, lat, NEAR_BORDER_KM)
  if (found && trip.stops.some((s) => s.country_code === found)) return found
  const near = trip.stops.map((s) => ({ s, km: haversine([lon, lat], [s.lon, s.lat]) })).sort((a, b) => a.km - b.km)[0]
  if (near && near.km <= (found ? BORDER_STOP_KM : NEAR_STOP_KM)) return near.s.country_code
  return found
}

/** País de casa: el del perfil o, sin él, el de salida del viaje. Muchos viajes no apuntan la salida de casa. */
const homeOf = (trip: TripWithStops, home: string | null | undefined) => home ?? trip.stops[0]?.country_code

/** La primera parada del viaje en ese país, si no es el de casa. */
export function arrivalStop(trip: TripWithStops, country: string, home: string | null | undefined): Stop | undefined {
  return country === homeOf(trip, home) ? undefined : trip.stops.find((s) => s.country_code === country)
}

/** ¿Tiene el viaje algún país que no sea el de casa? */
export const hasArrivals = (trip: TripWithStops, home: string | null | undefined) => trip.stops.some((s) => s.country_code !== homeOf(trip, home))

const seenKey = (userId: string) => `roam-arrivals:${userId}`

function seen(userId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) ?? '[]') as string[]
  } catch {
    return []
  }
}

export const arrivalSeen = (userId: string, tripId: string, country: string) => seen(userId).includes(`${tripId}:${country}`)

export function markArrivalSeen(userId: string, tripId: string, country: string) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...seen(userId), `${tripId}:${country}`].slice(-200)))
  } catch {
    // Sin almacenamiento, volvería a salir la próxima vez: no pasa nada.
  }
}
