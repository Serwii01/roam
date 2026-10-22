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

// ── Orden de los sitios de un día ──
// El orden lo decide el usuario (posición), con las horas siempre en orden: al arrastrar, las horas se quedan en
// su sitio y se recolocan las actividades; al poner una hora, el sitio se coloca en su lugar. Las notas y los
// sitios sin hora pueden ir en cualquier punto, también entre dos con hora.

type Ordered = Pick<Sight, 'id' | 'position' | 'time' | 'created_at'>
export type DayPatch = { id: string; position?: number; time?: string | null }
type Patch = DayPatch
const hm = (t?: string | null) => (t ? t.slice(0, 5) : null)

/**
 * Orden en que se enseñan los sitios de un día: por posición, salvo que eso deje las horas desordenadas (planes
 * de antes de poder arrastrar, que se ordenaban por hora): entonces, por hora y después por posición, como antes.
 */
export function orderDay<T extends Ordered>(list: T[]): T[] {
  const byPos = [...list].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  const times = byPos.map((s) => hm(s.time)).filter((t): t is string => !!t)
  if (times.every((t, i) => i === 0 || times[i - 1] <= t)) return byPos
  return [...list].sort((a, b) => (hm(a.time) ?? '99:99').localeCompare(hm(b.time) ?? '99:99') || a.position - b.position)
}

/** Cambios para que el orden pase a ser `next`: posiciones 0, 1, 2… y las horas existentes repartidas en orden. */
function patchesFor<T extends Ordered>(next: T[], timeOverride?: { id: string; time: string | null }): Patch[] {
  const time = (s: T) => (timeOverride?.id === s.id ? timeOverride.time : hm(s.time))
  const sorted = next.map(time).filter((t): t is string => !!t).sort()
  let k = 0
  const out: Patch[] = []
  next.forEach((s, i) => {
    const p: Patch = { id: s.id }
    if (s.position !== i) p.position = i
    const t = time(s)
    if (t) {
      const want = sorted[k++]
      if (want !== hm(s.time)) p.time = want
    }
    if (p.position !== undefined || p.time !== undefined) out.push(p)
  })
  return out
}

/** Arrastrar el sitio de `from` a `to` (en el orden que se ve). */
export function reorderDay<T extends Ordered>(sights: T[], from: number, to: number): Patch[] {
  if (from === to) return []
  const next = [...sights]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return patchesFor(next)
}

/** Poner (o quitar) la hora de un sitio: con hora, se coloca entre los demás según esa hora. */
export function setDayTime<T extends Ordered>(sights: T[], id: string, time: string | null): Patch[] {
  const me = sights.find((s) => s.id === id)
  if (!me) return []
  if (!time) return [{ id, time: null }]
  const rest = sights.filter((s) => s.id !== id)
  let at = rest.findIndex((s) => hm(s.time) && hm(s.time)! > time)
  if (at < 0) {
    // Sin ninguna más tarde: justo después de la última con hora (o donde estaba, si no hay ninguna).
    const lastTimed = rest.map((s) => !!hm(s.time)).lastIndexOf(true)
    at = lastTimed >= 0 ? Math.max(lastTimed + 1, Math.min(sights.indexOf(me), rest.length)) : sights.indexOf(me)
  }
  const next = [...rest]
  next.splice(at, 0, me)
  const patches = patchesFor(next, { id, time })
  const mine = patches.find((p) => p.id === id)
  if (mine) mine.time = time
  else patches.push({ id, time })
  return patches
}
