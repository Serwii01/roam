// Calendario de los viajes (.ics, iCalendar RFC 5545): Calendario de iPhone, Google Calendar, Outlook…
// En JavaScript (con tipos en calendar.d.ts) porque lo usan la app y la función de Vercel /cal/<token>.ics,
// y las funciones de Vercel van en JavaScript para que no tenga que compilarlas.
// Las horas van «flotantes» (sin zona horaria): un vuelo a las 10:30 sale a las 10:30 en el calendario,
// que es la hora local que pone el billete, estés donde estés.

const DAY = 86_400_000
const LEG_NAME = { plane: 'Vuelo', train: 'Tren', bus: 'Autobús', boat: 'Barco', car: 'Coche', bike: 'Bici', walk: 'A pie' }
/** Tramos que van al calendario aunque no tengan hora (los de coche, bici o a pie solo si la tienen). */
const BOOKED = ['plane', 'train', 'bus', 'boat']

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const escape = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const date = (d) => d.replaceAll('-', '')
const hhmm = (t) => t.slice(0, 5)
/** 'YYYY-MM-DDTHH:MM' → 'YYYYMMDDTHHMM00' */
const time = (at) => `${date(at.slice(0, 10))}T${at.slice(11, 13)}${at.slice(14, 16)}00`
/** Suma minutos a 'YYYY-MM-DDTHH:MM' (sin zona horaria). */
const plusMinutes = (at, min) => new Date(Date.parse(`${at}:00Z`) + min * 60_000).toISOString().slice(0, 16)
const bytes = new TextEncoder()

/** Las líneas de más de 75 bytes se parten (cada trozo siguiente empieza con un espacio). */
function fold(line) {
  const out = []
  let cur = ''
  let n = 0
  for (const ch of line) {
    const b = bytes.encode(ch).length
    if (n + b > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      n = 0
    }
    cur += ch
    n += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

// ── Días del viaje (lo mismo que src/lib/days.ts, que la función de Vercel no puede importar) ──

function tripDays(t) {
  const dates = t.stops.map((s) => s.arrived_on).filter(Boolean).sort()
  const start = t.start_date ?? dates[0]
  const end = t.end_date ?? dates.at(-1) ?? start
  if (!start) return []
  const n = Math.min(60, Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1))
  return Array.from({ length: n }, (_, i) => addDays(start, i))
}
/** Parada en la que se está ese día (la última a la que se llegó ese día o antes). */
const stopOn = (stops, day) => stops.filter((s) => s.arrived_on && s.arrived_on <= day).at(-1) ?? stops[0]
function sightDay(s, stops, days) {
  if (s.day) return s.day
  const arrived = stops.find((x) => x.id === s.stop_id)?.arrived_on
  if (arrived && days.includes(arrived)) return arrived
  return arrived && days.length && arrived < days[0] ? days[0] : (arrived ?? days[0])
}

// ── Eventos ──

function vevent(e, now) {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@roam`, `DTSTAMP:${now}`]
  if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${date(e.allDay[0])}`, `DTEND;VALUE=DATE:${date(addDays(e.allDay[1], 1))}`)
  if (e.timed) lines.push(`DTSTART:${time(e.timed[0])}`, `DTEND:${time(e.timed[1])}`)
  lines.push(`SUMMARY:${escape(e.summary)}`)
  if (e.location) lines.push(`LOCATION:${escape(e.location)}`)
  if (e.geo) lines.push(`GEO:${e.geo[0].toFixed(5)};${e.geo[1].toFixed(5)}`)
  const desc = (e.description ?? []).filter(Boolean)
  if (e.url) desc.push(e.url)
  if (desc.length) lines.push(`DESCRIPTION:${escape(desc.join('\n'))}`)
  if (e.url) lines.push(`URL:${e.url}`)
  if (e.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.summary)}`, `TRIGGER:-PT${e.alarm}M`, 'END:VALARM')
  lines.push('END:VEVENT')
  return lines
}

function legEvents(t, legs, url) {
  return t.stops.flatMap((s, i) => {
    if (i === 0 || !s.transport_in) return []
    const prev = t.stops[i - 1]
    const d = legs.find((l) => l.stop_id === s.id)
    const day = d?.depart_on ?? s.arrived_on
    if (!day || (!BOOKED.includes(s.transport_in) && !d?.depart_time)) return []
    const plane = s.transport_in === 'plane'
    const route = plane && s.from_airport && s.to_airport ? `${prev.name} (${s.from_airport}) → ${s.name} (${s.to_airport})` : `${prev.name} → ${s.name}`
    const event = {
      uid: `leg-${s.id}`,
      summary: `${LEG_NAME[s.transport_in]}${s.flight_no ? ` ${s.flight_no}` : ''} · ${route}`,
      location: plane && s.from_airport ? `Aeropuerto ${s.from_airport}` : prev.name,
      description: [t.title, d?.carrier && `Compañía: ${d.carrier}`, d?.booking_ref && `Reserva: ${d.booking_ref}`, d?.notes],
      url,
    }
    if (!d?.depart_time) return [{ ...event, allDay: [day, day] }]
    const start = `${day}T${hhmm(d.depart_time)}`
    let end = plusMinutes(start, plane ? 120 : 60)
    if (d.arrive_time) {
      // Llegada otro día (vuelo nocturno) o a una hora «anterior» que en realidad es del día siguiente.
      let arriveDay = s.arrived_on && s.arrived_on > day ? s.arrived_on : day
      if (arriveDay === day && hhmm(d.arrive_time) < hhmm(d.depart_time)) arriveDay = addDays(day, 1)
      end = `${arriveDay}T${hhmm(d.arrive_time)}`
    }
    return [{ ...event, timed: [start, end], alarm: plane ? 180 : 60 }]
  })
}

function lodgingEvents(t, lodgings, url) {
  return lodgings.flatMap((l) => {
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
        l.check_in_time && `Entrada: ${hhmm(l.check_in_time)}`,
        l.check_out_time && `Salida: ${hhmm(l.check_out_time)}`,
        l.booking_ref && `Reserva: ${l.booking_ref}`,
        l.url,
        l.notes,
      ],
      url,
    }
    const out = [{ ...base, uid: `lod-${l.id}`, summary: `Alojamiento · ${l.name}`, allDay: [from, lastNight] }]
    if (l.check_in_time) {
      const at = `${from}T${hhmm(l.check_in_time)}`
      out.push({ ...base, uid: `lod-in-${l.id}`, summary: `Entrada · ${l.name}`, timed: [at, plusMinutes(at, 30)] })
    }
    if (l.check_out_time && to) {
      const at = `${to}T${hhmm(l.check_out_time)}`
      out.push({ ...base, uid: `lod-out-${l.id}`, summary: `Salida · ${l.name}`, timed: [at, plusMinutes(at, 30)], alarm: 60 })
    }
    return out
  })
}

/** Plan día a día: los sitios con hora van a su hora; los demás, juntos en un evento de todo el día. */
function planEvents(t, url) {
  const days = tripDays(t)
  const untimed = new Map()
  const out = []
  for (const s of t.sights) {
    const day = sightDay(s, t.stops, days)
    if (!day) continue
    const stop = t.stops.find((x) => x.id === s.stop_id)
    if (s.time) {
      const start = `${day}T${hhmm(s.time)}`
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
    const stop = stopOn(t.stops, day)
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

function tripEvents({ trip: t, lodgings, legs }, origin) {
  const url = `${origin}/app/viajes/${t.id}`
  const route = t.stops.map((s) => s.name).join(' → ')
  return [
    ...(t.start_date ? [{ uid: `trip-${t.id}`, summary: `Viaje · ${t.title}`, allDay: [t.start_date, t.end_date ?? t.start_date], description: [route, t.description], url }] : []),
    ...legEvents(t, legs, url),
    ...lodgingEvents(t, lodgings, url),
    ...planEvents(t, url),
  ]
}

/** Calendario de uno o varios viajes. `refresh`: cada cuánto deben consultarlo las suscripciones. */
export function buildCalendar({ name, trips, origin, refresh }) {
  const events = trips.flatMap((x) => tripEvents(x, origin))
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ROAM//Kinetic Travel Tracker//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    ...(refresh ? [`REFRESH-INTERVAL;VALUE=DURATION:${refresh}`, `X-PUBLISHED-TTL:${refresh}`] : []),
    ...events.flatMap((e) => vevent(e, now)),
    'END:VCALENDAR',
  ]
  return { ics: lines.map(fold).join('\r\n') + '\r\n', count: events.length }
}

/** Calendario de un viaje (botón «Añadir al calendario»). */
export function tripCalendar(trip, lodgings, legs, origin = globalThis.location?.origin ?? '') {
  return buildCalendar({ name: trip.title, trips: [{ trip, lodgings, legs }], origin })
}

const slug = (s) =>
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
export function openCalendarFile(ics, title) {
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
