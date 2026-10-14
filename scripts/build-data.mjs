// Genera los datos de referencia de Rumbo a partir de fuentes abiertas y gratuitas:
//   - supabase/seed.sql            países, subdivisiones ISO 3166-2 y aeropuertos
//   - public/geo/regions/XX.json   fronteras simplificadas de regiones/provincias por país
//
// Fuentes (se descargan en scripts/.cache la primera vez):
//   OurAirports (dominio público)          https://ourairports.com/data/
//   Debian iso-codes, ISO 3166-2 (LGPL)    https://salsa.debian.org/iso-codes-team/iso-codes
//   Natural Earth admin-1 (dominio público) https://www.naturalearthdata.com/
//
// Uso: npm run data
import fs from 'node:fs'
import path from 'node:path'
import countriesLib from 'i18n-iso-countries'
import mapshaper from 'mapshaper'

const root = path.resolve(import.meta.dirname, '..')
const cache = path.join(import.meta.dirname, '.cache')
fs.mkdirSync(cache, { recursive: true })
countriesLib.registerLocale(JSON.parse(fs.readFileSync(path.join(root, 'node_modules/i18n-iso-countries/langs/es.json'), 'utf8')))

const SOURCES = {
  'airports.csv': 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  'countries.csv': 'https://davidmegginson.github.io/ourairports-data/countries.csv',
  'iso_3166-2.json': 'https://salsa.debian.org/iso-codes-team/iso-codes/-/raw/main/data/iso_3166-2.json',
  'ne_admin1.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson',
}

async function source(name) {
  const file = path.join(cache, name)
  if (!fs.existsSync(file)) {
    console.log(`Descargando ${SOURCES[name]}`)
    const res = await fetch(SOURCES[name])
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return fs.readFileSync(file, 'utf8')
}

/** CSV con comillas (formato de OurAirports). */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  const [header, ...data] = rows
  return data.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

const sql = (v) => (v === null || v === undefined || v === '' ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

function inserts(table, columns, rows, conflict) {
  const out = []
  for (let i = 0; i < rows.length; i += 500) {
    const values = rows.slice(i, i + 500).map((r) => `(${columns.map((c) => sql(r[c])).join(', ')})`)
    out.push(`insert into public.${table} (${columns.join(', ')}) values\n${values.join(',\n')}\non conflict (${conflict}) do nothing;`)
  }
  return out.join('\n\n')
}

// ── Países ──
const countries = parseCsv(await source('countries.csv'))
  .filter((c) => /^[A-Z]{2}$/.test(c.code))
  .map((c) => ({
    code: c.code,
    name: c.code === 'XK' ? 'Kosovo' : (countriesLib.getName(c.code, 'es') ?? c.name),
    name_en: c.name,
    continent: c.continent,
  }))
const countryCodes = new Set(countries.map((c) => c.code))

// ── Subdivisiones ISO 3166-2 ──
const iso = JSON.parse(await source('iso_3166-2.json'))['3166-2'].filter((s) => countryCodes.has(s.code.slice(0, 2)))
const byCode = new Map(iso.map((s) => [s.code, s]))
const depth = (s) => (s.parent && byCode.has(s.parent) ? 1 + depth(byCode.get(s.parent)) : 1)
const subdivisions = iso.map((s) => ({
  code: s.code,
  country_code: s.code.slice(0, 2),
  name: s.name,
  type: s.type,
  parent_code: s.parent && byCode.has(s.parent) ? s.parent : null,
  level: Math.min(depth(s), 3),
}))

// ── Aeropuertos con código IATA (grandes, medianos y pequeños con vuelos regulares) ──
const SIZE = { large_airport: 'large', medium_airport: 'medium', small_airport: 'small' }
const rank = { large: 0, medium: 1, small: 2 }
const airportsByIata = new Map()
for (const a of parseCsv(await source('airports.csv'))) {
  const size = SIZE[a.type]
  if (!size || !/^[A-Z]{3}$/.test(a.iata_code) || !countryCodes.has(a.iso_country)) continue
  if (size === 'small' && a.scheduled_service !== 'yes') continue
  const prev = airportsByIata.get(a.iata_code)
  if (prev && rank[prev.size] <= rank[size]) continue
  airportsByIata.set(a.iata_code, {
    iata: a.iata_code,
    icao: a.icao_code || a.gps_code || null,
    name: a.name,
    city: a.municipality || null,
    country_code: a.iso_country,
    subdivision_code: a.iso_region || null,
    lat: Number(Number(a.latitude_deg).toFixed(5)),
    lon: Number(Number(a.longitude_deg).toFixed(5)),
    size,
  })
}
const airports = [...airportsByIata.values()].sort((a, b) => a.iata.localeCompare(b.iata))

const seed = [
  '-- Generado por scripts/build-data.mjs. No editar a mano.',
  inserts('countries', ['code', 'name', 'name_en', 'continent'], countries, 'code'),
  inserts('subdivisions', ['code', 'country_code', 'name', 'type', 'parent_code', 'level'], subdivisions, 'code'),
  inserts('airports', ['iata', 'icao', 'name', 'city', 'country_code', 'subdivision_code', 'lat', 'lon', 'size'], airports, 'iata'),
].join('\n\n')
fs.mkdirSync(path.join(root, 'supabase'), { recursive: true })
fs.writeFileSync(path.join(root, 'supabase/seed.sql'), seed + '\n')
console.log(`seed.sql: ${countries.length} países, ${subdivisions.length} subdivisiones, ${airports.length} aeropuertos`)

// ── Fronteras de regiones por país (Natural Earth, simplificadas) ──
await source('ne_admin1.geojson')
// mapshaper interpreta mal las rutas absolutas de Windows: se le pasan relativas a la raíz.
process.chdir(root)
const rel = (p) => path.relative(root, p).split(path.sep).join('/')
const tmp = path.join(cache, 'regions-split')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true }) // mapshaper solo acepta como salida directorios ya existentes
await mapshaper.runCommands(
  `-i ${rel(path.join(cache, 'ne_admin1.geojson'))} name=regions ` +
    `-filter "iso_3166_2 && iso_a2 && iso_a2 !== '-1'" ` +
    `-each "code=iso_3166_2, cc=iso_a2" -filter-fields code,cc,name ` +
    `-simplify 6% weighted keep-shapes -split cc ` +
    `-o ${rel(tmp)}/ format=geojson precision=0.001`,
)
const outDir = path.join(root, 'public/geo/regions')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
let files = 0
let bytes = 0
for (const f of fs.readdirSync(tmp)) {
  const cc = f.replace(/^regions-/, '').replace(/\.json$/, '')
  if (!/^[A-Z]{2}$/.test(cc)) continue
  const geo = JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8'))
  for (const feat of geo.features) delete feat.properties.cc
  const text = JSON.stringify(geo)
  fs.writeFileSync(path.join(outDir, `${cc}.json`), text)
  files++
  bytes += text.length
}
console.log(`public/geo/regions: ${files} países, ${(bytes / 1e6).toFixed(1)} MB en total`)

// ── Copia de la referencia en JSON para el modo demo (sin Supabase) ──
const dataDir = path.join(root, 'public/data')
fs.mkdirSync(dataDir, { recursive: true })
const table = (rows, cols) => ({ cols, rows: rows.map((r) => cols.map((c) => r[c] ?? null)) })
fs.writeFileSync(path.join(dataDir, 'countries.json'), JSON.stringify(table(countries, ['code', 'name', 'name_en', 'continent'])))
fs.writeFileSync(path.join(dataDir, 'subdivisions.json'), JSON.stringify(table(subdivisions, ['code', 'country_code', 'name', 'type', 'parent_code', 'level'])))
fs.writeFileSync(
  path.join(dataDir, 'airports.json'),
  JSON.stringify(table(airports, ['iata', 'icao', 'name', 'city', 'country_code', 'subdivision_code', 'lat', 'lon', 'size'])),
)
console.log('public/data: referencia en JSON para el modo demo')

// ── Banderas: un SVG por país en /flags (flag-icons, MIT), cargados a demanda ──
const flagsDir = path.join(root, 'public/flags')
fs.mkdirSync(flagsDir, { recursive: true })
const flagSrc = path.join(root, 'node_modules/flag-icons/flags/4x3')
for (const f of fs.readdirSync(flagSrc)) fs.copyFileSync(path.join(flagSrc, f), path.join(flagsDir, f))
console.log('public/flags: banderas copiadas')

// ── Mundo: países de Natural Earth 1:50m (world-atlas), simplificados y corregidos ──
// Se hace aquí y no en el navegador: antes viajaban 757 KB de JavaScript y se convertían en cada visita.
{
  const { feature } = await import('topojson-client')
  const { normalizeGeometry } = await import('../src/lib/geometry.ts')
  const tmpTopo = path.join(cache, 'world-simplified.json')
  await mapshaper.runCommands(
    `-i ${rel(path.join(root, 'node_modules/world-atlas/countries-50m.json'))} -simplify 22% weighted keep-shapes ` + `-o ${rel(tmpTopo)} format=topojson force`,
  )
  const topo = JSON.parse(fs.readFileSync(tmpTopo, 'utf8'))
  const BY_NAME = { Kosovo: 'XK', Somaliland: 'SO', 'N. Cyprus': 'CY' }
  // Dos decimales (~1 km) bastan para el mapa del mundo. Al redondear se quitan los puntos repetidos
  // seguidos y los anillos que quedan degenerados, que MapLibre triangularía mal.
  const r2 = (n) => Math.round(n * 100) / 100
  const roundRing = (ring) => {
    const out = []
    for (const [x, y] of ring) {
      const p = [r2(x), r2(y)]
      const last = out.at(-1)
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
    }
    return out.length >= 4 ? out : null
  }
  const round = (polys) =>
    polys
      .map((rings) => {
        const [outer, ...holes] = rings.map(roundRing)
        return outer ? [outer, ...holes.filter(Boolean)] : null
      })
      .filter(Boolean)
  const features = feature(topo, topo.objects[Object.keys(topo.objects)[0]])
    .features.map((f) => {
      const code = (f.id != null ? countriesLib.numericToAlpha2(String(f.id)) : undefined) ?? BY_NAME[f.properties?.name]
      if (!code) return null
      const g = normalizeGeometry(f.geometry)
      return { type: 'Feature', properties: { code, name: f.properties.name }, geometry: { ...g, coordinates: round(g.coordinates) } }
    })
    .filter(Boolean)
  const text = JSON.stringify({ type: 'FeatureCollection', features })
  fs.writeFileSync(path.join(root, 'public/geo/world.json'), text)
  console.log(`public/geo/world.json: ${features.length} países, ${(text.length / 1024).toFixed(0)} KB`)
}
