// Recuerdos: el día que se cumplen años de una llegada. La misma regla que due_notifications() en Supabase:
// viajes realizados, sin la ciudad de salida ni la vuelta a casa, y primero las paradas con fotos y las más antiguas.
import type { Photo, Stop, TripWithStops } from './db'
import { isDone } from './stats'

export interface Memory {
  trip: TripWithStops
  stop: Stop
  years: number
  photo: Photo | null
}

const nearOrigin = (a: Stop, b: Stop) => Math.abs(a.lat - b.lat) < 0.3 && Math.abs(a.lon - b.lon) < 0.3

export function memoryOfDay(trips: TripWithStops[], day: string): Memory | null {
  const found: Memory[] = []
  for (const trip of trips.filter(isDone)) {
    trip.stops.forEach((stop, i) => {
      const on = stop.arrived_on
      if (i === 0 || !on || on >= day || on.slice(5, 10) !== day.slice(5, 10) || nearOrigin(stop, trip.stops[0])) return
      found.push({ trip, stop, years: Number(day.slice(0, 4)) - Number(on.slice(0, 4)), photo: trip.photos.find((p) => p.stop_id === stop.id) ?? null })
    })
  }
  return found.sort((a, b) => Number(!!b.photo) - Number(!!a.photo) || b.years - a.years)[0] ?? null
}

export const yearsAgo = (years: number) => (years === 1 ? 'Hace un año' : `Hace ${years} años`)
