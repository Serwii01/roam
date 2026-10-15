// Geocodificación con servicios gratuitos de OpenStreetMap:
//  - Photon (komoot): búsqueda mientras escribes, que su servicio admite con un uso razonable.
//  - Nominatim (OSMF): SOLO la consulta inversa al elegir un lugar, para sus códigos ISO de región.
//    Su política prohíbe autocompletar y limita a 1 petición/s en total, por eso hay cola y caché:
//    https://operations.osmfoundation.org/policies/nominatim/
import { countryCenter, countryCodeFromName } from './countries'
import { fold, matchCountries, spanishCountryName } from './exonyms'
import { knownPlaceNear, searchKnownPlaces } from './placesIndex'

export interface Place {
  name: string
  label: string
  countryCode: string
  lat: number
  lon: number
  /** País entero (sin región ni provincia), ciudad o región, u otro lugar (monumento, barrio, calle…). */
  kind: 'country' | 'city' | 'region' | 'place'
  /** Calle o portal (Photon): se descartan si ya hay un país o ciudad con ese nombre. */
  street?: boolean
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    city?: string
    state?: string
    country?: string
    countrycode?: string
    type?: string
  }
}

const PHOTON_TIMEOUT_MS = 10_000

/**
 * Opcional: con VITE_GEOAPIFY_KEY la segunda fase usa Geoapify (entiende español y encuentra
 * monumentos: «Torre Eiffel», «Sagrada Familia»). Plan gratuito: 3.000 búsquedas/día, uso comercial
 * permitido, con atribución «Powered by Geoapify». Sin clave se usa Photon.
 */
const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY as string | undefined
export const REMOTE_PROVIDER: 'geoapify' | 'photon' = GEOAPIFY_KEY ? 'geoapify' : 'photon'

interface GeoapifyFeature {
  properties: {
    name?: string
    formatted?: string
    city?: string
    state?: string
    country_code?: string
    lat: number
    lon: number
    result_type?: string
  }
}

async function searchGeoapify(q: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ text: q, lang: 'es', limit: '8', apiKey: GEOAPIFY_KEY! })
  const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, {
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(PHOTON_TIMEOUT_MS)]),
  })
  if (!res.ok) throw new Error(`Geoapify ${res.status}`)
  const { features } = (await res.json()) as { features: GeoapifyFeature[] }
  return features.flatMap(({ properties: p }) => {
    const code = p.country_code?.toUpperCase()
    const name = p.name ?? p.city ?? p.formatted?.split(',')[0]
    if (!code || !name) return []
    const t = p.result_type
    const kind: Place['kind'] = t === 'country' ? 'country' : t === 'city' ? 'city' : t === 'state' || t === 'county' ? 'region' : 'place'
    const context = [p.city && p.city !== name ? p.city : undefined, p.state && p.state !== name ? p.state : undefined, spanishCountryName(code)]
    return [{ name, label: [name, ...context.filter(Boolean)].join(', '), countryCode: code, lat: p.lat, lon: p.lon, kind, street: t === 'street' || t === 'building' }]
  })
}

/** Orden por tipo de Photon: primero ciudades, al final calles y portales (que suelen ser ruido). */
const TYPE_RANK: Record<string, number> = { city: 0, town: 0, village: 1, state: 2, county: 2, district: 3, locality: 3, other: 4, street: 6, house: 7 }
const kindOf = (type?: string): Place['kind'] =>
  type === 'city' || type === 'town' || type === 'village' ? 'city' : type === 'state' || type === 'county' ? 'region' : 'place'

/**
 * Fase 1, instantánea y sin red: países por su nombre en español, inglés o alias (Chequia, Holanda,
 * EE. UU.…) y ciudades del catálogo propio con nombre en español (Pekín, Ciudad del Cabo…).
 */
export async function searchLocal(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return []
  const out: Place[] = []
  for (const c of matchCountries(q, 3)) {
    const center = await countryCenter(c.code)
    if (center) out.push({ name: c.name, label: c.name, countryCode: c.code, lon: center[0], lat: center[1], kind: 'country' })
  }
  for (const p of await searchKnownPlaces(q, 5).catch(() => [])) {
    out.push({
      name: p.es,
      // «Sevilla, Sevilla, España» → «Sevilla, España» cuando la región se llama como la ciudad.
      label: [p.es, p.region && fold(p.region) !== fold(p.es) ? p.region : null, spanishCountryName(p.cc)].filter(Boolean).join(', '),
      countryCode: p.cc,
      lat: p.lat,
      lon: p.lon,
      kind: 'city',
    })
  }
  return out
}

/**
 * Fase 2, con Photon (OpenStreetMap): monumentos, barrios, pueblos pequeños… Las ciudades que están en
 * el catálogo se muestran con su nombre en español («北京市» → «Pekín»).
 */
export async function searchRemote(q: string, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return []
  if (GEOAPIFY_KEY) return searchGeoapify(q, signal)
  const res = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '8', lang: 'default' })}`, {
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(PHOTON_TIMEOUT_MS)]),
  })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const features = ((await res.json()) as { features: PhotonFeature[] }).features
  const ranked = [...features].sort((a, b) => (TYPE_RANK[a.properties.type ?? 'other'] ?? 5) - (TYPE_RANK[b.properties.type ?? 'other'] ?? 5))
  const out: Place[] = []
  for (const f of ranked) {
    const p = f.properties
    const code = p.countrycode?.toUpperCase() ?? (p.country ? countryCodeFromName(p.country) : undefined)
    if (!code || !p.name) continue
    const kind = kindOf(p.type)
    const [lon, lat] = f.geometry.coordinates
    // Población conocida cercana: da el nombre en español de la ciudad y un contexto legible
    // («伏見稲荷大社, Kioto, Japón» en vez de «…, 京都市, 京都府»).
    const known = await knownPlaceNear(lat, lon, code, kind === 'city' ? 25 : 40).catch(() => undefined)
    const name = (kind === 'city' ? known?.es : undefined) ?? p.name
    const latin = (s?: string) => (s && !/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}]/u.test(s) ? s : undefined)
    const city = kind === 'city' ? undefined : (known?.es ?? latin(p.city))
    const state = latin(p.state) ?? known?.region ?? undefined
    const context = [city !== name ? city : undefined, state !== name ? state : undefined, spanishCountryName(code)]
    const street = p.type === 'street' || p.type === 'house'
    out.push({ name, label: [name, ...context.filter(Boolean)].join(', '), countryCode: code, lat, lon, kind, street })
  }
  return out
}

/**
 * Une ambas fases sin duplicados. Si el texto es un país o una ciudad conocida, se quitan las calles
 * que se llaman igual («Calle República Checa»), que es lo que antes llenaba la lista.
 */
export function mergePlaces(local: Place[], remote: Place[], q: string): Place[] {
  const s = fold(q)
  const out = [...local]
  for (const r of remote) {
    if (local.length && r.street && fold(r.name).includes(s)) continue
    const dup = out.some((o) => o.countryCode === r.countryCode && Math.abs(o.lat - r.lat) < 0.08 && Math.abs(o.lon - r.lon) < 0.08)
    if (!dup) out.push(r)
  }
  return out.slice(0, 8)
}

export interface PlaceCodes {
  countryCode?: string
  /** ISO 3166-2 de primer nivel (comunidad, estado, región…). */
  regionCode?: string
  /** ISO 3166-2 de segundo nivel si existe (provincia, departamento…). */
  provinceCode?: string
}

/** `VITE_NOMINATIM=off` desactiva Nominatim (la OSMF puede pedirlo): las paradas se guardan sin región. */
const NOMINATIM_ON = (import.meta.env.VITE_NOMINATIM as string | undefined) !== 'off'
/** Email de contacto que Nominatim recomienda enviar para identificar a la aplicación. */
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined
const CACHE_KEY = 'rumbo-nominatim-v1'

let memory: Record<string, PlaceCodes> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, PlaceCodes>
  } catch {
    return {}
  }
})()

function remember(key: string, value: PlaceCodes) {
  memory[key] = value
  const keys = Object.keys(memory)
  if (keys.length > 500) memory = Object.fromEntries(keys.slice(-400).map((k) => [k, memory[k]]))
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory))
  } catch {
    /* caché solo en memoria */
  }
}

// Cola: como mucho una petición por segundo desde esta pestaña.
let last = 0
let queue: Promise<unknown> = Promise.resolve()
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last = Date.now()
    return fn()
  })
  queue = run.catch(() => {})
  return run
}

/**
 * Códigos ISO 3166-2 de un punto con la geocodificación inversa de Nominatim: una sola petición al
 * elegir un lugar (nunca mientras se escribe), en cola de 1/s y con caché por zona (~1 km).
 */
export async function lookupPlaceCodes(lat: number, lon: number, signal?: AbortSignal): Promise<PlaceCodes> {
  if (!NOMINATIM_ON) return {}
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  if (memory[key]) return memory[key]
  return throttled(async () => {
    const params = new URLSearchParams({ format: 'jsonv2', zoom: '10', addressdetails: '1', lat: String(lat), lon: String(lon) })
    if (CONTACT) params.set('email', CONTACT)
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal })
    if (!res.ok) return {}
    const json = (await res.json()) as { address?: Record<string, string> }
    const a = json.address ?? {}
    // Nominatim usa distintos niveles según el país; el primero que aparezca es la región.
    const levels = [3, 4, 5, 6, 7, 8].map((n) => a[`ISO3166-2-lvl${n}`]).filter(Boolean)
    const codes = { countryCode: a.country_code?.toUpperCase(), regionCode: levels[0], provinceCode: levels[1] }
    remember(key, codes)
    return codes
  })
}
