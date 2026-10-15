// Imágenes para compartir al estilo Strava (stories y posts), dibujadas en un canvas en el navegador.
// El mapa sale de las fronteras propias (world.json) y de la ruta: sin teselas externas ni problemas de CORS.
import type { Geometry, Position } from 'geojson'
import { loadWorldShapes } from './countries'
import { bendLine, greatCircle, type LngLat } from './geo'

export type CardFormat = 'story' | 'post' | 'square'
export type CardTheme = 'dark' | 'light' | 'photo' | 'clear'
/** Mapa con la ruta, o lista de momentos en grande (resumen del año, al estilo Wrapped). */
export type CardLayout = 'map' | 'list'

export const FORMATS: Record<CardFormat, { w: number; h: number; label: string; hint: string }> = {
  story: { w: 1080, h: 1920, label: 'Story', hint: '9:16' },
  post: { w: 1080, h: 1350, label: 'Post', hint: '4:5' },
  square: { w: 1080, h: 1080, label: 'Cuadrado', hint: '1:1' },
}

export interface CardStat {
  label: string
  value: string
  unit?: string
}

export interface CardData {
  /** Viaje o año (encuadre en sus rutas), o mapa del mundo entero. */
  kind: 'trip' | 'year' | 'world'
  eyebrow: string
  title: string
  subtitle?: string
  stats: CardStat[]
  /** Tramos de la ruta (cada uno una línea), con vuelo o no. */
  legs: { from: LngLat; to: LngLat; flight: boolean }[]
  stops: LngLat[]
  /** Países resaltados en el mapa. */
  countries: string[]
  /** Foto de fondo para el estilo «Foto». */
  photo?: string
  /** Momentos destacados para el diseño «Cifras». */
  highlights?: { label: string; value: string }[]
}

interface Palette {
  bg: string | null
  land: string | null
  landHi: string | null
  border: string | null
  route: string
  routeShadow: string
  stopFill: string
  stopStroke: string
  text: string
  muted: string
  accent: string
  textShadow: boolean
}

const PALETTES: Record<CardTheme, Palette> = {
  dark: {
    bg: '#111214',
    land: '#24262a',
    landHi: '#4a2416',
    border: '#111214',
    route: '#ff5a1f',
    routeShadow: 'rgba(255,90,31,0.55)',
    stopFill: '#ffffff',
    stopStroke: '#ff5a1f',
    text: '#ffffff',
    muted: '#9a9ca1',
    accent: '#ff5a1f',
    textShadow: false,
  },
  light: {
    bg: '#f9f9fa',
    land: '#e6e6e8',
    landHi: '#ffd2c2',
    border: '#f9f9fa',
    route: '#d53e00',
    routeShadow: 'rgba(213,62,0,0.25)',
    stopFill: '#ffffff',
    stopStroke: '#d53e00',
    text: '#1a1c1d',
    muted: '#5f6368',
    accent: '#d53e00',
    textShadow: false,
  },
  photo: {
    bg: '#111214',
    land: null,
    landHi: null,
    border: null,
    route: '#ffffff',
    routeShadow: 'rgba(0,0,0,0.55)',
    stopFill: '#ff5a1f',
    stopStroke: '#ffffff',
    text: '#ffffff',
    muted: 'rgba(255,255,255,0.8)',
    accent: '#ffffff',
    textShadow: true,
  },
  // Transparente: para pegar como sticker encima de una foto propia (como el de Strava).
  clear: {
    bg: null,
    land: null,
    landHi: null,
    border: null,
    route: '#ff5a1f',
    routeShadow: 'rgba(0,0,0,0.35)',
    stopFill: '#ffffff',
    stopStroke: '#ff5a1f',
    text: '#ffffff',
    muted: 'rgba(255,255,255,0.85)',
    accent: '#ff5a1f',
    textShadow: true,
  },
}

const DISPLAY = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif'
const SANS = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif'

const images = new Map<string, Promise<HTMLImageElement>>()
function loadImage(src: string): Promise<HTMLImageElement> {
  if (!images.has(src)) {
    images.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image()
        // Necesario para poder exportar el canvas con fotos de Storage (que envía cabeceras CORS).
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => {
          images.delete(src)
          reject(new Error('No se pudo cargar la imagen'))
        }
        img.src = src
      }),
    )
  }
  return images.get(src)!
}

/** ¿Se puede usar la foto como fondo? (carga con CORS; si no, el estilo «Foto» no está disponible). */
export const canUsePhoto = (src: string) => loadImage(src).then(() => true, () => false)

// ── Proyección Mercator encajada en un rectángulo ──
const RAD = Math.PI / 180
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * RAD) / 2))

/** Encuadre del mapa del mundo (de Alaska a Nueva Zelanda, sin la Antártida). */
const WORLD = { lon: [-169, 191], lat: [-56, 78] }

interface View {
  x0: number
  y0: number
  scale: number
  rect: { x: number; y: number; w: number; h: number }
  lonMin: number
  lonMax: number
}

function makeView(points: LngLat[], rect: View['rect'], world: boolean): View {
  let minX: number, maxX: number, minY: number, maxY: number
  if (world || !points.length) {
    ;[minX, maxX, minY, maxY] = [WORLD.lon[0] * RAD, WORLD.lon[1] * RAD, mercY(WORLD.lat[0]), mercY(WORLD.lat[1])]
  } else {
    minX = Math.min(...points.map((p) => p[0] * RAD))
    maxX = Math.max(...points.map((p) => p[0] * RAD))
    minY = Math.min(...points.map((p) => mercY(p[1])))
    maxY = Math.max(...points.map((p) => mercY(p[1])))
    // Tamaño mínimo (viaje por una sola ciudad) y margen alrededor de la ruta.
    const min = 0.05
    if (maxX - minX < min) [minX, maxX] = [(minX + maxX) / 2 - min / 2, (minX + maxX) / 2 + min / 2]
    if (maxY - minY < min) [minY, maxY] = [(minY + maxY) / 2 - min / 2, (minY + maxY) / 2 + min / 2]
    const padX = (maxX - minX) * 0.16
    const padY = (maxY - minY) * 0.16
    ;[minX, maxX, minY, maxY] = [minX - padX, maxX + padX, minY - padY, maxY + padY]
  }
  // Se amplía el lado corto para respetar la proporción del rectángulo.
  const aspect = rect.w / rect.h
  const w = maxX - minX
  const h = maxY - minY
  if (w / h < aspect) {
    const nw = h * aspect
    ;[minX, maxX] = [minX - (nw - w) / 2, maxX + (nw - w) / 2]
  } else {
    const nh = w / aspect
    ;[minY, maxY] = [minY - (nh - h) / 2, maxY + (nh - h) / 2]
  }
  return { x0: minX, y0: maxY, scale: rect.w / (maxX - minX), rect, lonMin: minX / RAD, lonMax: maxX / RAD }
}

const project = (v: View, [lon, lat]: LngLat | Position): [number, number] => [
  v.rect.x + (lon * RAD - v.x0) * v.scale,
  v.rect.y + (v.y0 - mercY(lat)) * v.scale,
]

/** Si la ruta cruza el Pacífico, las longitudes negativas pasan a +360 para que quede continua. */
function unwrapper(points: LngLat[]): (pts: LngLat[]) => LngLat[] {
  const lons = points.map((p) => p[0])
  if (!lons.length || Math.max(...lons) - Math.min(...lons) <= 180) return (pts) => pts
  return (pts) => pts.map(([lon, lat]): LngLat => [lon < 0 ? lon + 360 : lon, lat])
}

function drawGeometry(ctx: CanvasRenderingContext2D, v: View, g: Geometry) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  for (const poly of polys) {
    const lons = poly[0].map((p) => p[0])
    const [a, b] = [Math.min(...lons), Math.max(...lons)]
    // Copias desplazadas ±360° cuando el encuadre pasa del antimeridiano.
    for (const off of [-360, 0, 360]) {
      if (b + off < v.lonMin || a + off > v.lonMax) continue
      for (const ring of poly) {
        ring.forEach((p, i) => {
          const [x, y] = project(v, [p[0] + off, p[1]])
          if (i) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        ctx.closePath()
      }
    }
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= maxW || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines)
    let last = keep[maxLines - 1]
    while (ctx.measureText(`${last}…`).width > maxW && last.length) last = last.slice(0, -1)
    keep[maxLines - 1] = `${last.trimEnd()}…`
    return keep
  }
  return lines
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, family = DISPLAY, spacing = 0) {
  ctx.font = `${weight} ${size}px ${family}`
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`
}

let fontsReady: Promise<unknown> | null = null
const loadFonts = () =>
  (fontsReady ??= Promise.all([
    document.fonts.load(`700 80px ${DISPLAY}`),
    document.fonts.load(`600 30px ${DISPLAY}`),
    document.fonts.load(`500 30px ${SANS}`),
  ]).catch(() => {}))

/** Dibuja la tarjeta en el canvas (lo redimensiona al formato). */
export async function renderCard(canvas: HTMLCanvasElement, data: CardData, format: CardFormat, theme: CardTheme, layout: CardLayout = 'map') {
  const list = layout === 'list' && !!data.highlights?.length
  const { w: W, h: H } = FORMATS[format]
  const P = PALETTES[theme]
  const [shapes, photo] = await Promise.all([
    !list && (theme === 'dark' || theme === 'light') ? loadWorldShapes() : null,
    theme === 'photo' && data.photo ? loadImage(data.photo).catch(() => null) : null,
    loadFonts(),
  ])
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  const pad = 80
  const story = format === 'story'

  // ── Fondo ──
  if (P.bg) {
    ctx.fillStyle = P.bg
    ctx.fillRect(0, 0, W, H)
  }
  if (photo) {
    const s = Math.max(W / photo.width, H / photo.height)
    ctx.drawImage(photo, (W - photo.width * s) / 2, (H - photo.height * s) / 2, photo.width * s, photo.height * s)
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.45)
    top.addColorStop(0, 'rgba(0,0,0,0.72)')
    top.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = top
    ctx.fillRect(0, 0, W, H * 0.45)
    const bottom = ctx.createLinearGradient(0, H * 0.5, 0, H)
    bottom.addColorStop(0, 'rgba(0,0,0,0)')
    bottom.addColorStop(1, 'rgba(0,0,0,0.82)')
    ctx.fillStyle = bottom
    ctx.fillRect(0, H * 0.5, W, H * 0.5)
  } else if (theme === 'dark' || theme === 'light') {
    // Retícula de puntos, como en el resto de la app.
    ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
    for (let y = 24; y < H; y += 36) for (let x = 24; x < W; x += 36) ctx.fillRect(x, y, 2.5, 2.5)
  }
  const shadow = (on: boolean) => {
    ctx.shadowColor = on && P.textShadow ? 'rgba(0,0,0,0.35)' : 'transparent'
    ctx.shadowBlur = on && P.textShadow ? 10 : 0
    ctx.shadowOffsetY = on && P.textShadow ? 2 : 0
  }

  // ── Cabecera: marca y antetítulo ──
  shadow(true)
  let y = pad + 40
  try {
    const logo = await loadImage('/favicon.svg')
    ctx.drawImage(logo, pad, y - 44, 56, 56)
  } catch {
    /* sin logo */
  }
  ctx.fillStyle = P.text
  setFont(ctx, 700, 40, DISPLAY, 1)
  ctx.textAlign = 'left'
  ctx.fillText('ROAM', pad + 72, y)
  ctx.fillStyle = P.accent
  setFont(ctx, 600, 24, DISPLAY, 4)
  ctx.textAlign = 'right'
  ctx.fillText(data.eyebrow.toUpperCase(), W - pad, y - 8)
  ctx.textAlign = 'left'

  // ── Título ──
  y += story ? 130 : 100
  const titleSize = story ? 96 : format === 'post' ? 80 : 68
  setFont(ctx, 700, titleSize, DISPLAY, -2)
  ctx.fillStyle = P.text
  const titleLines = wrapLines(ctx, data.title.toUpperCase(), W - pad * 2, story ? 3 : 2)
  for (const l of titleLines) {
    ctx.fillText(l, pad, y)
    y += titleSize * 1.02
  }
  if (data.subtitle) {
    y += 6
    setFont(ctx, 500, story ? 34 : 30, SANS)
    ctx.fillStyle = P.muted
    for (const l of wrapLines(ctx, data.subtitle, W - pad * 2, 2)) {
      ctx.fillText(l, pad, y)
      y += story ? 46 : 40
    }
  }
  shadow(false)

  // ── Estadísticas (abajo) ──
  const stats = data.stats.slice(0, 4)
  const grid = story && stats.length > 3
  const cols = grid ? 2 : stats.length
  const rows = grid ? Math.ceil(stats.length / 2) : 1
  const valueSize = story ? 104 : format === 'post' ? 84 : 72
  const rowH = valueSize + 70
  const footer = 70
  const statsTop = H - pad - footer - rows * rowH
  const colW = (W - pad * 2) / cols
  shadow(true)
  stats.forEach((s, i) => {
    const cx = pad + (i % cols) * colW
    const cy = statsTop + Math.floor(i / cols) * rowH
    setFont(ctx, 600, story ? 26 : 22, DISPLAY, 4)
    ctx.fillStyle = P.muted
    ctx.fillText(s.label.toUpperCase(), cx, cy + 28)
    // La cifra (y su unidad) se encoge si no cabe en la columna.
    let size = valueSize
    const widthAt = (px: number) => {
      setFont(ctx, 600, px * 0.34, DISPLAY, 1)
      const uw = s.unit ? ctx.measureText(s.unit).width + 10 : 0
      setFont(ctx, 700, px, DISPLAY, -2)
      return ctx.measureText(s.value).width + uw
    }
    while (size > 36 && widthAt(size) > colW - 24) size -= 4
    const base = cy + 28 + valueSize * 0.95
    setFont(ctx, 700, size, DISPLAY, -2)
    ctx.fillStyle = P.text
    ctx.fillText(s.value, cx, base)
    if (s.unit) {
      const vw = ctx.measureText(s.value).width
      setFont(ctx, 600, size * 0.34, DISPLAY, 1)
      ctx.fillStyle = P.accent
      ctx.fillText(s.unit, cx + vw + 10, base)
    }
  })
  // Pie: dirección de la app.
  setFont(ctx, 600, 22, DISPLAY, 4)
  ctx.fillStyle = P.muted
  ctx.fillText(location.host.toUpperCase(), pad, H - pad + 6)
  ctx.textAlign = 'right'
  ctx.fillText('KINETIC TRAVEL TRACKER', W - pad, H - pad + 6)
  ctx.textAlign = 'left'
  shadow(false)

  // ── Mapa (entre el título y las estadísticas) ──
  const mapTop = y + (story ? 50 : 30)
  const rect = { x: pad - 20, y: mapTop, w: W - (pad - 20) * 2, h: Math.max(160, statsTop - mapTop - (story ? 60 : 40)) }
  if (list) {
    drawHighlights(ctx, data.highlights!, { x: pad, y: mapTop, w: W - pad * 2, h: rect.h }, P, story, shadow)
    return
  }
  if (data.kind === 'world') {
    // El mundo entero tiene su proporción: sin estirarlo ni enseñar la Antártida, centrado en el hueco.
    const natural = (WORLD.lon[1] - WORLD.lon[0]) * RAD / (mercY(WORLD.lat[1]) - mercY(WORLD.lat[0]))
    const h = Math.min(rect.h, rect.w / natural)
    rect.y += (rect.h - h) / 2
    rect.h = h
  }
  const legs = data.legs.map((l) => (l.flight ? greatCircle(l.from, l.to) : bendLine(l.from, l.to)))
  const fix = data.kind === 'world' ? (pts: LngLat[]) => pts : unwrapper([...legs.flat(), ...data.stops])
  const v = makeView(fix([...legs.flat(), ...data.stops]), rect, data.kind === 'world')

  if (shapes && P.land) {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 24)
    ctx.clip()
    const hi = new Set(data.countries)
    for (const f of shapes.features) {
      ctx.beginPath()
      drawGeometry(ctx, v, f.geometry)
      ctx.fillStyle = hi.has(f.properties.code) ? P.landHi! : P.land
      ctx.fill('evenodd')
      ctx.strokeStyle = P.border!
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    // Bordes difuminados hacia el fondo, en vez de un corte seco.
    const fade = 90
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, P.bg!)
      g.addColorStop(1, `${P.bg!}00`)
      ctx.fillStyle = g
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || rect.w, Math.abs(y1 - y0) || rect.h)
    }
    edge(rect.x, rect.y, rect.x + fade, rect.y)
    edge(rect.x + rect.w, rect.y, rect.x + rect.w - fade, rect.y)
    edge(rect.x, rect.y, rect.x, rect.y + fade)
    edge(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - fade)
    ctx.restore()
  }

  // Ruta con halo; los vuelos, discontinuos.
  const lw = data.kind === 'world' ? 4 : data.kind === 'year' ? (story ? 7 : 6) : story ? 11 : 9
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  legs.forEach((pts, i) => {
    ctx.beginPath()
    fix(pts).forEach((p, j) => {
      const [x, yy] = project(v, p)
      if (j) ctx.lineTo(x, yy)
      else ctx.moveTo(x, yy)
    })
    ctx.setLineDash(data.legs[i].flight ? [lw * 1.6, lw * 1.4] : [])
    ctx.shadowColor = P.routeShadow
    ctx.shadowBlur = lw * 2.2
    ctx.strokeStyle = P.route
    ctx.lineWidth = lw
    ctx.stroke()
  })
  ctx.restore()

  // Paradas: la primera y la última, más grandes.
  const stops = fix(data.stops)
  const r = data.kind === 'world' ? 5 : data.kind === 'year' ? 8 : story ? 13 : 11
  stops.forEach((p, i) => {
    const [x, yy] = project(v, p)
    const big = data.kind === 'trip' && (i === 0 || i === stops.length - 1)
    ctx.beginPath()
    ctx.arc(x, yy, big ? r * 1.35 : r, 0, Math.PI * 2)
    ctx.fillStyle = big ? P.stopStroke : P.stopFill
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = 8
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = r * 0.45
    ctx.strokeStyle = big ? P.stopFill : P.stopStroke
    ctx.stroke()
  })
}

/** Lista de momentos: etiqueta pequeña y valor grande, con una línea fina entre filas. */
function drawHighlights(
  ctx: CanvasRenderingContext2D,
  items: { label: string; value: string }[],
  box: { x: number; y: number; w: number; h: number },
  P: Palette,
  story: boolean,
  shadow: (on: boolean) => void,
) {
  const rows = items.slice(0, story ? 6 : 4)
  const rowH = Math.min(story ? 150 : 120, box.h / rows.length)
  const top = box.y + (box.h - rowH * rows.length) / 2
  rows.forEach((it, i) => {
    const y = top + i * rowH
    if (i > 0) {
      ctx.fillStyle = P.textShadow ? 'rgba(255,255,255,0.25)' : P.muted
      ctx.globalAlpha = P.textShadow ? 1 : 0.25
      ctx.fillRect(box.x, y, box.w, 2)
      ctx.globalAlpha = 1
    }
    shadow(true)
    setFont(ctx, 600, story ? 24 : 21, DISPLAY, 4)
    ctx.fillStyle = P.accent
    ctx.fillText(it.label.toUpperCase(), box.x, y + rowH * 0.36)
    let size = Math.round(rowH * 0.4)
    setFont(ctx, 700, size, DISPLAY, -1)
    while (size > 28 && ctx.measureText(it.value).width > box.w) {
      size -= 2
      setFont(ctx, 700, size, DISPLAY, -1)
    }
    ctx.fillStyle = P.text
    ctx.fillText(it.value, box.x, y + rowH * 0.36 + size * 1.1)
    shadow(false)
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'))
}
