// Poblaciones para el buscador de lugares:
//  - /data/places/*.json: ~70.000 de GeoNames (≥5.000 hab.), troceadas por prefijo, para buscar al instante.
//  - /data/places.json: ~7.300 de Natural Earth con nombre en español, para traducir resultados de Photon.
import { fold } from './exonyms'
import { haversine } from './geo'

export interface KnownPlace {
  es: string
  cc: string
  region: string | null
  lat: number
  lon: number
  pop: number
  keys: string[]
}

let index: Promise<KnownPlace[]> | null = null

export function preloadPlaces(): Promise<KnownPlace[]> {
  index ??= fetch('/data/places.json')
    .then((r) => r.json() as Promise<{ cols: string[]; rows: [string, string, string, string | null, number, number, number][] }>)
    .then((t) =>
      t.rows.map(([es, alt, cc, region, lat, lon, pop]) => ({
        es,
        cc,
        region,
        lat,
        lon,
        pop,
        keys: [...new Set([es, ...(alt ? alt.split('|') : [])].map(fold))],
      })),
    )
    .catch((e) => {
      index = null
      throw e
    })
  return index
}

// ── Catálogo de búsqueda troceado (GeoNames ≥5.000 hab., /data/places/{prefijo}.json) ──
type ShardRow = [display: string, cc: string, region: string | null, lat: number, lon: number, pop: number, keys: string[]]

let split: Promise<Set<string>> | null = null
const shards = new Map<string, Promise<ShardRow[]>>()

function shardName(s: string): Promise<string | null> {
  split ??= fetch('/data/places/split.json')
    .then((r) => r.json() as Promise<string[]>)
    .then((l) => new Set(l))
    .catch(() => {
      split = null
      return new Set<string>()
    })
  return split.then((set) => {
    const p2 = s.slice(0, 2)
    if (!/^[a-z0-9]{2}$/.test(p2)) return null
    if (!set.has(p2)) return p2
    // Prefijo muy común (sa, ma…): hace falta una tercera letra para no descargar demasiado.
    return /^[a-z0-9]{3}$/.test(s.slice(0, 3)) ? s.slice(0, 3) : null
  })
}

function loadShard(name: string): Promise<ShardRow[]> {
  if (!shards.has(name)) {
    shards.set(
      name,
      fetch(`/data/places/p_${name}.json`).then((r) => (r.ok ? (r.json() as Promise<ShardRow[]>) : [])),
    )
  }
  return shards.get(name)!
}

/**
 * Poblaciones (≥5.000 habitantes, más el catálogo con nombre español) cuyo nombre coincide con el texto.
 * Orden: nombre exacto, que empieza igual, alguna palabra que empieza igual; a igualdad, más pobladas antes.
 */
export async function searchKnownPlaces(q: string, limit = 5, home?: string): Promise<(KnownPlace & { exact: boolean })[]> {
  const s = fold(q)
  if (s.length < 2) return []
  const name = await shardName(s)
  if (!name) return []
  const scored: { row: ShardRow; score: number }[] = []
  for (const row of await loadShard(name)) {
    let best = Infinity
    for (const k of row[6]) {
      if (k === s) best = 0
      else if (k.startsWith(s)) best = Math.min(best, 1)
      else if (s.length >= 3 && k.split(' ').some((w) => w.startsWith(s))) best = Math.min(best, 2)
      if (best === 0) break
    }
    if (best < Infinity) scored.push({ row, score: best })
  }
  // Las filas vienen ordenadas por población: basta un orden estable por puntuación y, a igualdad, el
  // país de referencia primero (Granada de España antes que una Granada de otro sitio).
  const local = (r: ShardRow) => (home && r[1] === home ? 0 : 1)
  return scored
    .sort((a, b) => a.score - b.score || local(a.row) - local(b.row))
    .slice(0, limit)
    .map(({ row: [es, cc, region, lat, lon, pop], score }) => ({ es, cc, region, lat, lon, pop, keys: [], exact: score === 0 }))
}

/** Nombre en español de la población conocida más cercana (≤ `maxKm`) del mismo país, si la hay. */
export async function knownPlaceNear(lat: number, lon: number, cc: string, maxKm = 25): Promise<KnownPlace | undefined> {
  let best: KnownPlace | undefined
  let bestKm = maxKm
  for (const p of await preloadPlaces()) {
    if (p.cc !== cc || Math.abs(p.lat - lat) > 0.5) continue
    const km = haversine([lon, lat], [p.lon, p.lat])
    if (km <= bestKm) {
      best = p
      bestKm = km
    }
  }
  return best
}
