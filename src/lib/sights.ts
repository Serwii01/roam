// Sitios para ver o visitados (monumentos, museos, plazas…) a partir de Wikipedia en español.
// API pública y gratuita, sin clave: https://www.mediawiki.org/wiki/API:Main_page
// Se identifica la app con Api-User-Agent, como pide su política: https://meta.wikimedia.org/wiki/User-Agent_policy
import { haversine } from './geo'

export interface SightSuggestion {
  title: string
  description?: string
  lat: number
  lon: number
  url: string
  /** Distancia a la parada. */
  km: number
}

const API = 'https://es.wikipedia.org/w/api.php'
const HEADERS = { 'Api-User-Agent': 'ROAM/1.0 (https://github.com/Serwii01/roam)' }

// Artículos con coordenadas que no son sitios que visitar: entidades políticas, sucesos, empresas, transporte…
const NOT_TITLE =
  /^(Anexo|Historia|Prefectura|Provincia|Región|Distrito|Barrio|Estación|Aeropuerto|Línea|Metro|Universidad|Club|Partido|Batalla|Asedio|Incidente|Ataque|Atentado|Masacre|Terremoto|Incendio|Tratado|Acuerdo|Conferencia|Elecciones|Imperio|Reino|República|Estados|Gobierno|Diócesis|Arquidiócesis|Archidiócesis)\b|\((empresa|banda|película|serie|novela|álbum|canción|videojuego)\)/i
const NOT_DESC =
  /\b(estado|imperio|reino|rep[uú]blica|monarqu[ií]a|per[ií]odo|organizaci[oó]n|pa[ií]s|capital de|ciudad|municipio|comuna|comunidad aut[oó]noma|prefectura|provincia|regi[oó]n|barrio|rione|distrito|localidad|edici[oó]n|premio|festival|evento|batalla|club|equipo|universidad|empresa|compa[ñn][ií]a|divisi[oó]n|desarrolladora|videojuego|sociedad|aeropuerto|estaci[oó]n|l[ií]nea|metro|escuela|colegio|hospital|di[oó]cesis|partido|incidente|ataque|atentado|asesinato|masacre|terremoto|incendio|asedio|tratado|conferencia|elecciones|pel[ií]cula|serie|novela|anime|manga|banda|grupo musical|cantante|actor|actriz|escritor|pol[ií]tico|futbolista|asentamiento)\b/i
// Lo que sí suena a sitio que visitar puntúa el triple.
const SIGHT_DESC =
  /\b(templo|santuario|castillo|palacio|museo|iglesia|catedral|bas[ií]lica|capilla|monumento|fuente|plaza|parque|jard[ií]n|puente|torre|mirador|teatro|anfiteatro|monasterio|convento|abad[ií]a|mezquita|sinagoga|yacimiento|ruinas|mercado|playa|lago|monte|cascada|zoo|zool[oó]gico|acuario|fortaleza|muralla|faro|cementerio|[oó]pera|arco|columna|obelisco|estatua|escultura|pagoda|calle|avenida|bulevar|paseo|galer[ií]a|biblioteca|observatorio|rascacielos|edificio|ayuntamiento|pante[oó]n|circo|foro|termas|acueducto|villa|alc[aá]zar)\b/i
const SIGHT_TITLE = /(-ji|-dera|-jinja|-taisha|-gū|Templo|Santuario|Castillo|Palacio|Museo|Iglesia|Catedral|Basílica|Plaza|Parque|Jardín|Puente|Torre|Fuente|Monasterio|Mezquita|Teatro|Arco|Mercado|Galería)/

interface Page {
  title: string
  index?: number
  description?: string
  length?: number
  coordinates?: { lat: number; lon: number }[]
}

async function query(params: Record<string, string>, signal?: AbortSignal): Promise<Page[]> {
  const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })}`
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10_000)]) })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const json = (await res.json()) as { query?: { pages?: Page[] } }
  return json.query?.pages ?? []
}

export const wikiUrl = (title: string) => `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

function toSuggestion(p: Page, lat: number, lon: number): SightSuggestion | null {
  const c = p.coordinates?.[0]
  if (!c) return null
  return { title: p.title, description: p.description, lat: c.lat, lon: c.lon, url: wikiUrl(p.title), km: haversine([lon, lat], [c.lon, c.lat]) }
}

const suggestions = new Map<string, Promise<SightSuggestion[]>>()

/**
 * Los sitios más conocidos a menos de 10 km de una parada. Wikipedia da los 500 artículos más cercanos;
 * se quitan los que no son lugares que visitar y se ordenan por longitud del artículo (los monumentos
 * famosos tienen artículos largos), con más peso para templos, museos, plazas…
 */
export function suggestSights(lat: number, lon: number, stopName: string): Promise<SightSuggestion[]> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  if (!suggestions.has(key)) {
    const p = query({
      generator: 'geosearch',
      ggscoord: `${lat}|${lon}`,
      ggsradius: '10000',
      ggslimit: '500',
      prop: 'info|description|coordinates',
      colimit: 'max',
    })
      .then((pages) =>
        pages
          .filter((pg) => !NOT_TITLE.test(pg.title) && !NOT_DESC.test(pg.description ?? '') && pg.title.toLowerCase() !== stopName.toLowerCase())
          .map((pg) => ({ pg, score: (pg.length ?? 0) * (SIGHT_DESC.test(pg.description ?? '') || SIGHT_TITLE.test(pg.title) ? 3 : 1) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 16)
          .map(({ pg }) => toSuggestion(pg, lat, lon))
          .filter((x): x is SightSuggestion => !!x),
      )
      .catch((e) => {
        suggestions.delete(key)
        throw e
      })
    suggestions.set(key, p)
  }
  return suggestions.get(key)!
}

/** Busca un sitio por nombre: primero cerca de la parada, después en toda Wikipedia (solo los que tienen coordenadas). */
export async function searchSights(q: string, lat: number, lon: number, signal?: AbortSignal): Promise<SightSuggestion[]> {
  const s = q.trim()
  if (s.length < 2) return []
  const [near, byName] = await Promise.all([
    query({ generator: 'search', gsrsearch: `${s} nearcoord:30km,${lat},${lon}`, gsrlimit: '8', prop: 'coordinates|description', colimit: 'max' }, signal).catch(() => []),
    query({ generator: 'prefixsearch', gpssearch: s, gpslimit: '8', prop: 'coordinates|description', colimit: 'max' }, signal).catch(() => []),
  ])
  const seen = new Set<string>()
  const out: SightSuggestion[] = []
  for (const pg of [...near.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), ...byName.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))]) {
    if (seen.has(pg.title) || NOT_TITLE.test(pg.title) || NOT_DESC.test(pg.description ?? '')) continue
    seen.add(pg.title)
    const sug = toSuggestion(pg, lat, lon)
    if (sug) out.push(sug)
  }
  // Lo que está en la ciudad de la parada va primero.
  return out.sort((a, b) => Number(a.km > 50) - Number(b.km > 50)).slice(0, 8)
}
