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

/** Hasta aquí de una parada del viaje se cuenta como estar en ella (Estambul, Reikiavik o Fiyi caen fuera de las siluetas). */
const NEAR_STOP_KM = 100

/** En qué país del viaje estás: el de las siluetas o, si no da ninguno, el de la parada más cercana. */
export function arrivalCountry(shapes: Shapes, trip: TripWithStops, lon: number, lat: number): string | null {
  const found = countryAt(shapes, lon, lat)
  if (found) return found
  const near = trip.stops.map((s) => ({ s, km: haversine([lon, lat], [s.lon, s.lat]) })).sort((a, b) => a.km - b.km)[0]
  return near && near.km <= NEAR_STOP_KM ? near.s.country_code : null
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
