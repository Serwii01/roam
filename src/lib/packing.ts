// Lista de equipaje: categorías, plantillas y sugerencias según el destino y el tiempo previsto.
import type { NewPackingItem } from './api/types'
import type { PackingCategory } from './db'
import type { DayWeather } from './weather'

export const PACKING_CATEGORIES: Record<PackingCategory, { label: string; icon: string }> = {
  docs: { label: 'Documentos', icon: 'badge' },
  clothes: { label: 'Ropa', icon: 'apparel' },
  toiletries: { label: 'Aseo', icon: 'soap' },
  electronics: { label: 'Electrónica', icon: 'devices' },
  health: { label: 'Botiquín', icon: 'medical_services' },
  other: { label: 'Otros', icon: 'category' },
}
export const PACKING_ORDER = Object.keys(PACKING_CATEGORIES) as PackingCategory[]

type T = [label: string, category: PackingCategory]
const list = (items: T[]): NewPackingItem[] => items.map(([label, category], i) => ({ label, category, position: i }))

export const PACKING_TEMPLATES: { id: string; label: string; icon: string; items: NewPackingItem[] }[] = [
  {
    id: 'basic',
    label: 'Básico',
    icon: 'luggage',
    items: list([
      ['DNI o pasaporte', 'docs'],
      ['Tarjetas y algo de efectivo', 'docs'],
      ['Billetes y reservas', 'docs'],
      ['Seguro de viaje / tarjeta sanitaria europea', 'docs'],
      ['Móvil y cargador', 'electronics'],
      ['Batería externa', 'electronics'],
      ['Auriculares', 'electronics'],
      ['Cepillo y pasta de dientes', 'toiletries'],
      ['Desodorante', 'toiletries'],
      ['Gel y champú de viaje', 'toiletries'],
      ['Medicinas habituales', 'health'],
      ['Ibuprofeno o paracetamol', 'health'],
      ['Tiritas', 'health'],
      ['Ropa interior', 'clothes'],
      ['Calcetines', 'clothes'],
      ['Camisetas', 'clothes'],
      ['Pantalones', 'clothes'],
      ['Pijama', 'clothes'],
      ['Calzado cómodo', 'clothes'],
    ]),
  },
  {
    id: 'beach',
    label: 'Playa',
    icon: 'beach_access',
    items: list([
      ['Bañador', 'clothes'],
      ['Toalla de playa', 'other'],
      ['Protector solar', 'toiletries'],
      ['After sun', 'toiletries'],
      ['Gafas de sol', 'other'],
      ['Chanclas', 'clothes'],
      ['Gorra o sombrero', 'clothes'],
    ]),
  },
  {
    id: 'cold',
    label: 'Frío',
    icon: 'ac_unit',
    items: list([
      ['Abrigo', 'clothes'],
      ['Gorro', 'clothes'],
      ['Guantes', 'clothes'],
      ['Bufanda', 'clothes'],
      ['Ropa térmica', 'clothes'],
      ['Botas impermeables', 'clothes'],
      ['Cacao para labios', 'toiletries'],
    ]),
  },
  {
    id: 'mountain',
    label: 'Montaña',
    icon: 'landscape',
    items: list([
      ['Botas de montaña', 'clothes'],
      ['Forro polar', 'clothes'],
      ['Chubasquero', 'clothes'],
      ['Mochila de día', 'other'],
      ['Botella de agua', 'other'],
      ['Linterna frontal', 'electronics'],
    ]),
  },
  {
    id: 'city',
    label: 'Ciudad',
    icon: 'location_city',
    items: list([
      ['Zapatillas para caminar', 'clothes'],
      ['Mochila pequeña antirrobo', 'other'],
      ['Paraguas plegable', 'other'],
      ['Ropa para salir', 'clothes'],
    ]),
  },
  {
    id: 'work',
    label: 'Trabajo',
    icon: 'work',
    items: list([
      ['Portátil y cargador', 'electronics'],
      ['Adaptador de vídeo (HDMI/USB-C)', 'electronics'],
      ['Ropa formal', 'clothes'],
      ['Tarjetas de visita', 'docs'],
    ]),
  },
]

/** Unión Europea, EEE y Suiza: entre ellos, a los españoles les basta el DNI. */
export const EU_EEA = new Set('AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK IS LI NO CH AD MC SM VA'.split(' '))

/** Sugerencias para este viaje: destino fuera de casa o de la UE, frío, calor o lluvia previstos. */
export function packingSuggestions(opts: { countries: string[]; home?: string | null; weather: DayWeather[] }): NewPackingItem[] {
  const out: T[] = []
  const away = opts.countries.filter((c) => c !== (opts.home ?? 'ES'))
  if (away.length) out.push(['Adaptador de enchufe', 'electronics'])
  if (away.some((c) => !EU_EEA.has(c))) out.push(['Pasaporte (con validez de 6 meses)', 'docs'], ['Visado o autorización de entrada, si hace falta', 'docs'])
  const w = opts.weather
  if (w.length) {
    const min = Math.min(...w.map((x) => x.tmin))
    const max = Math.max(...w.map((x) => x.tmax))
    const wet = Math.max(...w.map((x) => x.wet))
    if (min < 8) out.push(['Abrigo', 'clothes'], ['Gorro y guantes', 'clothes'])
    else if (min < 14) out.push(['Chaqueta ligera', 'clothes'])
    if (max > 26) out.push(['Protector solar', 'toiletries'], ['Gafas de sol', 'other'], ['Ropa fresca', 'clothes'])
    if (wet >= 0.4) out.push(['Paraguas plegable', 'other'], ['Chubasquero', 'clothes'])
  }
  return list(out)
}
