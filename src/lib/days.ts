// Días de un viaje y en qué parada se está cada día, para el plan «día a día».
import type { Sight, Stop, TripWithStops } from './db'
import { haversine } from './geo'

const DAY = 86_400_000
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
export const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' })

/** ¿La parada `i` es la vuelta a casa (la última y en el mismo sitio que la salida)? */
export function isReturnHome(stops: Stop[], i: number) {
  if (i === 0 || i !== stops.length - 1) return false
  return haversine([stops[0].lon, stops[0].lat], [stops[i].lon, stops[i].lat]) < 30
}

const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/**
 * Fechas tras reordenar: los días se quedan en su sitio y las ciudades cambian de orden (las fechas de las
 * paradas con fecha se reparten en orden por las nuevas posiciones). La vuelta a casa va el último día.
 * Devuelve solo los cambios.
 */
export function datesAfterMove(stops: Stop[], end: string | null): Map<string, string | null> {
  const dated = stops.map((s, i) => ({ s, i })).filter(({ s }) => s.arrived_on)
  const sorted = dated.map(({ s }) => s.arrived_on!).sort()
  const out = new Map<string, string | null>()
  dated.forEach(({ s }, k) => sorted[k] !== s.arrived_on && out.set(s.id, sorted[k]))
  const last = stops.length - 1
  if (end && isReturnHome(stops, last) && (out.get(stops[last].id) ?? stops[last].arrived_on) !== end) out.set(stops[last].id, end)
  return out
}

/**
 * Fechas tras cambiar el día de llegada a la parada `i`: las siguientes se mueven los mismos días para
 * conservar cuánto se está en cada sitio (sin pasar del último día del viaje) y las anteriores no pueden
 * quedar después. La vuelta a casa se queda en el último día. Devuelve solo los cambios (incluida `i`).
 */
export function datesAfterEdit(stops: Stop[], i: number, date: string | null, end: string | null): Map<string, string | null> {
  const out = new Map<string, string | null>([[stops[i].id, date]])
  if (!date) return out
  const old = stops[i].arrived_on
  const delta = old ? diffDays(old, date) : 0
  const clamp = (d: string) => (end && d > end ? end : d)
  for (let j = i + 1; j < stops.length; j++) {
    const s = stops[j]
    let d: string | null = s.arrived_on
    if (end && isReturnHome(stops, j)) d = end
    else if (d && delta) d = clamp(addDays(d, delta))
    if (d && d < date) d = date
    if (d !== s.arrived_on) out.set(s.id, d)
  }
  for (let j = 0; j < i; j++) {
    const s = stops[j]
    if (s.arrived_on && s.arrived_on > date) out.set(s.id, date)
  }
  return out
}

/** Días del viaje: de la ida a la vuelta o, si no hay fechas, de la primera a la última fecha de parada (máx. 60). */
export function tripDays(t: TripWithStops): string[] {
  const dates = t.stops.map((s) => s.arrived_on).filter((d): d is string => !!d).sort()
  const start = t.start_date ?? dates[0]
  const end = t.end_date ?? dates.at(-1) ?? start
  if (!start) return []
  const n = Math.min(60, Math.max(1, Math.round((Date.parse(end!) - Date.parse(start)) / DAY) + 1))
  return Array.from({ length: n }, (_, i) => addDays(start, i))
}

export interface DayInfo {
  day: string
  /** Parada en la que se está ese día (a la que se llegó ese día o antes). */
  stop: Stop | undefined
  /** Día de salida desde casa o de vuelta: se muestra como día de viaje. */
  travel: 'out' | 'back' | null
  /** Siguiente destino (en el día de salida). */
  next?: Stop
}

export function dayInfo(stops: Stop[], day: string): DayInfo {
  const idx = stops.map((s, i) => ({ s, i })).filter(({ s }) => s.arrived_on && s.arrived_on <= day).at(-1)?.i ?? 0
  const stop = stops[idx]
  if (!stop) return { day, stop: undefined, travel: null }
  if (isReturnHome(stops, idx)) return { day, stop, travel: 'back' }
  // Día de salida: se está en casa (la primera parada) y el viaje sigue a otra.
  if (idx === 0 && stops.length > 1) return { day, stop, travel: 'out', next: stops[1] }
  return { day, stop, travel: null }
}

/** Día al que pertenece un sitio: el suyo, o el de llegada a su parada (dentro del viaje). */
export function sightDay(s: Sight, stops: Stop[], days: string[]): string | undefined {
  if (s.day) return s.day
  const arrived = stops.find((x) => x.id === s.stop_id)?.arrived_on
  if (arrived && days.includes(arrived)) return arrived
  return arrived && days.length && arrived < days[0] ? days[0] : (arrived ?? days[0])
}
