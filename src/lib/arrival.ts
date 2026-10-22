// Logística de cada día del plan: salidas y llegadas de los trayectos, entradas y salidas de los alojamientos
// y, el día que se llega a un sitio, a qué hora más o menos se está en el alojamiento (llegada del vuelo o tren
// + salir del aeropuerto o la estación + el trayecto hasta la ciudad).
import { addDays } from './days'
import type { LegDetail, Lodging, Stop, TransportMode, TripWithStops } from './db'
import { haversine } from './geo'
import type { AirportMap } from './stats'

export interface DayLogistic {
  /** 'HH:MM', o null si no se sabe la hora. */
  time: string | null
  icon: string
  title: string
  detail?: string
  /** Hora estimada (no apuntada): se enseña con «≈». */
  estimated?: boolean
}

const LEG: Record<TransportMode, string> = { plane: 'vuelo', train: 'tren', bus: 'autobús', boat: 'barco', car: 'coche', bike: 'bici', walk: 'a pie' }
const ICON_OUT: Record<TransportMode, string> = { plane: 'flight_takeoff', train: 'train', bus: 'directions_bus', boat: 'directions_boat', car: 'directions_car', bike: 'pedal_bike', walk: 'hiking' }
// Escrito como `icon: '…'` para que scripts/icons.mjs incluya el icono en la fuente recortada.
const LANDING = { icon: 'flight_land' } as const
const ICON_IN: Record<TransportMode, string> = { ...ICON_OUT, plane: LANDING.icon }

const hhmm = (t: string) => t.slice(0, 5)
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const round5 = (m: number) => Math.round(m / 5) * 5
export const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`)

/**
 * Minutos desde que llega el vuelo o el tren hasta estar en el alojamiento (estimación):
 *  · avión: ~40 min para salir (desembarcar, maletas) + el trayecto del aeropuerto a la ciudad a ~40 km/h de media.
 *  · tren, autobús o barco: ~10-15 min para salir + ~20 min por la ciudad.
 *  · coche, bici o a pie: se llega a la puerta (10 min para aparcar o entrar).
 */
export function transferMinutes(stop: Stop, airports: AirportMap): { minutes: number; how: string } {
  const mode = stop.transport_in ?? 'car'
  if (mode === 'plane') {
    const a = stop.to_airport ? airports.get(stop.to_airport) : undefined
    const km = a ? haversine([a.lon, a.lat], [stop.lon, stop.lat]) : 25
    const drive = km < 5 ? 15 : Math.min(120, round5((km / 40) * 60) + 10)
    return { minutes: 40 + drive, how: `salir del aeropuerto y ${Math.round(km)} km hasta ${stop.name}` }
  }
  if (mode === 'train' || mode === 'bus') return { minutes: 30, how: 'salir de la estación y llegar al alojamiento' }
  if (mode === 'boat') return { minutes: 35, how: 'desembarcar y llegar al alojamiento' }
  return { minutes: 10, how: 'aparcar y entrar' }
}

/** Alojamiento en el que se entra al llegar a la parada `i` (el suyo o, en el primer destino, el de todo el viaje). */
function lodgingFor(t: TripWithStops, lodgings: Lodging[], i: number, day: string): Lodging | undefined {
  const stop = t.stops[i]
  return (
    lodgings.find((l) => l.stop_id === stop.id && (!l.check_in || l.check_in === day)) ??
    lodgings.find((l) => !l.stop_id && l.check_in === day)
  )
}

export function dayLogistics(t: TripWithStops, lodgings: Lodging[], legs: LegDetail[], airports: AirportMap): Map<string, DayLogistic[]> {
  const out = new Map<string, DayLogistic[]>()
  const push = (day: string | null | undefined, item: DayLogistic) => day && out.set(day, [...(out.get(day) ?? []), item])
  const arrivals = new Set<string>() // alojamientos con su llegada estimada (no se repite la «entrada»)

  t.stops.forEach((s, i) => {
    if (i === 0 || !s.transport_in) return
    const prev = t.stops[i - 1]
    const d = legs.find((l) => l.stop_id === s.id)
    const mode = s.transport_in
    const departDay = d?.depart_on ?? s.arrived_on
    const plane = mode === 'plane'
    const what = [s.flight_no, d?.carrier].filter(Boolean).join(' · ')
    if (d?.depart_time)
      push(departDay, { time: hhmm(d.depart_time), icon: ICON_OUT[mode], title: `Sale el ${LEG[mode]} a ${s.name}`, detail: [plane && s.from_airport ? `desde ${s.from_airport}` : `desde ${prev.name}`, what].filter(Boolean).join(' · ') })

    // Día y hora de llegada: un vuelo nocturno llega al día siguiente.
    let arriveDay = s.arrived_on ?? departDay
    if (d?.arrive_time && d.depart_time && arriveDay === departDay && hhmm(d.arrive_time) < hhmm(d.depart_time)) arriveDay = departDay ? addDays(departDay, 1) : arriveDay
    if (d?.arrive_time) push(arriveDay, { time: hhmm(d.arrive_time), icon: ICON_IN[mode], title: `Llegada a ${s.name}`, detail: [plane && s.to_airport ? `aeropuerto ${s.to_airport}` : null, !d.depart_time ? what : null].filter(Boolean).join(' · ') || undefined })

    const lod = arriveDay ? lodgingFor(t, lodgings, i, arriveDay) : undefined
    if (lod && d?.arrive_time && arriveDay) {
      const { minutes, how } = transferMinutes(s, airports)
      const at = toMin(hhmm(d.arrive_time)) + minutes
      const early = lod.check_in_time && at < toMin(hhmm(lod.check_in_time))
      arrivals.add(lod.id)
      push(at >= 24 * 60 ? addDays(arriveDay, 1) : arriveDay, {
        time: fromMin(at),
        estimated: true,
        icon: 'hotel',
        title: `Llegas a ${lod.name}`,
        detail: [
          `${duration(minutes)} para ${how}`,
          lod.check_in_time && (early ? `la entrada es desde las ${hhmm(lod.check_in_time)}: puedes dejar las maletas` : `entrada desde las ${hhmm(lod.check_in_time)}`),
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }
  })

  for (const l of lodgings) {
    if (l.check_in && !arrivals.has(l.id))
      push(l.check_in, { time: l.check_in_time ? hhmm(l.check_in_time) : null, icon: 'hotel', title: `Entrada en ${l.name}`, detail: l.address ?? undefined })
    if (l.check_out) push(l.check_out, { time: l.check_out_time ? hhmm(l.check_out_time) : null, icon: 'logout', title: `Salida de ${l.name}`, detail: l.check_out_time ? `hasta las ${hhmm(l.check_out_time)}` : undefined })
  }

  for (const list of out.values()) list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  return out
}
