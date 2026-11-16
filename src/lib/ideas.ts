// Ideas de sitios del plan día a día: sin repetir lo que ya está en el viaje (en cualquier día) y agrupadas por
// zonas que se pueden recorrer andando, empezando por la que queda junto a lo que ya tienes ese día.
import { fold } from './exonyms'
import { haversine } from './geo'
import type { SightSuggestion } from './sights'

/** Un sitio ya puesto en el viaje (lo justo para compararlo con una idea). */
export interface TakenSight {
  name: string
  lat?: number | null
  lon?: number | null
  wiki_url?: string | null
}

/** A menos de esto de un sitio ya puesto, una idea es el mismo sitio (otro nombre, otra entrada del mapa). */
const SAME_PLACE_KM = 0.15
/** Radio de una zona: lo que se recorre andando sin coger transporte. */
const ZONE_KM = 1
/** Una zona a esto de un sitio del día cuenta como «junto a lo que ya tienes». */
const NEAR_DAY_KM = 1.5
/** Hasta aquí de la parada es su centro. */
const CENTER_KM = 1.5

const key = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const hasCoords = (s: TakenSight): s is TakenSight & { lat: number; lon: number } => s.lat != null && s.lon != null

/** ¿La idea ya está en el viaje? Mismo nombre (sin tildes ni signos), mismo artículo o casi el mismo punto. */
export function findTaken<T extends TakenSight>(idea: Pick<SightSuggestion, 'title' | 'lat' | 'lon' | 'url'>, taken: T[]): T | undefined {
  const k = key(idea.title)
  return taken.find(
    (t) => key(t.name) === k || (!!idea.url && t.wiki_url === idea.url) || (hasCoords(t) && haversine([idea.lon, idea.lat], [t.lon, t.lat]) < SAME_PLACE_KM),
  )
}

export interface IdeaZone {
  /** Nombre de la zona: «Junto a Fushimi Inari», «Centro de Kioto», «Alrededores de Kinkaku-ji». */
  label: string
  /** Distancia y dirección desde el centro de la ciudad («4 km al norte»); vacío en el centro. */
  where: string
  ideas: SightSuggestion[]
  /** Junto a lo que ya tienes ese día. */
  near: boolean
}

const DIRS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
function direction(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const k = Math.cos((from.lat * Math.PI) / 180)
  const deg = (Math.atan2((to.lon - from.lon) * k, to.lat - from.lat) * 180) / Math.PI
  return DIRS[Math.round(((deg + 360) % 360) / 45) % 8]
}

interface Cluster {
  lat: number
  lon: number
  ideas: SightSuggestion[]
}

/**
 * Agrupa las ideas (ya ordenadas de más a menos conocidas) en zonas de ~1 km: cada idea va a la primera zona cuyo
 * centro tiene cerca o abre una nueva, así que cada zona la encabeza su sitio más conocido. Se quitan las que ya
 * están en el viaje. Orden: primero las zonas junto a lo que ya tienes ese día (`day`), luego las de más ideas.
 * Las ideas sueltas lejos de todo van al final, juntas en «Otros sitios».
 */
export function ideaZones(
  ideas: SightSuggestion[],
  opts: { city: string; center: { lat: number; lon: number }; taken: TakenSight[]; day?: TakenSight[]; perZone?: number },
): IdeaZone[] {
  const { city, center, taken, perZone = 6 } = opts
  const day = (opts.day ?? []).filter(hasCoords)
  const free = ideas.filter((i) => !findTaken(i, taken))

  const clusters: Cluster[] = []
  for (const idea of free) {
    const c = clusters.find((z) => haversine([z.lon, z.lat], [idea.lon, idea.lat]) <= ZONE_KM)
    if (!c) {
      clusters.push({ lat: idea.lat, lon: idea.lon, ideas: [idea] })
      continue
    }
    c.ideas.push(idea)
    c.lat = c.ideas.reduce((a, x) => a + x.lat, 0) / c.ideas.length
    c.lon = c.ideas.reduce((a, x) => a + x.lon, 0) / c.ideas.length
  }

  const zones = clusters.map((c, i) => {
    const anchor = day.map((s) => ({ s, km: haversine([c.lon, c.lat], [s.lon, s.lat]) })).sort((a, b) => a.km - b.km)[0]
    const near = !!anchor && anchor.km <= NEAR_DAY_KM
    const fromCenter = haversine([center.lon, center.lat], [c.lon, c.lat])
    const inCenter = fromCenter <= CENTER_KM
    const label = near ? `Junto a ${anchor.s.name}` : inCenter ? `Centro de ${city}` : `Alrededores de ${c.ideas[0].title}`
    const where = inCenter ? '' : `${fromCenter < 10 ? fromCenter.toFixed(1).replace('.', ',') : Math.round(fromCenter)} km al ${direction(center, c)}`
    return { zone: { label, where, ideas: c.ideas.slice(0, perZone), near }, i, anchorKm: anchor?.km ?? Infinity, size: c.ideas.length, inCenter }
  })

  const loose = zones.filter((z) => z.size === 1 && !z.zone.near && !z.inCenter)
  const used = new Set<string>()
  const grouped = zones
    .filter((z) => !loose.includes(z))
    .sort((a, b) => Number(b.zone.near) - Number(a.zone.near) || (a.zone.near ? a.anchorKm - b.anchorKm : 0) || b.size - a.size || a.i - b.i)
    .map(({ zone }) => {
      // Dos zonas en el centro o junto al mismo sitio: la segunda se nombra por su sitio más conocido.
      const label = used.has(zone.label) ? `Alrededores de ${zone.ideas[0].title}` : zone.label
      used.add(label)
      return { ...zone, label }
    })
  if (loose.length) grouped.push({ label: 'Otros sitios', where: 'más repartidos', ideas: loose.map((z) => z.zone.ideas[0]).slice(0, perZone), near: false })
  return grouped
}
