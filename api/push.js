// Avisos en el móvil (Web Push). Una sola función con tres usos:
//  · ?action=daily — la llama el cron de Vercel cada mañana (vercel.json) con CRON_SECRET: envía los avisos del
//    día que calcula due_notifications() en Supabase (vuelos de mañana, entradas al alojamiento, pasaporte).
//  · ?action=test  — «Enviar un aviso de prueba» desde Ajustes, con la sesión del usuario.
//  · ?action=join  — al aceptar una invitación: avisa al resto del viaje de que alguien se ha unido.
// Lee y escribe en Supabase con la clave de servicio (SUPABASE_SERVICE_ROLE_KEY), que solo vive en Vercel.
// En JavaScript y en Node (no Edge): web-push usa el cifrado de Node.
import webpush from 'web-push'

const SB = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const CONTACT = process.env.VAPID_SUBJECT ?? (process.env.VITE_CONTACT_EMAIL ? `mailto:${process.env.VITE_CONTACT_EMAIL}` : 'mailto:hola@example.com')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Petición a la API de Supabase con la clave de servicio (salta RLS: solo aquí, en el servidor). */
async function admin(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    // Las claves nuevas de Supabase (sb_secret_…) van solo en apikey; las antiguas (JWT) también como Bearer.
    headers: { apikey: SERVICE, ...(SERVICE.startsWith('eyJ') ? { Authorization: `Bearer ${SERVICE}` } : {}), 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

/** Usuario de la sesión que manda la app (su token de Supabase), o null. */
async function sessionUser(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!token) return null
  const res = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  return res.ok ? res.json() : null
}

const inList = (ids) => `in.(${ids.map((x) => `"${x}"`).join(',')})`

/** Envía `message` a todos los móviles de esos usuarios; borra las suscripciones que ya no existen. */
async function sendTo(userIds, message) {
  if (!userIds.length) return 0
  const subs = await admin(`push_subscriptions?select=id,user_id,endpoint,p256dh,auth&user_id=${inList([...new Set(userIds)])}`)
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 12 * 3600 })
        sent++
      } catch (e) {
        // 404/410: el usuario quitó el permiso o desinstaló la app.
        if (e.statusCode === 404 || e.statusCode === 410) await admin(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {})
      }
    }),
  )
  return sent
}

/** Día de hoy en España (los avisos de «mañana» y «hoy» se calculan con esa fecha). */
const todayInSpain = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

async function daily(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'No autorizado' })
  const today = req.query.today && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : todayInSpain()
  const due = await admin('rpc/due_notifications', { method: 'POST', body: JSON.stringify({ today }) })
  let sent = 0
  for (const n of due) sent += await sendTo([n.user_id], { title: n.title, body: n.body, url: n.url, tag: n.tag })
  return res.status(200).json({ today, due: due.length, sent })
}

async function test(req, res) {
  const user = await sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Sin sesión' })
  const sent = await sendTo([user.id], {
    title: 'Avisos de ROAM activados',
    body: 'Así te llegarán los vuelos del día siguiente, las entradas al alojamiento y quién se une a tus viajes.',
    url: '/app/ajustes#avisos',
    tag: 'test',
  })
  return res.status(200).json({ sent })
}

async function join(req, res) {
  const user = await sessionUser(req)
  const tripId = req.body?.tripId
  if (!user) return res.status(401).json({ error: 'Sin sesión' })
  if (!UUID.test(tripId ?? '')) return res.status(400).json({ error: 'Viaje no válido' })
  // Solo si de verdad acaba de entrar en ese viaje.
  const member = await admin(`trip_members?select=user_id&trip_id=eq.${tripId}&user_id=eq.${user.id}`)
  if (!member.length) return res.status(403).json({ error: 'No participas en ese viaje' })
  const [trip] = await admin(`trips?select=id,title,user_id&id=eq.${tripId}`)
  const others = (await admin(`trip_members?select=user_id&trip_id=eq.${tripId}`)).map((m) => m.user_id)
  const people = [trip.user_id, ...others].filter((id) => id !== user.id)
  if (!people.length) return res.status(200).json({ sent: 0 })
  const off = new Set((await admin(`notification_prefs?select=user_id&social=eq.false&user_id=${inList(people)}`)).map((p) => p.user_id))
  const [profile] = await admin(`profiles?select=display_name,username&id=eq.${user.id}`)
  const who = profile?.display_name || profile?.username || 'Alguien'
  const sent = await sendTo(
    people.filter((id) => !off.has(id)),
    { title: `${who} se ha unido a «${trip.title}»`, body: 'Ya puede ver y editar el viaje contigo.', url: `/app/viajes/${tripId}`, tag: `join-${tripId}-${user.id}` },
  )
  return res.status(200).json({ sent })
}

export default async function handler(req, res) {
  if (!SB || !SERVICE || !VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(503).json({ error: 'Avisos sin configurar (faltan variables en Vercel)' })
  webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)
  try {
    const action = req.query.action
    if (action === 'daily') return await daily(req, res)
    if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' })
    if (action === 'test') return await test(req, res)
    if (action === 'join') return await join(req, res)
    return res.status(404).json({ error: 'Acción desconocida' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'No se pudieron enviar los avisos' })
  }
}
