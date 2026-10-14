// Índice de aeropuertos en memoria para búsquedas instantáneas (sin ida y vuelta al servidor en cada
// pulsación). Se carga una vez desde /data/airports.json, la misma referencia que hay en la base de datos.
import type { Airport } from './db'
import { haversine } from './geo'

interface Entry {
  a: Airport
  iata: string
  city: string
  name: string
  rank: number
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const SIZE_RANK = { large: 0, medium: 1, small: 2 } as const

/** Aeropuerto principal en ciudades con varios: va primero en la búsqueda y al proponer el más cercano. */
const HUBS = new Set(
  'LHR CDG JFK FCO HND PEK SVO IST MXP GRU EZE ORD IAD ICN DXB BKK ARN OSL CPH MAD BCN LIS AMS FRA MUC ZRH VIE BRU DUB YYZ YUL LAX SFO MIA ATL DFW SYD MEL AKL JNB CAI DEL BOM SIN HKG TPE KUL CGK MNL SGN HAN MEX BOG LIM SCL GIG KEF TLV DOH WAW PRG BUD ATH'.split(' '),
)

/** Nombres en español de ciudades que OurAirports guarda en inglés (o en el idioma local). */
const ES_CITY: Record<string, string> = {
  reikiavik: 'reykjavik', londres: 'london', 'nueva york': 'new york', pekin: 'beijing', tokio: 'tokyo', kioto: 'kyoto',
  moscu: 'moscow', 'san petersburgo': 'saint petersburg', atenas: 'athens', estambul: 'istanbul', esmirna: 'izmir',
  bruselas: 'brussels', ginebra: 'geneva', basilea: 'basel', berna: 'bern', francfort: 'frankfurt', colonia: 'cologne',
  hamburgo: 'hamburg', copenhague: 'copenhagen', estocolmo: 'stockholm', varsovia: 'warsaw', cracovia: 'krakow',
  praga: 'prague', viena: 'vienna', bucarest: 'bucharest', belgrado: 'belgrade', lisboa: 'lisbon', oporto: 'porto',
  roma: 'rome', venecia: 'venice', florencia: 'florence', napoles: 'naples', burdeos: 'bordeaux', marsella: 'marseille',
  niza: 'nice', edimburgo: 'edinburgh', 'el cairo': 'cairo', 'ciudad del cabo': 'cape town', bombay: 'mumbai',
  'nueva delhi': 'delhi', seul: 'seoul', singapur: 'singapore', sidney: 'sydney', yakarta: 'jakarta',
  'nueva orleans': 'new orleans', filadelfia: 'philadelphia', 'ciudad de mexico': 'mexico city', 'la habana': 'havana',
  tanger: 'tangier', tunez: 'tunis', argel: 'algiers', jerusalen: 'jerusalem', 'ciudad de panama': 'panama city',
  'ciudad de guatemala': 'guatemala city',
}

let index: Promise<Entry[]> | null = null

/** Descarga y prepara el índice (idempotente). Llamarlo pronto lo deja listo antes de la primera búsqueda. */
export function preloadAirports(): Promise<Entry[]> {
  index ??= fetch('/data/airports.json')
    .then((r) => r.json() as Promise<{ cols: string[]; rows: unknown[][] }>)
    .then((t) =>
      t.rows.map((row) => {
        const a = Object.fromEntries(t.cols.map((c, i) => [c, row[i]])) as unknown as Airport
        return { a, iata: a.iata.toLowerCase(), city: fold(a.city ?? ''), name: fold(a.name), rank: HUBS.has(a.iata) ? -1 : SIZE_RANK[a.size] }
      }),
    )
    .catch((e) => {
      index = null
      throw e
    })
  return index
}

/**
 * Busca por código IATA, ciudad o nombre, sin distinguir tildes. Orden: IATA exacto, IATA que empieza,
 * ciudad que empieza, nombre que contiene palabra que empieza, resto; a igualdad, aeropuertos grandes primero.
 */
export async function searchAirportsLocal(q: string, limit = 8): Promise<Airport[]> {
  const s = fold(q.trim())
  if (!s) return []
  // Si el texto es el principio de un nombre en español conocido, se busca también su equivalente.
  const terms = [s, ...(s.length >= 3 ? Object.entries(ES_CITY).filter(([es]) => es.startsWith(s)).map(([, en]) => en) : [])]
  const all = await preloadAirports()
  const scored: { e: Entry; score: number }[] = []
  const scoreFor = (e: Entry, t: string) => {
    if (e.iata === t) return 0
    if (t.length <= 3 && e.iata.startsWith(t)) return 1
    if (e.city.startsWith(t)) return 2
    if (e.name.split(/[\s–\-/]+/).some((w) => w.startsWith(t))) return 3
    if (t.length >= 3 && (e.city.includes(t) || e.name.includes(t))) return 4
    return -1
  }
  for (const e of all) {
    const best = Math.min(...terms.map((t) => scoreFor(e, t)).filter((x) => x >= 0))
    if (Number.isFinite(best)) scored.push({ e, score: best * 10 + e.rank })
  }
  return scored
    .sort((x, y) => x.score - y.score)
    .slice(0, limit)
    .map((x) => x.e.a)
}

/** Aeropuerto principal más cercano (misma puntuación que la función SQL `nearest_airports`). */
export async function nearestAirportLocal(lat: number, lon: number, maxKm = 150): Promise<string | undefined> {
  let best: Airport | undefined
  let bestScore = Infinity
  for (const { a } of await preloadAirports()) {
    if (Math.abs(a.lat - lat) > maxKm / 111) continue
    const km = haversine([lon, lat], [a.lon, a.lat])
    const score = km + (HUBS.has(a.iata) ? -25 : a.size === 'large' ? 0 : a.size === 'medium' ? 40 : 80)
    if (km <= maxKm && score < bestScore) {
      best = a
      bestScore = score
    }
  }
  return best?.iata
}
