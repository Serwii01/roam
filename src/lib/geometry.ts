// Geometría de polígonos para MapLibre. Sin dependencias: la usan la app y scripts/build-data.mjs.
import type { Geometry } from 'geojson'

type Ring = [number, number][]

/** Área con signo de un anillo en grados (positiva = antihorario). */
function ringArea(ring: Ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return a / 2
}

/** Recorta un anillo cerrado al semiplano x ≤ limit (o x ≥ limit). Sutherland–Hodgman. */
function clipX(ring: Ring, limit: number, keepLeft: boolean): Ring {
  const inside = (p: [number, number]) => (keepLeft ? p[0] <= limit : p[0] >= limit)
  const cut = (a: [number, number], b: [number, number]): [number, number] => [limit, a[1] + ((b[1] - a[1]) * (limit - a[0])) / (b[0] - a[0])]
  const out: Ring = []
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    if (inside(a)) {
      out.push(a)
      if (!inside(b)) out.push(cut(a, b))
    } else if (inside(b)) out.push(cut(a, b))
  }
  if (out.length) out.push(out[0])
  return out
}

/**
 * Algunos anillos de world-atlas (Rusia, Fiyi, Antártida) saltan de +180° a −180° dentro del mismo
 * polígono. MapLibre los dibuja cruzando todo el mapa y aparecen cuñas grises sobre el mar.
 * Se desenrollan a longitud continua, se cierran por el polo si lo rodean y se parten en el antimeridiano.
 */
function splitAntimeridian(ring: Ring): Ring[] {
  let jumps = 0
  for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) jumps++
  if (!jumps) return [ring]
  const out: Ring = [ring[0]]
  for (let i = 1; i < ring.length; i++) {
    let x = ring[i][0]
    const prev = out[i - 1][0]
    while (x - prev > 180) x -= 360
    while (x - prev < -180) x += 360
    out.push([x, ring[i][1]])
  }
  if (jumps % 2 === 1) {
    // Rodea un polo: se cierra bajando (o subiendo) por el borde del mapa.
    const pole = out.reduce((a, p) => a + p[1], 0) / out.length < 0 ? -85 : 85
    out.push([out.at(-1)![0], pole], [out[0][0], pole], out[0])
  }
  const pieces: Ring[] = []
  for (const shift of [-360, 0, 360]) {
    const moved = out.map(([x, y]) => [x + shift, y] as [number, number])
    const piece = clipX(clipX(moved, -180, false), 180, true)
    if (piece.length >= 4 && Math.abs(ringArea(piece)) > 1e-6) pieces.push(piece)
  }
  return pieces
}

/**
 * Normaliza la geometría para MapLibre: parte los anillos que cruzan el antimeridiano, recorta la
 * latitud a ±85° (límite de Mercator) y orienta los anillos según RFC 7946 (exterior antihorario).
 */
export function normalizeGeometry(g: Geometry): Geometry {
  const polys = g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : null
  if (!polys) return g
  const orient = (ring: Ring, exterior: boolean) => {
    const ccw = ringArea(ring) > 0
    return exterior !== ccw ? [...ring].reverse() : ring
  }
  const clampRing = (ring: Ring): Ring => ring.map(([x, y]) => [x, Math.max(-85, Math.min(85, y))])
  const result: Ring[][] = []
  for (const [outer, ...holes] of polys) {
    const parts = splitAntimeridian(outer)
    if (parts.length === 1 && parts[0] === outer) {
      result.push([orient(clampRing(outer), true), ...holes.map((h) => orient(clampRing(h), false))])
    } else {
      // Polígono partido: cada trozo pasa a ser un polígono propio (los huecos se descartan: no hay en estos casos).
      for (const p of parts) result.push([orient(clampRing(p), true)])
    }
  }
  return { type: 'MultiPolygon', coordinates: result }
}
