// Enlaces a Google Maps (URLs públicas de Maps: sin API key ni cuenta). En el móvil abren la app de Google Maps
// si está instalada; si no, la web.
import type { Sight, Stop } from './db'

/** Google Maps admite como mucho 9 paradas intermedias por ruta (más el origen y el destino). */
const MAX_POINTS = 11

const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(['es'], { type: 'region' })
    return (code: string) => names.of(code) ?? ''
  } catch {
    return () => ''
  }
})()

/**
 * Cómo se busca cada sitio: por su nombre con la ciudad y el país («Kinkaku-ji, Kioto, Japón»), que Google
 * reconoce como el lugar (con su ficha y su nombre); si el nombre es muy corto o genérico, por coordenadas.
 */
function placeQuery(s: Pick<Sight, 'name' | 'lat' | 'lon'>, stop?: Pick<Stop, 'name' | 'country_code'>): string {
  const name = s.name.trim()
  if (name.length < 4 && s.lat != null && s.lon != null) return `${s.lat.toFixed(6)},${s.lon.toFixed(6)}`
  return [name, stop?.name, stop ? regionName(stop.country_code) : ''].filter((x, i, all) => x && all.indexOf(x) === i).join(', ')
}

export type TravelMode = 'walking' | 'transit' | 'driving' | 'bicycling'

/**
 * Enlaces para ver en Google Maps los sitios de un día, en orden: uno solo se abre como búsqueda; varios, como
 * ruta. Con más de 11 sitios se parte en varias rutas seguidas (cada una empieza donde acaba la anterior).
 */
export function googleMapsDayLinks(sights: Pick<Sight, 'name' | 'lat' | 'lon'>[], stop?: Pick<Stop, 'name' | 'country_code'>, mode: TravelMode = 'walking'): string[] {
  const points = sights.map((s) => placeQuery(s, stop)).filter(Boolean)
  if (!points.length) return []
  if (points.length === 1) return [`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: points[0] })}`]
  const links: string[] = []
  for (let start = 0; start < points.length - 1; start += MAX_POINTS - 1) {
    const part = points.slice(start, start + MAX_POINTS)
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
  const destination = to.address ? `${to.name}, ${to.address}` : placeQuery(to, stop)
  const params = new URLSearchParams({ api: '1', destination, travelmode: mode })
  return `https://www.google.com/maps/dir/?${params}`
}
