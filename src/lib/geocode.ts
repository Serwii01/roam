// Geocodificación con servicios gratuitos de OpenStreetMap:
//  - Photon (komoot): búsqueda mientras escribes, que su servicio admite con un uso razonable.
//  - Nominatim (OSMF): SOLO la consulta inversa al elegir un lugar, para sus códigos ISO de región.
//    Su política prohíbe autocompletar y limita a 1 petición/s en total, por eso hay cola y caché:
//    https://operations.osmfoundation.org/policies/nominatim/
import { countryCodeFromName } from './countries'

export interface Place {
  name: string
  label: string
  countryCode: string
  lat: number
  lon: number
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

const PHOTON_TIMEOUT_MS = 6000

/** Búsqueda de lugares con Photon. Si falla, el buscador muestra el error y deja reintentar. */
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return []
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=default`
  const res = await fetch(url, { signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(PHOTON_TIMEOUT_MS)]) })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const json = (await res.json()) as { features: PhotonFeature[] }
  return json.features
    .map((f) => {
      const p = f.properties
      const code = p.countrycode?.toUpperCase() ?? (p.country ? countryCodeFromName(p.country) : undefined)
      if (!code || !p.name) return null
      const extra = [p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean).join(', ')
      return {
        name: p.name,
        label: extra ? `${p.name}, ${extra}` : p.name,
        countryCode: code,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }
    })
    .filter((p): p is Place => p !== null)
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
