// Lee confirmaciones de vuelos y hoteles a partir del texto de un correo (pegado o en un archivo .eml/.html).
// Primero busca los datos estructurados schema.org que llevan muchos correos de aerolíneas y de Booking; si no hay,
// busca patrones en el texto. Es una ayuda, no una verdad: la app enseña el resultado para revisarlo antes de guardar.

export interface FlightBooking {
  kind: 'flight'
  flightNo: string | null
  carrier: string | null
  from: string | null
  to: string | null
  /** AAAA-MM-DD */
  date: string | null
  /** HH:MM */
  departTime: string | null
  arriveTime: string | null
  ref: string | null
}

export interface LodgingBooking {
  kind: 'lodging'
  name: string | null
  address: string | null
  checkIn: string | null
  checkInTime: string | null
  checkOut: string | null
  checkOutTime: string | null
  ref: string | null
}

export type Booking = FlightBooking | LodgingBooking

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
}
const MONTH = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

const CARRIERS: Record<string, string> = {
  AF: 'Air France', AY: 'Finnair', AZ: 'ITA Airways', BA: 'British Airways', DL: 'Delta', EK: 'Emirates', EY: 'Etihad', FR: 'Ryanair', I2: 'Iberia Express',
  IB: 'Iberia', KL: 'KLM', LH: 'Lufthansa', LX: 'Swiss', NT: 'Binter', QR: 'Qatar Airways', TK: 'Turkish Airlines', TP: 'TAP', U2: 'easyJet', UA: 'United',
  UX: 'Air Europa', V7: 'Volotea', VY: 'Vueling', W6: 'Wizz Air',
}
const NOT_AIRPORTS = new Set(['EUR', 'USD', 'GBP', 'IVA', 'VAT', 'PDF', 'PNR', 'NIF', 'DNI', 'THE', 'AND', 'FOR', 'ETA', 'ETD', 'UTC', 'GMT', 'CET'])

const pad = (n: number) => String(n).padStart(2, '0')
function isoDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const DATE_RE = new RegExp(
  [
    '\\b(?<iy>20\\d{2})-(?<im>\\d{2})-(?<id>\\d{2})\\b',
    '\\b(?<nd>\\d{1,2})[/.-](?<nm>\\d{1,2})[/.-](?<ny>20\\d{2}|\\d{2})\\b',
    `\\b(?<td>\\d{1,2})\\.?(?:\\s+de)?\\s+(?<tm>${MONTH})\\.?(?:(?:\\s+de)?,?\\s+(?<ty>20\\d{2}))?\\b`,
    `\\b(?<um>${MONTH})\\.?\\s+(?<ud>\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(?<uy>20\\d{2}))?\\b`,
  ].join('|'),
  'gi',
)

interface Found {
  date: string
  at: number
  end: number
}

/** Fechas del texto, en orden. Sin año, se usa `year`. Con barras se entiende día/mes. */
export function findDates(text: string, year: number): Found[] {
  const out: Found[] = []
  for (const m of text.matchAll(DATE_RE)) {
    const g = m.groups!
    let date: string | null = null
    if (g.iy) date = isoDate(+g.iy, +g.im, +g.id)
    else if (g.nd) date = isoDate(g.ny.length === 2 ? 2000 + +g.ny : +g.ny, +g.nm, +g.nd)
    else if (g.td) date = isoDate(g.ty ? +g.ty : year, MONTHS[g.tm.toLowerCase()], +g.td)
    else if (g.um) date = isoDate(g.uy ? +g.uy : year, MONTHS[g.um.toLowerCase()], +g.ud)
    if (date) out.push({ date, at: m.index, end: m.index + m[0].length })
  }
  return out
}

const TIME_RE = /\b(\d{1,2})[:.h](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?![\d/.-])/gi

/** Horas del texto, en 24 h. */
export function findTimes(text: string): { time: string; at: number }[] {
  const out: { time: string; at: number }[] = []
  for (const m of text.matchAll(TIME_RE)) {
    let h = +m[1]
    const min = +m[2]
    const half = m[3]?.[0].toLowerCase()
    if (half === 'p' && h < 12) h += 12
    if (half === 'a' && h === 12) h = 0
    if (h < 24 && min < 60) out.push({ time: `${pad(h)}:${pad(min)}`, at: m.index })
  }
  return out
}

const REF_RE =
  /(?:localizador|c[oó]digo de (?:reserva|confirmaci[oó]n)|n[uú]mero de (?:reserva|confirmaci[oó]n)|booking (?:reference|code|number)|confirmation (?:code|number)|reservation (?:code|number)|pnr)\b[^A-Za-z0-9\n]{0,12}(?:\n\s*)?([A-Z0-9][A-Z0-9.-]{4,17})\b/i

const findRef = (text: string) => REF_RE.exec(text)?.[1].toUpperCase() ?? null

const FLIGHT_RE = /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{2,4})\b/g
const ROUTE_RE = /\b([A-Z]{3})\b\s*(?:→|->|–|—|-|>|\bto\b|\ba\b)\s*\(?\b([A-Z]{3})\b/
const PAREN_AIRPORT_RE = /\(([A-Z]{3})\)/g

function flightMatches(text: string) {
  const all = [...text.matchAll(FLIGHT_RE)].filter((m) => !NOT_AIRPORTS.has(m[1]))
  const known = all.filter((m) => CARRIERS[m[1]])
  if (known.length) return known
  // Compañías que no están en la lista: solo si el número va justo después de «vuelo» o «flight».
  return all.filter((m) => /(?:vuelo|flight)(?:\s+n[uú]mero|\s+no\.?|\s+nº)?[\s:#]*$/i.test(text.slice(Math.max(0, m.index - 24), m.index)))
}

function parseFlights(text: string, year: number): FlightBooking[] {
  const matches = flightMatches(text)
  const dates = findDates(text, year)
  const ref = findRef(text)
  const seen = new Set<string>()
  const out: FlightBooking[] = []
  matches.forEach((m, i) => {
    const start = m.index
    const end = matches[i + 1]?.index ?? text.length
    const part = text.slice(start, end)
    const flightNo = `${m[1]}${m[2]}`
    const route = ROUTE_RE.exec(part)
    const paren = [...part.matchAll(PAREN_AIRPORT_RE)].map((x) => x[1]).filter((c) => !NOT_AIRPORTS.has(c))
    const from = route?.[1] ?? paren[0] ?? null
    const to = route?.[2] ?? paren[1] ?? null
    const date = dates.find((d) => d.at >= start && d.at < end)?.date ?? dates.filter((d) => d.at < start).at(-1)?.date ?? null
    const key = `${flightNo}|${date}`
    if (seen.has(key)) return
    seen.add(key)
    const times = findTimes(part)
    out.push({ kind: 'flight', flightNo, carrier: CARRIERS[m[1]] ?? null, from, to, date, departTime: times[0]?.time ?? null, arriveTime: times[1]?.time ?? null, ref })
  })
  return out
}

const CHECK_IN = /(?:check[\s-]?in|entrada|llegada|arrival)/i
const CHECK_OUT = /(?:check[\s-]?out|salida|departure)/i
const LODGING_HINT = /check[\s-]?in|hotel|hostal|hostel|alojamiento|apartamento|booking\.com|airbnb|noches?\b|nights?\b/i

function afterLabel(text: string, label: RegExp, year: number) {
  const m = label.exec(text)
  if (!m) return { date: null, time: null }
  const part = text.slice(m.index, m.index + 90)
  const date = findDates(part, year)[0]
  const time = findTimes(date ? part.slice(date.end) : part)[0]?.time ?? null
  return { date: date?.date ?? null, time }
}

function lodgingName(text: string) {
  const labelled = /(?:hotel|alojamiento|establecimiento|property|accommodation)\s*:\s*([^\n]{3,80})/i.exec(text)?.[1]
  const stay = /(?:reserva en|estancia en|stay at|booking at|reservation at)\s+([^\n.!]{3,70})/i.exec(text)?.[1]
  const named = /\b(?:Hotel|Hostal|Hostel|Apartamentos?|Apartments?|Resort|Posada|Parador)\s+[^\n,.;:]{2,50}/.exec(text)?.[0]
  return (labelled ?? stay ?? named)?.replace(/\s+(?:está|ha sido|is|has been)\s.*$/i, '').trim() ?? null
}

function parseLodging(text: string, year: number): LodgingBooking | null {
  if (!LODGING_HINT.test(text)) return null
  const inn = afterLabel(text, CHECK_IN, year)
  const out = afterLabel(text, CHECK_OUT, year)
  if (!inn.date || !out.date || out.date <= inn.date) return null
  const address = /(?:direcci[oó]n|address)\s*:\s*([^\n]{5,160})/i.exec(text)?.[1].trim() ?? null
  return { kind: 'lodging', name: lodgingName(text), address, checkIn: inn.date, checkInTime: inn.time, checkOut: out.date, checkOutTime: out.time, ref: findRef(text) }
}

// ── Datos estructurados (schema.org) ──

type Json = Record<string, unknown>
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const dayOf = (v: unknown) => str(v)?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null
const timeOf = (v: unknown) => str(v)?.match(/T(\d{2}:\d{2})/)?.[1] ?? null

function addressOf(v: unknown) {
  if (typeof v === 'string') return str(v)
  const a = obj(v)
  return [a.streetAddress, a.addressLocality, a.addressCountry].map(str).filter(Boolean).join(', ') || null
}

function fromSchema(node: Json): Booking | null {
  const type = String(node['@type'] ?? '')
  const item = obj(node.reservationFor)
  const ref = str(node.reservationNumber)
  if (type === 'FlightReservation') {
    const airline = obj(item.airline)
    const code = str(airline.iataCode)
    const number = str(item.flightNumber)
    return {
      kind: 'flight',
      flightNo: number ? `${code && !number.startsWith(code) ? code : ''}${number}`.replace(/\s/g, '') : null,
      carrier: str(airline.name) ?? (code ? (CARRIERS[code] ?? null) : null),
      from: str(obj(item.departureAirport).iataCode),
      to: str(obj(item.arrivalAirport).iataCode),
      date: dayOf(item.departureTime),
      departTime: timeOf(item.departureTime),
      arriveTime: timeOf(item.arrivalTime),
      ref,
    }
  }
  if (type === 'LodgingReservation') {
    return {
      kind: 'lodging',
      name: str(item.name),
      address: addressOf(item.address),
      checkIn: dayOf(node.checkinTime ?? node.checkinDate),
      checkInTime: timeOf(node.checkinTime),
      checkOut: dayOf(node.checkoutTime ?? node.checkoutDate),
      checkOutTime: timeOf(node.checkoutTime),
      ref,
    }
  }
  return null
}

function schemaBookings(html: string): Booking[] {
  const out: Booking[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    const node = obj(v)
    const found = fromSchema(node)
    if (found) out.push(found)
    if (node['@graph']) walk(node['@graph'])
  }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]))
    } catch {
      // Un bloque mal formado no impide leer el resto del correo.
    }
  }
  return out
}

// ── Del correo al texto ──

function decodeBytes(bytes: Uint8Array, charset: string) {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

function quotedPrintable(body: string, charset: string) {
  const clean = body.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))) {
      bytes.push(parseInt(clean.slice(i + 1, i + 3), 16))
      i += 2
    } else bytes.push(...new TextEncoder().encode(clean[i]))
  }
  return decodeBytes(new Uint8Array(bytes), charset)
}

function base64(body: string, charset: string) {
  try {
    return decodeBytes(Uint8Array.from(atob(body.replace(/\s/g, '')), (c) => c.charCodeAt(0)), charset)
  } catch {
    return body
  }
}

/** Saca el cuerpo de un .eml, con sus partes decodificadas. Un texto que no sea un correo se devuelve tal cual. */
export function emailBody(raw: string): string {
  if (!/^[\w-]+:\s/m.test(raw.slice(0, 400)) || !/content-type:/i.test(raw)) return raw
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/)
  const decoded = parts.map((part) => {
    const split = part.search(/\r?\n\r?\n/)
    if (split < 0) return ''
    const head = part.slice(0, split)
    const body = part.slice(split).trim()
    if (!/content-type:\s*text\//i.test(head)) return ''
    const charset = /charset="?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8'
    const encoding = /content-transfer-encoding:\s*([\w-]+)/i.exec(head)?.[1].toLowerCase()
    if (encoding === 'quoted-printable') return quotedPrintable(body, charset)
    if (encoding === 'base64') return base64(body, charset)
    return body
  })
  return decoded.filter(Boolean).join('\n') || raw
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→' }

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/td|\/th|\/li|\/h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Reservas encontradas en un correo. `year` es el año para las fechas que no lo llevan. */
export function parseBookings(input: string, year: number): Booking[] {
  const body = emailBody(input)
  const structured = schemaBookings(body)
  if (structured.length) return structured
  const text = htmlToText(body)
  const flights = parseFlights(text, year)
  if (flights.length) return flights
  const lodging = parseLodging(text, year)
  return lodging ? [lodging] : []
}
