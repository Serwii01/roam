// Ficha práctica de los destinos más habituales: emergencias, enchufes, voltaje, lado de conducción y prefijo.
// Son datos orientativos escritos a mano y no cubren todos los países: sin ficha, «Hoy» no enseña nada.
export interface CountryFacts {
  /** Teléfonos de emergencia, ya en texto para enseñar. */
  emergency: string
  /** Tipos de enchufe (letras IEC). */
  plugs: string
  volts: number
  /** Se conduce por la izquierda. */
  left?: boolean
  dial: string
}

const f = (emergency: string, plugs: string, volts: number, dial: string, left = false): CountryFacts => ({ emergency, plugs, volts, dial, left })
const EU = '112'

export const COUNTRY_FACTS: Record<string, CountryFacts> = {
  // Europa
  AT: f(EU, 'CF', 230, '+43'),
  BE: f(EU, 'CE', 230, '+32'),
  BG: f(EU, 'CF', 230, '+359'),
  CH: f('112 · Policía 117 · Ambulancia 144 · Bomberos 118', 'CJ', 230, '+41'),
  CY: f(EU, 'G', 240, '+357', true),
  CZ: f(EU, 'CE', 230, '+420'),
  DE: f(EU, 'CF', 230, '+49'),
  DK: f(EU, 'CEFK', 230, '+45'),
  EE: f(EU, 'CF', 230, '+372'),
  ES: f(EU, 'CF', 230, '+34'),
  FI: f(EU, 'CF', 230, '+358'),
  FR: f(EU, 'CE', 230, '+33'),
  GB: f('999 o 112', 'G', 230, '+44', true),
  GE: f(EU, 'CF', 220, '+995'),
  GR: f(EU, 'CF', 230, '+30'),
  HR: f(EU, 'CF', 230, '+385'),
  HU: f(EU, 'CF', 230, '+36'),
  IE: f('112 o 999', 'G', 230, '+353', true),
  IS: f(EU, 'CF', 230, '+354'),
  IT: f(EU, 'CFL', 230, '+39'),
  LT: f(EU, 'CF', 230, '+370'),
  LU: f(EU, 'CF', 230, '+352'),
  LV: f(EU, 'CF', 230, '+371'),
  MT: f(EU, 'G', 230, '+356', true),
  NL: f(EU, 'CF', 230, '+31'),
  NO: f('112 · Ambulancia 113 · Bomberos 110', 'CF', 230, '+47'),
  PL: f(EU, 'CE', 230, '+48'),
  PT: f(EU, 'CF', 230, '+351'),
  RO: f(EU, 'CF', 230, '+40'),
  RS: f('Policía 192 · Ambulancia 194 · Bomberos 193', 'CF', 230, '+381'),
  SE: f(EU, 'CF', 230, '+46'),
  SI: f(EU, 'CF', 230, '+386'),
  SK: f(EU, 'CE', 230, '+421'),
  TR: f(EU, 'CF', 230, '+90'),
  // América
  AR: f('911 · Ambulancia 107 · Bomberos 100', 'CI', 220, '+54'),
  BR: f('Policía 190 · Ambulancia 192 · Bomberos 193', 'CN', 127, '+55'),
  CA: f('911', 'AB', 120, '+1'),
  CL: f('Policía 133 · Ambulancia 131 · Bomberos 132', 'CL', 220, '+56'),
  CO: f('123', 'AB', 110, '+57'),
  CR: f('911', 'AB', 120, '+506'),
  DO: f('911', 'AB', 120, '+1'),
  EC: f('911', 'AB', 120, '+593'),
  MX: f('911', 'AB', 127, '+52'),
  PA: f('911', 'AB', 120, '+507'),
  PE: f('Policía 105 · Ambulancia 106 · Bomberos 116', 'ABC', 220, '+51'),
  US: f('911', 'AB', 120, '+1'),
  UY: f('911', 'CFL', 220, '+598'),
  // Asia y Oriente Próximo
  AE: f('Policía 999 · Ambulancia 998 · Bomberos 997', 'G', 230, '+971'),
  CN: f('Policía 110 · Ambulancia 120 · Bomberos 119', 'ACI', 220, '+86'),
  HK: f('999', 'G', 220, '+852', true),
  ID: f('112', 'CF', 230, '+62', true),
  IL: f('Policía 100 · Ambulancia 101 · Bomberos 102', 'CH', 230, '+972'),
  IN: f('112', 'CDM', 230, '+91', true),
  JP: f('Policía 110 · Ambulancia y bomberos 119', 'AB', 100, '+81', true),
  KR: f('Policía 112 · Ambulancia y bomberos 119', 'CF', 220, '+82'),
  MY: f('999', 'G', 230, '+60', true),
  PH: f('911', 'ABC', 220, '+63'),
  SG: f('Policía 999 · Ambulancia y bomberos 995', 'G', 230, '+65', true),
  TH: f('Policía 191 · Policía turística 1155 · Ambulancia 1669', 'ABCO', 230, '+66', true),
  TW: f('Policía 110 · Ambulancia y bomberos 119', 'AB', 110, '+886'),
  VN: f('Policía 113 · Ambulancia 115 · Bomberos 114', 'AC', 220, '+84'),
  // África y Oceanía
  AU: f('000', 'I', 230, '+61', true),
  EG: f('Policía 122 · Ambulancia 123 · Bomberos 180', 'CF', 220, '+20'),
  KE: f('999 o 112', 'G', 240, '+254', true),
  MA: f('Policía 19 · Ambulancia 15 · Gendarmería 177', 'CE', 220, '+212'),
  NZ: f('111', 'I', 230, '+64', true),
  ZA: f('Policía 10111 · Ambulancia 10177', 'CDMN', 230, '+27', true),
}

/** Los enchufes C (europeo fino) entran en E, F, J, K, L y N: son compatibles sin adaptador. */
const FITS_C = new Set('CEFJKLN')
const fits = (from: string, to: string) => [...from].some((p) => to.includes(p) || (p === 'C' && [...to].some((x) => FITS_C.has(x))))

/** ¿Hará falta adaptador con los cargadores de casa? null si no se sabe. */
export function needsAdapter(country: string, home?: string | null): boolean | null {
  const here = COUNTRY_FACTS[country]
  const mine = home ? COUNTRY_FACTS[home] : undefined
  if (!here || !mine) return null
  return !fits(mine.plugs, here.plugs)
}

export const plugList = (plugs: string) => [...plugs].join(', ')
