// Pantalla «Hoy»: qué viaje está en marcha, qué toca ahora y qué viene después. Todo con la fecha y la hora del
// móvil (cuando se viaja, el móvil ya está en la hora del destino).
import type { DayLogistic } from './arrival'
import { isNote, type Lodging, type Sight, type Stop, type TripWithStops } from './db'
import { tripDays } from './days'

const pad = (n: number) => String(n).padStart(2, '0')
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const DAY = 86_400_000
export const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY)

/** El viaje que está en marcha ese día (entre la ida y la vuelta), con el número de día. Si hay varios, el último en empezar. */
export function activeTrip(trips: TripWithStops[], day: string): { trip: TripWithStops; days: string[]; index: number } | null {
  let best: { trip: TripWithStops; days: string[]; index: number } | null = null
  for (const trip of trips) {
    const days = tripDays(trip)
    const index = days.indexOf(day)
    if (index >= 0 && (!best || days[0] > best.days[0])) best = { trip, days, index }
  }
  return best
}

/** El próximo viaje (el que empieza antes, después de ese día). */
export function nextTrip(trips: TripWithStops[], day: string): { trip: TripWithStops; inDays: number } | null {
  const next = trips.filter((t) => t.start_date && t.start_date > day).sort((a, b) => a.start_date!.localeCompare(b.start_date!))[0]
  return next ? { trip: next, inDays: daysUntil(day, next.start_date!) } : null
}

export type TimelineItem = { kind: 'logistic'; time: string | null; item: DayLogistic } | { kind: 'sight'; time: string | null; item: Sight }

/**
 * El día en orden: los sitios en el orden del plan y los horarios de transporte y alojamiento metidos donde tocan
 * por la hora (antes del primer sitio con una hora posterior). Los sitios sin hora del principio van después de
 * llegar (el día que se llega a una ciudad, se visita después). Los horarios sin hora, al final.
 */
export function timeline(sights: Sight[], logistics: DayLogistic[]): TimelineItem[] {
  const timed = logistics.filter((l) => l.time).sort((a, b) => a.time!.localeCompare(b.time!))
  const out: TimelineItem[] = []
  const flush = (until: (l: DayLogistic) => boolean) => {
    while (timed.length && until(timed[0])) out.push({ kind: 'logistic', time: timed[0].time, item: timed.shift()! })
  }
  const lastArrival = timed.findLastIndex((l) => l.arrival)
  sights.forEach((s, i) => {
    const t = s.time?.slice(0, 5) ?? null
    if (i === 0 && !t && lastArrival >= 0) {
      const until = timed[lastArrival].time!
      flush((l) => l.time! <= until)
    }
    if (t) flush((l) => l.time! < t)
    out.push({ kind: 'sight', time: t, item: s })
  })
  for (const l of timed) out.push({ kind: 'logistic', time: l.time, item: l })
  for (const l of logistics.filter((x) => !x.time)) out.push({ kind: 'logistic', time: null, item: l })
  return out
}

/**
 * Lo siguiente que toca: el primer sitio sin marcar como visto o, si antes hay un horario (un vuelo, una
 * entrada) que aún no ha pasado, ese horario. Devuelve su posición en `items`, o -1 si ya no queda nada.
 */
export function nextUp(items: TimelineItem[], now: string): number {
  return items.findIndex((x) => (x.kind === 'logistic' ? !!x.time && x.time >= now : !isNote(x.item) && !x.item.done))
}

/** Dónde se duerme esa noche: el alojamiento con entrada ese día o antes y salida después (el de la parada, si hay). */
export function lodgingTonight(lodgings: Lodging[], stop: Stop | undefined, day: string): Lodging | undefined {
  const tonight = lodgings.filter((l) => l.check_in && l.check_in <= day && (!l.check_out || l.check_out > day))
  return tonight.find((l) => l.stop_id === stop?.id) ?? tonight.find((l) => !l.stop_id) ?? tonight[0]
}
