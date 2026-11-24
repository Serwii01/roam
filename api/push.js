// Avisos en el móvil (Web Push). Los avisos se guardan en la tabla notifications (la bandeja de la app) y de ahí se envían:
//  · ?action=flush — la app, tras guardar un gasto o un pago: envía los avisos que la base de datos ha creado con los
//    cambios de esa persona (disparadores de 20261124000000_expense_activity.sql).
//  · ?action=daily — la llama el cron de Vercel cada mañana (vercel.json) con CRON_SECRET: guarda los avisos del día
//    (due_notifications() y los recordatorios de reminders.js) y envía todo lo que quede pendiente.
//  · ?action=test  — «Enviar un aviso de prueba» desde Ajustes, con la sesión del usuario.
//  · ?action=join  — al aceptar una invitación: avisa al resto del viaje de que alguien se ha unido.
//  · ?action=done  — el creador marca un viaje compartido como realizado: avisa a los compañeros.
// Lee y escribe en Supabase con la clave de servicio (SUPABASE_SERVICE_ROLE_KEY), que solo vive en Vercel.
// En JavaScript y en Node (no Edge): web-push usa el cifrado de Node.
import webpush from 'web-push'
import { reminders } from '../src/lib/reminders.js'
import { groupNotifications } from '../src/lib/notifyGroup.js'

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
  // Las altas y borrados con return=minimal responden 201 o 204 sin cuerpo.
  const text = await res.text()
  return text ? JSON.parse(text) : null
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
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 12 * 3600, urgency: 'high' })
        sent++
      } catch (e) {
        // 404/410: el usuario quitó el permiso o desinstaló la app.
        if (e.statusCode === 404 || e.statusCode === 410) await admin(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {})
      }
    }),
  )
  return sent
}

/** Reclama los avisos pendientes (de una persona o de todos) y los envía, juntando varios gastos del mismo viaje. */
async function sendPending(actor) {
  const rows = await admin('rpc/claim_notifications', { method: 'POST', body: JSON.stringify(actor ? { actor } : {}) })
  let sent = 0
  for (const n of groupNotifications(rows)) sent += await sendTo([n.user_id], { title: n.title, body: n.body, url: n.url, tag: n.tag })
  return sent
}

async function flush(req, res) {
  const user = await sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Sin sesión' })
  return res.status(200).json({ sent: await sendPending(user.id) })
}

/** Todo lo que hace falta para los recordatorios: viajes compartidos en marcha o recién terminados y sus cuentas. */
async function reminderData(today) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 31 * 86_400_000).toISOString().slice(0, 10)
  const trips = await admin(`trips?select=id,title,user_id,start_date,end_date,companions&end_date=gte.${since}&start_date=lte.${today}`)
  if (!trips.length) return []
  const out = []
  // De 40 en 40 viajes: la lista de ids va en la dirección de la petición.
  for (let i = 0; i < trips.length; i += 40) {
    const part = trips.slice(i, i + 40)
    const ids = inList(part.map((t) => t.id))
    const [members, expenses, budgets] = await Promise.all([
      admin(`trip_members?select=trip_id,user_id&trip_id=${ids}`),
      admin(`expenses?select=*&trip_id=${ids}&limit=10000`),
      admin(`trip_budgets?select=trip_id,currency,closed_at&trip_id=${ids}`),
    ])
    for (const t of part)
      out.push({
        trip: t,
        users: [t.user_id, ...members.filter((m) => m.trip_id === t.id).map((m) => m.user_id)],
        expenses: expenses.filter((e) => e.trip_id === t.id).map((e) => ({ ...e, amount: Number(e.amount), rate: Number(e.rate) })),
        budget: budgets.find((b) => b.trip_id === t.id) ?? null,
      })
  }
  return out
}

/** Día de hoy en España (los avisos de «mañana» y «hoy» se calculan con esa fecha). */
const todayInSpain = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

async function daily(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'No autorizado' })
  const today = req.query.today && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : todayInSpain()
  const due = await admin('rpc/due_notifications', { method: 'POST', body: JSON.stringify({ today }) })
  const rows = [
    ...due.map((n) => ({
      user_id: n.user_id,
      trip_id: n.url.match(/viajes\/([0-9a-f-]{36})/)?.[1] ?? null,
      kind: n.kind === 'memory' ? 'memories' : n.kind,
      title: n.title,
      // El check-in de casi todas las compañías está abierto 24 h antes.
      body: n.kind === 'travel' && n.title.includes('vuelo') ? `${n.body ? `${n.body} · ` : ''}Haz el check-in si aún no lo has hecho` : (n.body ?? ''),
      url: n.url,
      tag: n.tag,
      dedupe: `${today}:${n.user_id}:${n.tag}`,
    })),
    ...reminders(await reminderData(today), today).map((n) => ({ ...n, dedupe: `${today}:${n.user_id}:${n.tag}` })),
  ]
  // Si el cron se repite el mismo día, los que ya están se ignoran (dedupe es único).
  if (rows.length) await admin('notifications?on_conflict=dedupe', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) })
  const sent = await sendPending(null)
  // La bandeja guarda dos meses.
  await admin(`notifications?created_at=lt.${new Date(Date.now() - 60 * 86_400_000).toISOString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  return res.status(200).json({ today, due: rows.length, sent })
}

async function test(req, res) {
  const user = await sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Sin sesión' })
  const sent = await sendTo([user.id], {
    title: 'Avisos de ROAM activados',
    body: 'Así te llegarán los gastos y pagos de tus compañeros, los vuelos del día siguiente y los recordatorios.',
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

async function done(req, res) {
  const user = await sessionUser(req)
  const tripId = req.body?.tripId
  if (!user) return res.status(401).json({ error: 'Sin sesión' })
  if (!UUID.test(tripId ?? '')) return res.status(400).json({ error: 'Viaje no válido' })
  // Solo quien creó el viaje, y solo si de verdad está realizado.
  const [trip] = await admin(`trips?select=id,title,user_id,status&id=eq.${tripId}`)
  if (!trip || trip.user_id !== user.id) return res.status(403).json({ error: 'No es tu viaje' })
  if (trip.status !== 'done') return res.status(200).json({ sent: 0 })
  const people = (await admin(`trip_members?select=user_id&trip_id=eq.${tripId}`)).map((m) => m.user_id)
  if (!people.length) return res.status(200).json({ sent: 0 })
  const off = new Set((await admin(`notification_prefs?select=user_id&social=eq.false&user_id=${inList(people)}`)).map((p) => p.user_id))
  const [profile] = await admin(`profiles?select=display_name,username&id=eq.${user.id}`)
  const who = profile?.display_name || profile?.username || 'Quien lo creó'
  const sent = await sendTo(
    people.filter((id) => !off.has(id)),
    { title: `«${trip.title}» ya es un viaje realizado`, body: `${who} lo ha marcado como hecho: ya cuenta en tu mapa, tu pasaporte y tu perfil.`, url: `/app/viajes/${tripId}`, tag: `done-${tripId}` },
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
    if (action === 'flush') return await flush(req, res)
    if (action === 'test') return await test(req, res)
    if (action === 'join') return await join(req, res)
    if (action === 'done') return await done(req, res)
    return res.status(404).json({ error: 'Acción desconocida' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'No se pudieron enviar los avisos' })
  }
}
