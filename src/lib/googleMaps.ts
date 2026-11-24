// Enlaces a Google Maps (URLs públicas de Maps: sin API key ni cuenta). En el móvil abren la app de Google Maps
// si está instalada; si no, la web.
import type { Sight, Stop } from './db'

/**
 * Puntos por ruta (origen, destino e intermedios). Google Maps admite 9 intermedios en el ordenador, pero solo 3 en el
 * navegador del móvil: https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
const MAX_POINTS = 11
const MAX_POINTS_MOBILE = 5
const isMobile = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(['es'], { type: 'region' })
    return (code: string) => names.of(code) ?? ''
  } catch {
    return () => ''
  }
})()

/**
 * Cómo se busca cada sitio: por sus coordenadas, que es lo que se ve en el mapa del plan. Por el nombre, Google puede
 * elegir otro lugar («İstiklal» es una avenida y también un barrio). Sin ubicación (escrito a mano), por su nombre con
 * la ciudad y el país.
 */
function placeQuery(s: Pick<Sight, 'name' | 'lat' | 'lon'>, stop?: Pick<Stop, 'name' | 'country_code'>): string {
  if (s.lat != null && s.lon != null) return `${s.lat.toFixed(6)},${s.lon.toFixed(6)}`
  return [s.name.trim(), stop?.name, stop ? regionName(stop.country_code) : ''].filter((x, i, all) => x && all.indexOf(x) === i).join(', ')
}

export type TravelMode = 'walking' | 'transit' | 'driving' | 'bicycling'

/**
 * Enlaces para ver en Google Maps los sitios de un día, en orden: uno solo se abre como búsqueda; varios, como
 * ruta. Los que no caben en una (5 en el móvil, 11 en el ordenador) van en rutas seguidas: cada una empieza donde
 * acaba la anterior.
 */
export function googleMapsDayLinks(sights: Pick<Sight, 'name' | 'lat' | 'lon'>[], stop?: Pick<Stop, 'name' | 'country_code'>, mode: TravelMode = 'walking', max = isMobile() ? MAX_POINTS_MOBILE : MAX_POINTS): string[] {
  const points = sights.map((s) => placeQuery(s, stop)).filter(Boolean)
  if (!points.length) return []
  if (points.length === 1) return [`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: points[0] })}`]
  const links: string[] = []
  for (let start = 0; start < points.length - 1; start += max - 1) {
    const part = points.slice(start, start + max)
    const params = new URLSearchParams({ api: '1', origin: part[0], destination: part.at(-1)!, travelmode: mode })
    if (part.length > 2) params.set('waypoints', part.slice(1, -1).join('|'))
    links.push(`https://www.google.com/maps/dir/?${params}`)
  }
  return links
}

/** Cómo llegar desde donde estás (Google Maps usa tu ubicación como origen) a un sitio o a un alojamiento. */
export function googleMapsDirections(
  to: Pick<Sight, 'name' | 'lat' | 'lon'> & { address?: string | null },
  stop?: Pick<Stop, 'name' | 'country_code'>,
  mode: TravelMode = 'walking',
): string {
  const destination = to.address && to.lat == null ? `${to.name}, ${to.address}` : placeQuery(to, stop)
  const params = new URLSearchParams({ api: '1', destination, travelmode: mode })
  return `https://www.google.com/maps/dir/?${params}`
}
