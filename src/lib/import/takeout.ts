// Viajes a partir del historial de ubicaciones de Google Maps (Cronología). Todo se procesa en el navegador:
// el archivo no se sube a ningún sitio; solo se guardan los viajes que el usuario elige.
// Formatos admitidos:
//  - Takeout clásico: «Semantic Location History/AAAA/AAAA_MES.json» (timelineObjects), suelto o en el .zip.
//  - Android (2024+, cronología en el móvil): Timeline.json (semanticSegments).
//  - iPhone: location-history.json (lista de segmentos con «geo:lat,lon»).
import type { TransportMode } from '../db'
import { haversine } from '../geo'
import { clusterByPlace, localDay, quickName, type DraftStop } from './common'

interface Visit {
  lat: number
  lon: number
  start: number
  end: number
}
interface Move {
  start: number
  end: number
  mode: TransportMode | null
}

export interface DetectedTrip {
  id: string
  start: string
  end: string
  stops: DraftStop[]
  /** Países (los que se conocen sin conexión). */
  countries: string[]
  km: number
  /** Distancia máxima a casa, para ordenar por «lo lejos que fue». */
  farKm: number
}

const MODES: [RegExp, TransportMode][] = [
  [/fly|flight|plane/, 'plane'],
  [/train|subway|tram|rail|metro/, 'train'],
  [/bus|coach/, 'bus'],
  [/ferry|boat|sail/, 'boat'],
  [/cycl|bike|bicycl/, 'bike'],
  [/walk|run|foot|hik/, 'walk'],
  [/vehicle|car|driv|taxi|motor/, 'car'],
]
const modeOf = (type?: string): TransportMode | null => {
  const t = (type ?? '').toLowerCase().replace(/[_\s]+/g, ' ')
  return MODES.find(([re]) => re.test(t))?.[1] ?? null
}
const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN)
/** «41.3851°, 2.1734°» o «geo:41.3851,2.1734» → [lat, lon] */
function latLng(v: unknown): [number, number] | null {
  if (typeof v !== 'string') return null
  const m = v.match(/(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Extrae visitas y desplazamientos de un JSON de cualquiera de los formatos (los demás se ignoran). */
export function parseLocationJson(json: unknown, visits: Visit[], moves: Move[]) {
  const push = (lat: number, lon: number, start: number, end: number) => {
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(start)) visits.push({ lat, lon, start, end: Number.isFinite(end) ? end : start })
  }
  // Los formatos de Google no tienen tipos publicados: se leen de forma defensiva.
  type Any = Record<string, any>
  const o = json as Any
  // Takeout clásico
  if (Array.isArray(o?.timelineObjects)) {
    for (const t of o.timelineObjects as Any[]) {
      if (t.placeVisit) {
        const l = t.placeVisit.location ?? {}
        const d = t.placeVisit.duration ?? {}
        push(l.latitudeE7 / 1e7, l.longitudeE7 / 1e7, time(d.startTimestamp ?? Number(d.startTimestampMs)), time(d.endTimestamp ?? Number(d.endTimestampMs)))
      } else if (t.activitySegment) {
        const d = t.activitySegment.duration ?? {}
        moves.push({ start: time(d.startTimestamp ?? Number(d.startTimestampMs)), end: time(d.endTimestamp ?? Number(d.endTimestampMs)), mode: modeOf(t.activitySegment.activityType) })
      }
    }
    return
  }
  // Android (Timeline.json) o iPhone (lista)
  const segments: Any[] = Array.isArray(o?.semanticSegments) ? o.semanticSegments : Array.isArray(o) ? o : []
  for (const s of segments) {
    const start = time(s.startTime)
    const end = time(s.endTime)
    if (s.visit) {
      const pl = s.visit.topCandidate?.placeLocation
      const ll = latLng(typeof pl === 'string' ? pl : pl?.latLng)
      if (ll) push(ll[0], ll[1], start, end)
    } else if (s.activity) {
      moves.push({ start, end, mode: modeOf(s.activity.topCandidate?.type) })
    }
  }
}

/** Lee los archivos elegidos (JSON sueltos o el .zip de Takeout) y devuelve visitas y desplazamientos. */
export async function readLocationFiles(files: File[], onProgress?: (msg: string) => void): Promise<{ visits: Visit[]; moves: Move[] }> {
  const visits: Visit[] = []
  const moves: Move[] = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      onProgress?.(`Descomprimiendo ${f.name}…`)
      const { unzipSync, strFromU8 } = await import('fflate')
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
        // Solo los archivos de la cronología (el .zip de Takeout puede traer mucho más).
        filter: (e) => /\.json$/i.test(e.name) && /(Semantic Location History|Timeline|location-history|Cronolog|Historial)/i.test(e.name) && !/Records\.json$/i.test(e.name),
      })
      for (const [name, data] of Object.entries(entries)) {
        onProgress?.(`Leyendo ${name.split('/').pop()}…`)
        try {
          parseLocationJson(JSON.parse(strFromU8(data)), visits, moves)
        } catch {
          /* archivo que no es de la cronología */
        }
      }
    } else {
      onProgress?.(`Leyendo ${f.name}…`)
      parseLocationJson(JSON.parse(await f.text()), visits, moves)
    }
  }
  return { visits: visits.sort((a, b) => a.start - b.start), moves: moves.sort((a, b) => a.start - b.start) }
}

const DAY = 86_400_000

/** Casa: la zona (~20 km) donde más tiempo se pasa. */
function findHome(visits: Visit[]) {
  const cells = new Map<string, { t: number; lat: number; lon: number; n: number }>()
  for (const v of visits) {
    const key = `${Math.round(v.lat * 5)},${Math.round(v.lon * 5)}`
    const c = cells.get(key) ?? { t: 0, lat: 0, lon: 0, n: 0 }
    c.t += Math.min(v.end - v.start, 2 * DAY)
    c.lat += v.lat
    c.lon += v.lon
    c.n++
    cells.set(key, c)
  }
  const best = [...cells.values()].sort((a, b) => b.t - a.t)[0]
  return best ? { lat: best.lat / best.n, lon: best.lon / best.n } : null
}

/**
 * Viajes: tramos en los que se está a más de `awayKm` de casa, cerrados al volver a casa al menos unas horas
 * o tras 4 días sin datos. Se descartan escapadas de menos de un día que no pasen de 250 km.
 */
export async function detectTrips(visits: Visit[], moves: Move[], awayKm = 80): Promise<{ trips: DetectedTrip[]; home: { lat: number; lon: number } | null }> {
  const home = findHome(visits)
  if (!home) return { trips: [], home: null }
  const dist = (v: { lat: number; lon: number }) => haversine([home.lon, home.lat], [v.lon, v.lat])
  // Cada tramo fuera guarda cuándo se salió de casa y cuándo se volvió, para encontrar el transporte de
  // la ida y la vuelta (el vuelo de ida ocurre antes de la primera visita fuera).
  type Run = { visits: Visit[]; depart: number; back: number | null }
  const runs: Run[] = []
  let cur: Run | null = null
  let lastHomeEnd: number | null = null
  for (const v of visits) {
    const away = dist(v) > awayKm
    if (away) {
      if (cur && v.start - cur.visits.at(-1)!.end > 4 * DAY) {
        runs.push(cur)
        cur = null
      }
      cur ??= { visits: [], depart: lastHomeEnd !== null && v.start - lastHomeEnd < 2 * DAY ? lastHomeEnd : v.start - 6 * 3_600_000, back: null }
      cur.visits.push(v)
    } else {
      if (cur && v.end - v.start > 3 * 3_600_000) {
        cur.back = v.start
        runs.push(cur)
        cur = null
      }
      lastHomeEnd = v.end
    }
  }
  if (cur) runs.push(cur)

  const homeName = await quickName(home.lat, home.lon)
  const trips: DetectedTrip[] = []
  for (const { visits: run, depart, back } of runs) {
    const start = run[0].start
    const end = run.at(-1)!.end
    const farKm = Math.max(...run.map(dist))
    if (end - start < DAY && farKm < 250) continue
    const clusters = clusterByPlace(
      run.map((v) => ({ ...v, time: v.start })),
      30,
    )
    // Transporte de cada tramo: el desplazamiento más largo registrado entre una parada y la siguiente.
    const legMode = (from: number, to: number): TransportMode | null => {
      const between = moves.filter((m) => m.start >= from - 3_600_000 && m.end <= to + 3_600_000 && m.mode)
      if (between.some((m) => m.mode === 'plane')) return 'plane'
      return between.sort((a, b) => b.end - b.start - (a.end - a.start))[0]?.mode ?? null
    }
    const homeStop = (t: number): DraftStop => ({ name: homeName?.name ?? 'Casa', countryCode: homeName?.countryCode, lat: home.lat, lon: home.lon, arrived_on: localDay(t) })
    const stops: DraftStop[] = [homeStop(start)]
    let prevEnd = depart
    for (const c of clusters) {
      const q = await quickName(c.lat, c.lon)
      stops.push({
        name: q?.name ?? `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`,
        countryCode: q?.countryCode,
        lat: c.lat,
        lon: c.lon,
        arrived_on: localDay(c.start),
        transport: legMode(prevEnd, c.start),
      })
      prevEnd = c.end
    }
    stops.push({ ...homeStop(back ?? end), transport: legMode(prevEnd, back ?? prevEnd + 2 * DAY) })
    let km = 0
    for (let i = 1; i < stops.length; i++) km += haversine([stops[i - 1].lon, stops[i - 1].lat], [stops[i].lon, stops[i].lat])
    trips.push({
      id: `${start}`,
      start: localDay(start),
      end: localDay(end),
      stops,
      countries: [...new Set(stops.slice(1, -1).map((s) => s.countryCode).filter((c): c is string => !!c))],
      km,
      farKm,
    })
  }
  return { trips: trips.reverse(), home }
}
