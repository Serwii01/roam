// «Revive tu viaje»: la ruta como una línea de tiempo. Cada momento se calcula a partir del segundo en el que se está
// (replayFrame), sin animaciones encadenadas: así se puede pausar y saltar a cualquier punto.
import type { Photo, Stop, TripWithStops } from './db'
import { isReturnHome } from './days'
import { bendLine, bounds, greatCircle, type LngLat } from './geo'
import { legKm, legLine, type AirportMap } from './stats'

export type SceneKind = 'intro' | 'leg' | 'stop' | 'album' | 'outro'

export interface ReplayScene {
  kind: SceneKind
  /** Segundo en el que empieza y cuánto dura. */
  at: number
  duration: number
  /** Parada a la que se refiere: el destino en un tramo; en la intro, la primera; al final, la última. */
  stop: number
  /** Fotos que salen en esta parada. */
  photos: Photo[]
  /** Primera entrada en un país: cae el sello. */
  stamp: boolean
  /** Tramo que se recorre, sus km y los que se llevan antes de empezarlo. */
  line: LngLat[]
  km: number
  kmBefore: number
}

export interface Replay {
  scenes: ReplayScene[]
  duration: number
  km: number
  overview: { center: LngLat; zoom: number }
}

export interface ReplayFrame {
  /** Índice de la escena y cuánto lleva (0-1). */
  scene: number
  progress: number
  center: LngLat
  zoom: number
  pitch: number
  km: number
  /** Punta de la ruta, y lo recorrido hasta ahora. */
  head: LngLat
  lines: LngLat[][]
  /** Paradas a las que ya se ha llegado. */
  reached: number
}

const INTRO = 3
const OUTRO = 5
const PHOTO = 1.8
const STOP_ZOOM = 7
const STOP_PITCH = 40

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const ease = (f: number) => (f < 0.5 ? 4 * f ** 3 : 1 - (-2 * f + 2) ** 3 / 2)
const at = (s: Stop): LngLat => [s.lon, s.lat]

/** El punto a esa fracción de una línea. */
function pointAt(line: LngLat[], f: number): LngLat {
  const pos = clamp(f, 0, 1) * (line.length - 1)
  const i = Math.min(Math.floor(pos), line.length - 2)
  const k = pos - i
  return [lerp(line[i][0], line[i + 1][0], k), lerp(line[i][1], line[i + 1][1], k)]
}

/** La línea desde el principio hasta esa fracción. */
function lineTo(line: LngLat[], f: number): LngLat[] {
  const end = clamp(f, 0, 1) * (line.length - 1)
  return [...line.slice(0, Math.floor(end) + 1), pointAt(line, f)]
}

function legPath(stops: Stop[], i: number): LngLat[] {
  const [a, b] = legLine(stops, i)
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) return [a, b]
  return stops[i].transport_in === 'plane' ? greatCircle(a, b) : bendLine(a, b)
}

/** Con muchas paradas, menos fotos en cada una: que dure un par de minutos como mucho. */
const photosPerStop = (stops: number) => (stops > 12 ? 1 : stops > 6 ? 2 : 3)

/** `width`: ancho de la pantalla, para que en el móvil quepa toda la ruta en la vista general. */
export function buildReplay(t: TripWithStops, airports: AirportMap, width: number): Replay {
  const stops = t.stops
  const scenes: ReplayScene[] = []
  const most = photosPerStop(stops.length)
  const origin = stops[0]?.country_code
  const seen = new Set<string>()
  let clock = 0
  let km = 0
  const push = (s: Omit<ReplayScene, 'at'>) => {
    scenes.push({ ...s, at: clock })
    clock += s.duration
  }
  const empty = { photos: [], stamp: false, line: [], km: 0 }

  push({ ...empty, kind: 'intro', duration: INTRO, stop: 0, kmBefore: 0 })
  stops.forEach((s, i) => {
    if (i > 0) {
      const legLength = legKm(stops, i, airports)
      push({ ...empty, kind: 'leg', duration: clamp(1.6 + legLength / 1800, 2, 5.5), stop: i, line: legPath(stops, i), km: legLength, kmBefore: km })
      km += legLength
    }
    const photos = t.photos.filter((p) => p.stop_id === s.id).slice(0, most)
    const stamp = s.country_code !== origin && !seen.has(s.country_code)
    seen.add(s.country_code)
    const quick = (i === 0 || isReturnHome(stops, i)) && !photos.length
    push({ ...empty, kind: 'stop', duration: quick ? 1.5 : 2.4 + photos.length * PHOTO, stop: i, photos, stamp, kmBefore: km })
  })
  // Las fotos sin parada no se pueden colocar en el mapa: salen juntas antes de terminar.
  const loose = t.photos.filter((p) => !p.stop_id).slice(0, 6)
  if (loose.length) push({ ...empty, kind: 'album', duration: loose.length * PHOTO, stop: stops.length - 1, photos: loose, kmBefore: km })
  push({ ...empty, kind: 'outro', duration: OUTRO, stop: stops.length - 1, kmBefore: km })

  const box = bounds(stops.map(at))
  const span = box ? Math.max(box[1][0] - box[0][0], (box[1][1] - box[0][1]) * 2) : 0
  return {
    scenes,
    duration: clock,
    km,
    overview: {
      center: box ? [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2] : [0, 20],
      zoom: (span > 120 ? 1.5 : span > 40 ? 2.2 : span > 10 ? 3.2 : 4.5) + Math.min(0, Math.log2(width / 800)),
    },
  }
}

/**
 * Qué se ve en el segundo `time`. Con `calm` (quien pide menos movimiento en su dispositivo) la cámara no se mueve:
 * se queda en la vista general y solo avanza la ruta.
 */
export function replayFrame(r: Replay, stops: Stop[], time: number, calm = false): ReplayFrame {
  const t = clamp(time, 0, r.duration)
  const scene = Math.max(0, r.scenes.findLastIndex((s) => s.at <= t))
  const s = r.scenes[scene]
  const progress = s.duration ? clamp((t - s.at) / s.duration, 0, 1) : 1
  const here = stops[s.stop]
  const stopView = { center: at(here), zoom: STOP_ZOOM, pitch: STOP_PITCH }
  let view = stopView
  let head = at(here)
  let km = s.kmBefore
  const lines: LngLat[][] = r.scenes.filter((x, i) => x.kind === 'leg' && i < scene).map((x) => x.line)

  if (s.kind === 'album') view = { center: r.overview.center, zoom: r.overview.zoom, pitch: 0 }
  else if (s.kind === 'intro' || s.kind === 'outro') {
    // Intro: un momento quieto en la vista general y baja a la primera parada. Final: sube a la vista general.
    const afterAlbum = r.scenes[scene - 1]?.kind === 'album'
    const f = s.kind === 'intro' ? ease(clamp((progress - 0.45) / 0.55, 0, 1)) : afterAlbum ? 0 : 1 - ease(clamp(progress / 0.6, 0, 1))
    view = {
      center: [lerp(r.overview.center[0], stopView.center[0], f), lerp(r.overview.center[1], stopView.center[1], f)],
      zoom: lerp(r.overview.zoom, STOP_ZOOM, f),
      pitch: lerp(0, STOP_PITCH, f),
    }
  } else if (s.kind === 'leg') {
    const f = ease(progress)
    head = pointAt(s.line, f)
    km = s.kmBefore + s.km * f
    lines.push(lineTo(s.line, f))
    // Sube en mitad del tramo tanto como haga falta para ver de dónde se sale y adónde se llega.
    const cruise = clamp(Math.log2(24000 / Math.max(s.km, 1)), 1.6, STOP_ZOOM)
    const arc = Math.sin(Math.PI * progress)
    view = { center: head, zoom: lerp(STOP_ZOOM, cruise, arc), pitch: lerp(STOP_PITCH, 0, arc) }
  }

  return {
    scene,
    progress,
    center: calm ? r.overview.center : view.center,
    zoom: calm ? r.overview.zoom : view.zoom,
    pitch: calm ? 0 : view.pitch,
    km,
    head,
    lines,
    reached: s.kind === 'leg' ? s.stop : s.stop + 1,
  }
}
