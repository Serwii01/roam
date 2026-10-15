export type LngLat = [number, number]

const R = 6371

/** Distancia ortodrómica en km entre dos puntos [lon, lat]. */
export function haversine([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Puntos intermedios sobre el círculo máximo, para dibujar vuelos como arcos. */
export function greatCircle(a: LngLat, b: LngLat, steps = 64): LngLat[] {
  const toRad = Math.PI / 180
  const toDeg = 180 / Math.PI
  const [lon1, lat1] = [a[0] * toRad, a[1] * toRad]
  const [lon2, lat2] = [b[0] * toRad, b[1] * toRad]
  const d = haversine(a, b) / R
  if (d < 1e-6) return [a, b]
  const pts: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    pts.push([Math.atan2(y, x) * toDeg, Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg])
  }
  // Evita el salto en el antimeridiano: mantiene la longitud continua.
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360
    while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360
  }
  return pts
}

/** Curva suave para rutas terrestres (como en el diseño), en vez de una recta. */
export function bendLine(a: LngLat, b: LngLat, steps = 24): LngLat[] {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const len = Math.hypot(dx, dy)
  if (len < 0.05) return [a, b]
  const bend = Math.min(len * 0.12, 1.5)
  const c: LngLat = [(a[0] + b[0]) / 2 - (dy / len) * bend, (a[1] + b[1]) / 2 + (dx / len) * bend]
  const pts: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push([
      (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
      (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
    ])
  }
  return pts
}

export function bounds(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('es-ES')} km`
}
