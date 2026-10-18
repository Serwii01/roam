// Ruta a partir de las fotos del carrete: dónde y cuándo se hizo cada una (EXIF), leído en el navegador.
// Las fotos no se envían a ningún sitio para esto; si luego se suben al viaje, se quitan esos datos (images.ts).
import { clusterByPlace, localDay, quickName, type DraftStop } from './common'

export interface PhotoPoint {
  file: File
  lat?: number
  lon?: number
  /** Momento de la foto (EXIF; si no hay, la fecha del archivo). */
  time: number
  fromExif: boolean
}

type Exifr = Pick<typeof import('exifr'), 'gps' | 'parse'>
let exifr: Promise<Exifr> | null = null
// Se descarga solo al importar fotos.
const loadExifr = () => (exifr ??= import('exifr').then((m) => { const mod = m as unknown as Exifr & { default?: Exifr }; return mod.default ?? mod }))

export async function readPhotos(files: File[], onProgress?: (done: number, total: number) => void): Promise<PhotoPoint[]> {
  const lib = await loadExifr()
  const out: PhotoPoint[] = []
  for (const [i, file] of files.entries()) {
    const [gps, tags] = await Promise.all([
      lib.gps(file).catch(() => undefined),
      lib.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => undefined) as Promise<{ DateTimeOriginal?: Date; CreateDate?: Date } | undefined>,
    ])
    const exifDate = tags?.DateTimeOriginal ?? tags?.CreateDate
    const ok = gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0)
    out.push({
      file,
      lat: ok ? gps.latitude : undefined,
      lon: ok ? gps.longitude : undefined,
      time: exifDate instanceof Date && !Number.isNaN(exifDate.getTime()) ? exifDate.getTime() : file.lastModified,
      fromExif: exifDate instanceof Date,
    })
    onProgress?.(i + 1, files.length)
  }
  return out
}

export interface PhotoRoute {
  stops: (DraftStop & { photos: File[] })[]
  /** Fotos sin ubicación (se reparten por fecha entre las paradas). */
  unplaced: number
  start: string | null
  end: string | null
}

/** Paradas a partir de las fotos con GPS (30 km); las que no lo tienen van a la parada más cercana en el tiempo. */
export async function routeFromPhotos(points: PhotoPoint[]): Promise<PhotoRoute> {
  const placed = points.filter((p): p is PhotoPoint & { lat: number; lon: number } => p.lat !== undefined && p.lon !== undefined)
  const clusters = clusterByPlace(placed, 30)
  const stops = await Promise.all(
    clusters.map(async (c) => {
      const q = await quickName(c.lat, c.lon)
      return {
        name: q?.name ?? `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`,
        countryCode: q?.countryCode,
        lat: c.lat,
        lon: c.lon,
        arrived_on: localDay(c.start),
        photos: c.items.map((x) => x.file),
        start: c.start,
        end: c.end,
        named: !!q,
      }
    }),
  )
  const unplaced = points.filter((p) => p.lat === undefined)
  for (const p of unplaced) {
    if (!stops.length) break
    const best = stops.reduce((a, s) => {
      const d = p.time < s.start ? s.start - p.time : p.time > s.end ? p.time - s.end : 0
      return d < a.d ? { s, d } : a
    }, { s: stops[0], d: Infinity })
    best.s.photos.push(p.file)
  }
  const times = points.map((p) => p.time).sort((a, b) => a - b)
  return {
    stops: stops.map(({ start: _s, end: _e, named: _n, ...s }) => s),
    unplaced: unplaced.length,
    start: times.length ? localDay(times[0]) : null,
    end: times.length ? localDay(times.at(-1)!) : null,
  }
}
