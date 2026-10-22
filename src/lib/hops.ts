// Trayectos entre los sitios de un día: cuánto se tarda andando de uno al siguiente (y, si es mucho, en
// transporte), el total del día y si las horas apuntadas dan para llegar.
// Primero una estimación al momento (y sin conexión): la distancia en línea recta × 1,3 (las calles no van rectas)
// a 4,5 km/h. Si hay red, se cambia por la ruta a pie real de OpenStreetMap (routing.openstreetmap.de, de FOSSGIS:
// gratis, sin clave; una petición por día del plan, que se guarda).
import { isNote, type Sight } from './db'
import { haversine } from './geo'

type Point = Pick<Sight, 'id' | 'name' | 'lat' | 'lon' | 'time' | 'kind'>
type Located = Point & { lat: number; lon: number }

export interface Leg {
  /** Metros y segundos andando. */
  m: number
  s: number
}

export interface Hop<T extends Point = Point> {
  from: T
  to: T
  km: number
  walkMin: number
  /** Si andando son más de 30 min: minutos aproximados en metro, autobús o taxi. */
  transitMin: number | null
  /** Ruta a pie real (OpenStreetMap); si no, estimación. */
  routed: boolean
  /** Las horas apuntadas no dan para el trayecto: minutos que hay entre una y otra. */
  tight: number | null
}

const WALK_KMH = 4.5
const DETOUR = 1.3
const LONG_WALK = 30
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5)
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const located = (s: Point): s is Located => s.lat != null && s.lon != null

/** Estimación andando sin ruta: línea recta × 1,3 a 4,5 km/h. */
export function estimateLeg(a: Located, b: Located): Leg {
  const km = haversine([a.lon, a.lat], [b.lon, b.lat]) * DETOUR
  return { m: km * 1000, s: (km / WALK_KMH) * 3600 }
}

/**
 * Los tramos del día: entre cada sitio y el siguiente (las notas no cuentan). Si a un sitio le falta la
 * ubicación (escrito a mano), no se sabe dónde está y no hay tramo ni hacia él ni desde él.
 * `routed`: los tramos de la ruta real, en el mismo orden que `dayPoints`.
 */
export function dayHops<T extends Point>(sights: T[], routed?: Leg[] | null): Hop<T>[] {
  const places = sights.filter((s) => !isNote(s))
  const hops: Hop<T>[] = []
  let k = 0 // índice del tramo dentro de la ruta real (solo cuenta los sitios con ubicación seguidos)
  for (let i = 0; i + 1 < places.length; i++) {
    const a = places[i]
    const b = places[i + 1]
    if (!located(a) || !located(b)) continue
    const real = routed?.[k++]
    const leg = real ?? estimateLeg(a, b)
    const km = leg.m / 1000
    const walkMin = Math.max(1, Math.round(leg.s / 60))
    // Transporte: unos 12 min de esperar y llegar a la parada + el trayecto a ~18 km/h de media por la ciudad.
    const transitMin = walkMin > LONG_WALK ? round5(12 + (km / 18) * 60) : null
    const need = transitMin != null ? Math.min(walkMin, transitMin) : walkMin
    const gap = a.time && b.time ? toMin(b.time) - toMin(a.time) : null
    hops.push({ from: a, to: b, km, walkMin, transitMin, routed: !!real, tight: gap != null && gap >= 0 && gap < need ? gap : null })
  }
  return hops
}

/** Los puntos que se piden a la ruta real: pares de sitios con ubicación seguidos (en el orden de dayHops). */
export function dayPoints(sights: Point[]): [Located, Located][] {
  const places = sights.filter((s) => !isNote(s))
  const pairs: [Located, Located][] = []
  for (let i = 0; i + 1 < places.length; i++) {
    const a = places[i]
    const b = places[i + 1]
    if (located(a) && located(b)) pairs.push([a, b])
  }
  return pairs
}

/** Total del día andando (sin contar los tramos largos, que se harían en transporte). */
export function dayTotals(hops: Hop[]) {
  let km = 0
  let walk = 0
  let ride = 0
  for (const h of hops) {
    if (h.transitMin != null) ride += h.transitMin
    else {
      km += h.km
      walk += h.walkMin
    }
  }
  return { km, walkMin: walk, transitMin: ride, minutes: walk + ride }
}

export const distance = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1).replace('.', ',')} km`)
export const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`)

const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
const MAX_PAIRS = 24

/**
 * Ruta a pie real de cada tramo. Los tramos seguidos (b de uno = a del siguiente) van en una sola petición; si
 * hay huecos (un sitio sin ubicación), se piden por separado. Devuelve un tramo por par, o lanza si falla.
 */
export async function routeLegs(pairs: [Located, Located][], signal?: AbortSignal): Promise<Leg[]> {
  const chains: Located[][] = []
  for (const [a, b] of pairs.slice(0, MAX_PAIRS)) {
    const last = chains.at(-1)
    if (last && last.at(-1)!.id === a.id) last.push(b)
    else chains.push([a, b])
  }
  const out: Leg[] = []
  for (const chain of chains) {
    const coords = chain.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
    const res = await fetch(`${ROUTER}/${coords}?overview=false&steps=false`, { signal })
    if (!res.ok) throw new Error(`Rutas ${res.status}`)
    const data = (await res.json()) as { code: string; routes?: { legs: { distance: number; duration: number }[] }[] }
    const legs = data.routes?.[0]?.legs
    if (data.code !== 'Ok' || !legs || legs.length !== chain.length - 1) throw new Error('Ruta no válida')
    // Si la ruta da un rodeo absurdo (un sitio mal situado, un puente cortado), mejor la estimación.
    legs.forEach((l, i) => {
      const est = estimateLeg(chain[i], chain[i + 1])
      out.push(l.distance > est.m * 3 + 500 ? est : { m: l.distance, s: Math.max(l.duration, (l.distance / 1000 / 5.5) * 3600) })
    })
  }
  return out
}
