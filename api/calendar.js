// /cal/<token>.ics: calendario con los viajes de quien tiene el enlace secreto (suscripción desde Calendario de
// iPhone, Google Calendar, Outlook…). Se lee con la clave pública a través de calendar_feed(), que sin un token
// válido no devuelve nada. El calendario se arma con el mismo código que el botón «Añadir al calendario».
import { buildCalendar } from '../src/lib/calendar.js'

export const config = { runtime: 'edge' }

const SB = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (body, status) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } })

export default async function handler(req) {
  const url = new URL(req.url)
  const token = (url.searchParams.get('token') ?? '').replace(/\.ics$/i, '')
  if (!UUID.test(token)) return text('Calendario no encontrado', 404)
  if (!SB || !KEY) return text('ROAM no está configurado', 503)
  const res = await fetch(`${SB}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tok: token }),
  })
  if (!res.ok) return text('No se pudo leer el calendario', 502)
  const feed = await res.json()
  // Enlace cambiado o suscripción desactivada.
  if (!feed) return text('Calendario no encontrado', 404)
  const { ics } = buildCalendar({
    name: 'ROAM · Mis viajes',
    trips: feed.trips.map((t) => ({ trip: t, lodgings: t.lodgings, legs: t.legs })),
    origin: url.origin,
    refresh: 'PT6H',
  })
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="roam.ics"',
      // Poco tiempo en la CDN: si se cambia el enlace, el antiguo deja de funcionar en unos minutos.
      'Cache-Control': 'private, max-age=0, s-maxage=300',
      'X-Robots-Tag': 'noindex',
    },
  })
}
