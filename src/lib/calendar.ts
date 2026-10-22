// Exporta un viaje a un archivo de calendario (.ics, iCalendar RFC 5545): Calendario de iPhone, Google Calendar,
// Outlook… Las horas van «flotantes» (sin zona horaria): un vuelo a las 10:30 sale a las 10:30 en el calendario,
// que es la hora local que pone el billete, estés donde estés.
import { addDays, dayInfo, sightDay, tripDays } from './days'
import type { LegDetail, Lodging, Stop, TransportMode, TripWithStops } from './db'

const LEG_NAME: Record<TransportMode, string> = { plane: 'Vuelo', train: 'Tren', bus: 'Autobús', boat: 'Barco', car: 'Coche', bike: 'Bici', walk: 'A pie' }
/** Tramos que van al calendario aunque no tengan hora (los de coche, bici o a pie solo si la tienen). */
const BOOKED: TransportMode[] = ['plane', 'train', 'bus', 'boat']

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const date = (d: string) => d.replaceAll('-', '')
const time = (d: string, t: string) => `${date(d)}T${t.slice(0, 5).replace(':', '')}00`
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')

/** Las líneas de más de 75 bytes se parten (cada trozo siguiente empieza con un espacio). */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

interface CalEvent {
  uid: string
  summary: string
  /** Todo el día: [primer día, último día] (incluidos). Con hora: [inicio, fin] como 'YYYY-MM-DDTHH:MM'. */
  allDay?: [string, string]
  timed?: [string, string]
  location?: string | null
  geo?: [number, number]
  description?: (string | null | false | undefined)[]
  url?: string
  /** Aviso antes de empezar, en minutos. */
  alarm?: number
}

function vevent(e: CalEvent, now: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@roam`, `DTSTAMP:${now}`]
  if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${date(e.allDay[0])}`, `DTEND;VALUE=DATE:${date(addDays(e.allDay[1], 1))}`)
  if (e.timed) {
    const [a, b] = e.timed.map((x) => x.split('T') as [string, string])
    lines.push(`DTSTART:${time(...a)}`, `DTEND:${time(...b)}`)
  }
  lines.push(`SUMMARY:${escape(e.summary)}`)
  if (e.location) lines.push(`LOCATION:${escape(e.location)}`)
  if (e.geo) lines.push(`GEO:${e.geo[0].toFixed(5)};${e.geo[1].toFixed(5)}`)
  const desc = (e.description ?? []).filter((x): x is string => !!x)
  if (e.url) desc.push(e.url)
  if (desc.length) lines.push(`DESCRIPTION:${escape(desc.join('\n'))}`)
  if (e.url) lines.push(`URL:${e.url}`)
  if (e.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.summary)}`, `TRIGGER:-PT${e.alarm}M`, 'END:VALARM')
  lines.push('END:VEVENT')
  return lines
}

/** Suma minutos a 'YYYY-MM-DDTHH:MM' (sin zona horaria). */
function plusMinutes(at: string, min: number): string {
  const d = new Date(Date.parse(`${at}:00Z`) + min * 60_000)
  return d.toISOString().slice(0, 16)
}

function legEvents(t: TripWithStops, legs: LegDetail[], url: string): CalEvent[] {
  return t.stops.flatMap((s, i): CalEvent[] => {
    if (i === 0 || !s.transport_in) return []
    const prev = t.stops[i - 1]
    const d = legs.find((l) => l.stop_id === s.id)
    const day = d?.depart_on ?? s.arrived_on
    if (!day || (!BOOKED.includes(s.transport_in) && !d?.depart_time)) return []
    const plane = s.transport_in === 'plane'
    const route = plane && s.from_airport && s.to_airport ? `${prev.name} (${s.from_airport}) → ${s.name} (${s.to_airport})` : `${prev.name} → ${s.name}`
    const event: CalEvent = {
      uid: `leg-${s.id}`,
      summary: `${LEG_NAME[s.transport_in]}${s.flight_no ? ` ${s.flight_no}` : ''} · ${route}`,
      location: plane && s.from_airport ? `Aeropuerto ${s.from_airport}` : prev.name,
      description: [
        t.title,
        d?.carrier && `Compañía: ${d.carrier}`,
        d?.booking_ref && `Reserva: ${d.booking_ref}`,
        d?.notes,
      ],
      url,
    }
    if (!d?.depart_time) return [{ ...event, allDay: [day, day] }]
    const start = `${day}T${d.depart_time.slice(0, 5)}`
    let end = plusMinutes(start, plane ? 120 : 60)
    if (d.arrive_time) {
      // Llegada otro día (vuelo nocturno) o a una hora «anterior» que en realidad es del día siguiente.
      let arriveDay = s.arrived_on && s.arrived_on > day ? s.arrived_on : day
      if (arriveDay === day && d.arrive_time.slice(0, 5) < d.depart_time.slice(0, 5)) arriveDay = addDays(day, 1)
      end = `${arriveDay}T${d.arrive_time.slice(0, 5)}`
    }
    return [{ ...event, timed: [start, end], alarm: plane ? 180 : 60 }]
  })
}

function lodgingEvents(t: TripWithStops, lodgings: Lodging[], url: string): CalEvent[] {
  return lodgings.flatMap((l): CalEvent[] => {
    const i = t.stops.findIndex((s) => s.id === l.stop_id)
    const from = l.check_in ?? (i >= 0 ? t.stops[i].arrived_on : t.start_date)
    // Sin fecha de salida: el día que se llega a la siguiente parada (o el final del viaje).
    const to = l.check_out ?? (i >= 0 ? t.stops[i + 1]?.arrived_on : null) ?? t.end_date
    if (!from) return []
    const lastNight = to && to > from ? addDays(to, -1) : from
    const base = {
      location: l.address ?? l.name,
      description: [
        t.title,
        l.check_in_time && `Entrada: ${l.check_in_time.slice(0, 5)}`,
        l.check_out_time && `Salida: ${l.check_out_time.slice(0, 5)}`,
        l.booking_ref && `Reserva: ${l.booking_ref}`,
        l.url,
        l.notes,
      ],
      url,
    }
    const out: CalEvent[] = [{ ...base, uid: `lod-${l.id}`, summary: `Alojamiento · ${l.name}`, allDay: [from, lastNight] }]
    if (l.check_in_time) out.push({ ...base, uid: `lod-in-${l.id}`, summary: `Entrada · ${l.name}`, timed: [`${from}T${l.check_in_time.slice(0, 5)}`, plusMinutes(`${from}T${l.check_in_time.slice(0, 5)}`, 30)] })
    if (l.check_out_time && to) out.push({ ...base, uid: `lod-out-${l.id}`, summary: `Salida · ${l.name}`, timed: [`${to}T${l.check_out_time.slice(0, 5)}`, plusMinutes(`${to}T${l.check_out_time.slice(0, 5)}`, 30)], alarm: 60 })
    return out
  })
}

/** Plan día a día: los sitios con hora van a su hora; los demás, juntos en un evento de todo el día. */
function planEvents(t: TripWithStops, url: string): CalEvent[] {
  const days = tripDays(t)
  const untimed = new Map<string, string[]>()
  const out: CalEvent[] = []
  for (const s of t.sights) {
    const day = sightDay(s, t.stops, days)
    if (!day) continue
    const stop = t.stops.find((x) => x.id === s.stop_id)
    if (s.time) {
      const start = `${day}T${s.time.slice(0, 5)}`
      out.push({
        uid: `sight-${s.id}`,
        summary: s.name,
        timed: [start, plusMinutes(start, 60)],
        location: stop ? `${s.name}, ${stop.name}` : s.name,
        geo: s.lat != null && s.lon != null ? [s.lat, s.lon] : undefined,
        description: [t.title, s.notes, s.wiki_url],
        url,
      })
    } else untimed.set(day, [...(untimed.get(day) ?? []), s.name])
  }
  for (const [day, names] of untimed) {
    const n = days.indexOf(day) + 1
    const stop = dayInfo(t.stops, day).stop
    out.push({
      uid: `day-${t.id}-${day}`,
      summary: `${n > 0 ? `Día ${n}` : 'Plan'}${stop ? ` · ${stop.name}` : ''}: ${names.join(', ')}`,
      allDay: [day, day],
      location: stop?.name,
      description: [t.title, ...names.map((x) => `• ${x}`)],
      url,
    })
  }
  return out
}

/** Calendario del viaje: el viaje entero, los trayectos, los alojamientos y el plan de cada día. */
export function tripCalendar(t: TripWithStops, lodgings: Lodging[], legs: LegDetail[], origin = location.origin): { ics: string; count: number } {
  const url = `${origin}/app/viajes/${t.id}`
  const route = t.stops.map((s: Stop) => s.name).join(' → ')
  const events: CalEvent[] = [
    ...(t.start_date
      ? [{ uid: `trip-${t.id}`, summary: `Viaje · ${t.title}`, allDay: [t.start_date, t.end_date ?? t.start_date] as [string, string], description: [route, t.description], url }]
      : []),
    ...legEvents(t, legs, url),
    ...lodgingEvents(t, lodgings, url),
    ...planEvents(t, url),
  ]
  const now = stamp()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ROAM//Kinetic Travel Tracker//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(t.title)}`,
    ...events.flatMap((e) => vevent(e, now)),
    'END:VCALENDAR',
  ]
  return { ics: lines.map(fold).join('\r\n') + '\r\n', count: events.length }
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'viaje'

/**
 * Entrega el .ics. En iPhone/iPad se abre directamente (Safari enseña «Añadir todo» al Calendario); en el resto
 * se descarga el archivo, que se abre con la app de calendario o se importa en Google Calendar.
 */
export function openCalendarFile(ics: string, title: string) {
  const file = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(file)
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  if (ios) location.assign(href)
  else {
    const a = document.createElement('a')
    a.href = href
    a.download = `${slug(title)}.ics`
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}
