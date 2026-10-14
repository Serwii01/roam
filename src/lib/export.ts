import type { TripWithStops } from './db'
import { greatCircle } from './geo'
import { legEndpoints, type AirportMap } from './stats'

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)

/** Descarga los viajes como KML (Google Earth, Google My Maps…). */
export function downloadKml(trips: TripWithStops[], airports: AirportMap) {
  const placemarks = trips.flatMap((t) => [
    ...t.stops.map(
      (s) => `<Placemark><name>${esc(s.name)}</name><description>${esc(t.title)}${s.arrived_on ? ` · ${s.arrived_on}` : ''}</description><Point><coordinates>${s.lon},${s.lat}</coordinates></Point></Placemark>`,
    ),
    ...t.stops.slice(1).map((s, j) => {
      const i = j + 1
      const [a, b] = legEndpoints(t.stops, i, airports)
      const pts = s.transport_in === 'plane' ? greatCircle(a, b, 32) : [a, b]
      return `<Placemark><name>${esc(`${t.stops[i - 1].name} → ${s.name}`)}</name><LineString><tessellate>1</tessellate><coordinates>${pts.map((p) => p.join(',')).join(' ')}</coordinates></LineString></Placemark>`
    }),
  ])
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>ROAM</name>${placemarks.join('')}</Document></kml>`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }))
  a.download = `roam-${new Date().toISOString().slice(0, 10)}.kml`
  a.click()
  URL.revokeObjectURL(a.href)
}
