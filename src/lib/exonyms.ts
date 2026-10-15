// Nombres en español. Photon (búsqueda de lugares) y OurAirports no entienden español: «República
// Checa» encuentra calles y «Pekín» no encuentra Pekín. Aquí está lo que traducimos nosotros.
import countries from 'i18n-iso-countries'
import es from 'i18n-iso-countries/langs/es.json'
import en from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(es)
countries.registerLocale(en)

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.()'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Otros nombres con los que se busca un país en español (además del oficial en español e inglés). */
const COUNTRY_ALIASES: Record<string, string[]> = {
  CZ: ['Chequia', 'República Checa', 'Czechia'],
  NL: ['Holanda'],
  US: ['EEUU', 'EE UU', 'USA', 'Estados Unidos de América', 'América'],
  GB: ['Inglaterra', 'Escocia', 'Gales', 'Irlanda del Norte', 'Gran Bretaña', 'UK'],
  KR: ['Corea del Sur', 'Corea'],
  KP: ['Corea del Norte'],
  CI: ['Costa de Marfil'],
  MM: ['Birmania'],
  SZ: ['Suazilandia'],
  MK: ['Macedonia'],
  CD: ['República Democrática del Congo', 'RD Congo', 'Congo Kinsasa'],
  CG: ['República del Congo', 'Congo Brazzaville'],
  VA: ['Vaticano', 'Ciudad del Vaticano'],
  TL: ['Timor Oriental'],
  AE: ['Emiratos', 'Dubái'],
  BY: ['Bielorrusia'],
  MD: ['Moldavia'],
  RU: ['Rusia'],
  IR: ['Irán', 'Persia'],
  SY: ['Siria'],
  LA: ['Laos'],
  VN: ['Vietnam'],
  BO: ['Bolivia'],
  VE: ['Venezuela'],
  TZ: ['Tanzania'],
  CV: ['Cabo Verde'],
  TW: ['Taiwán'],
  PS: ['Palestina', 'Cisjordania', 'Gaza'],
  FM: ['Micronesia'],
  BA: ['Bosnia'],
  DO: ['Dominicana', 'Santo Domingo'],
  TR: ['Turquía', 'Türkiye'],
  NZ: ['Nueva Zelanda', 'Aotearoa'],
  ZA: ['Sudáfrica'],
}

export interface CountryName {
  code: string
  /** Nombre a mostrar (español). */
  name: string
  /** Todas las formas plegadas (sin tildes ni mayúsculas) con las que se encuentra. */
  keys: string[]
}

export const COUNTRY_NAMES: CountryName[] = Object.keys(countries.getAlpha2Codes()).map((code) => {
  const all = [
    ...(countries.getName(code, 'es', { select: 'all' }) ?? []),
    ...(countries.getName(code, 'en', { select: 'all' }) ?? []),
    ...(COUNTRY_ALIASES[code] ?? []),
  ]
  return { code, name: countries.getName(code, 'es') ?? code, keys: [...new Set(all.map(fold))] }
})

export const spanishCountryName = (code: string) => countries.getName(code.toUpperCase(), 'es') ?? code

/** Países cuyo nombre (o alias) empieza por el texto, o lo contiene si es largo; los que empiezan, primero. */
export function matchCountries(q: string, limit = 3): CountryName[] {
  const s = fold(q)
  if (s.length < 3) return []
  const scored: { c: CountryName; score: number }[] = []
  for (const c of COUNTRY_NAMES) {
    let best = Infinity
    for (const k of c.keys) {
      if (k === s) best = Math.min(best, 0)
      else if (k.startsWith(s)) best = Math.min(best, 1)
      else if (k.split(' ').some((w) => w.startsWith(s))) best = Math.min(best, 2)
      else if (s.length >= 5 && k.includes(s)) best = Math.min(best, 3)
    }
    if (best < Infinity) scored.push({ c, score: best })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name, 'es'))
    .slice(0, limit)
    .map((x) => x.c)
}
