import type { LegDetail, Lodging, TripWithStops } from './db'

export interface CalendarTrip {
  trip: Pick<TripWithStops, 'id' | 'title' | 'description' | 'start_date' | 'end_date' | 'stops' | 'sights'>
  lodgings: Lodging[]
  legs: LegDetail[]
}

/** Calendario de uno o varios viajes. `refresh`: duración ISO 8601 (PT6H) para las suscripciones. */
export function buildCalendar(opts: { name: string; trips: CalendarTrip[]; origin: string; refresh?: string }): { ics: string; count: number }
/** Calendario de un viaje (botón «Añadir al calendario»). */
export function tripCalendar(trip: CalendarTrip['trip'], lodgings: Lodging[], legs: LegDetail[], origin?: string): { ics: string; count: number }
/** Abre (iPhone) o descarga (resto) el archivo .ics. */
export function openCalendarFile(ics: string, title: string): void
