// Datos para las vistas previas (WhatsApp, Telegram, X…) de perfiles públicos y viajes compartidos.
// Se leen de Supabase con la clave pública: solo devuelve lo que ya es público (RLS y get_shared_trip).

export type Kind = 'u' | 't' | 'v'

export interface Meta {
  title: string
  description: string
  /** Líneas grandes de la imagen. */
  heading: string
  sub: string
  stats: { label: string; value: string }[]
  /** Enlaces de viaje: no indexar. */
  noindex: boolean
}

const SB = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function rest<T>(path: string, body?: unknown): Promise<T | null> {
  if (!SB || !KEY) return null
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.ok ? ((await res.json()) as T) : null
}

const n = (x: number) => x.toLocaleString('es-ES')
const range = (a?: string | null, b?: string | null) => {
  if (!a) return ''
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return b && b !== a ? `${f(a)} – ${f(b)}` : f(a)
}
const days = (a?: string | null, b?: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1 : null)

interface TripRow {
  title: string
  start_date: string | null
  end_date: string | null
  user_id: string
  stops: { country_code: string; position: number }[]
}

function tripMeta(t: TripRow, owner: string, noindex: boolean): Meta {
  const stops = [...t.stops].sort((a, b) => a.position - b.position)
  const all = [...new Set(stops.map((s) => s.country_code))]
  const countries = all.length > 1 ? all.filter((c) => c !== stops[0]?.country_code) : all
  const d = days(t.start_date, t.end_date)
  const when = range(t.start_date, t.end_date)
  return {
    title: `${t.title} · ROAM`,
    description: [`Un viaje de ${owner}`, when, `${countries.length} ${countries.length === 1 ? 'país' : 'países'}`, `${stops.length} paradas`].filter(Boolean).join(' · '),
    heading: t.title,
    sub: [`Un viaje de ${owner}`, when].filter(Boolean).join(' · '),
    stats: [
      { label: countries.length === 1 ? 'País' : 'Países', value: n(countries.length) },
      { label: 'Paradas', value: n(stops.length) },
      ...(d ? [{ label: 'Días', value: n(d) }] : []),
    ],
    noindex,
  }
}

export async function loadMeta(kind: Kind, id: string, username?: string): Promise<Meta | null> {
  if (kind === 'v') {
    if (!UUID.test(id)) return null
    const data = await rest<{ trip: TripRow; stops: TripRow['stops']; owner: { display_name: string } } | null>('rpc/get_shared_trip', { tok: id })
    return data ? tripMeta({ ...data.trip, stops: data.stops }, data.owner.display_name, true) : null
  }
  const user = (username ?? id).toLowerCase()
  if (!/^[a-z0-9_]{3,30}$/.test(user)) return null
  const [p] = (await rest<{ id: string; username: string; display_name: string | null; bio: string | null }[]>(`profiles?username=eq.${user}&is_public=eq.true&select=id,username,display_name,bio`)) ?? []
  if (!p) return null
  const name = p.display_name || p.username
  if (kind === 't') {
    if (!UUID.test(id)) return null
    const [t] = (await rest<TripRow[]>(`trips?id=eq.${id}&user_id=eq.${p.id}&select=title,start_date,end_date,user_id,stops(country_code,position)`)) ?? []
    return t ? tripMeta(t, name, false) : null
  }
  const [visited, trips] = await Promise.all([
    rest<{ country_code: string }[]>(`visited_countries?user_id=eq.${p.id}&select=country_code`),
    rest<{ id: string }[]>(`trips?user_id=eq.${p.id}&status=eq.done&select=id`),
  ])
  const countries = new Set((visited ?? []).map((v) => v.country_code)).size
  const pct = Math.round((countries / 195) * 100)
  return {
    title: `${name} (@${p.username}) · ROAM`,
    description: `${n(countries)} países · ${pct}% del mundo · ${n(trips?.length ?? 0)} viajes.${p.bio ? ` ${p.bio}` : ''} Mira su mapa de viajes.`,
    heading: name,
    sub: `@${p.username} · su mapa de viajes`,
    stats: [
      { label: 'Países', value: n(countries) },
      { label: 'Del mundo', value: `${pct}%` },
      { label: 'Viajes', value: n(trips?.length ?? 0) },
    ],
    noindex: false,
  }
}
