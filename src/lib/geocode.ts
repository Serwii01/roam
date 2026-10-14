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

/** Búsqueda de lugares con Photon (OpenStreetMap, gratuito, sin API key). */
interface NominatimResult {
  lat: string
  lon: string
  name?: string
  display_name: string
  address?: { country_code?: string }
}

const PHOTON_TIMEOUT_MS = 3500

/**
 * Búsqueda de lugares con OpenStreetMap, gratuita y sin API key.
 * Usa Photon (pensado para autocompletar); si tarda o falla, recurre a Nominatim.
 */
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return []
  try {
    return await searchPhoton(q, AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(PHOTON_TIMEOUT_MS)]))
  } catch (e) {
    if (signal?.aborted) throw e
    return searchNominatim(q, signal)
  }
}

async function searchNominatim(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=es&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const json = (await res.json()) as NominatimResult[]
  return json
    .map((r) => {
      const code = r.address?.country_code?.toUpperCase()
      if (!code) return null
      return {
        name: r.name || r.display_name.split(',')[0],
        label: r.display_name,
        countryCode: code,
        lat: Number(r.lat),
        lon: Number(r.lon),
      }
    })
    .filter((p): p is Place => p !== null)
}

async function searchPhoton(q: string, signal: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=default`
  const res = await fetch(url, { signal })
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

/**
 * Códigos ISO 3166-2 de un punto con la geocodificación inversa de Nominatim
 * (una sola petición al elegir un lugar, dentro de su política de uso).
 */
export async function lookupPlaceCodes(lat: number, lon: number, signal?: AbortSignal): Promise<PlaceCodes> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`
  const res = await fetch(url, { signal })
  if (!res.ok) return {}
  const json = (await res.json()) as { address?: Record<string, string> }
  const a = json.address ?? {}
  const lvl = (n: number) => a[`ISO3166-2-lvl${n}`]
  // Nominatim usa distintos niveles según el país; el primero que aparezca es la región.
  const levels = [3, 4, 5, 6, 7, 8].map(lvl).filter(Boolean)
  return {
    countryCode: a.country_code?.toUpperCase(),
    regionCode: levels[0],
    provinceCode: levels[1],
  }
}
