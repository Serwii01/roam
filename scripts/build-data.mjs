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

// ── Poblaciones con nombre en español (Natural Earth populated places, dominio público) ──
// Catálogo propio para el buscador: Photon no entiende español («Pekín», «Ciudad del Cabo»…).
{
  const file = path.join(cache, 'ne_places.geojson')
  if (!fs.existsSync(file)) {
    console.log('Descargando poblaciones de Natural Earth')
    const res = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson')
    if (!res.ok) throw new Error(`Natural Earth places: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  const ne = JSON.parse(fs.readFileSync(file, 'utf8'))
  const r4 = (n) => Math.round(n * 1e4) / 1e4
  const rows = ne.features
    .map(({ properties: p }) => {
      const cc = /^[A-Z]{2}$/.test(p.ISO_A2) ? p.ISO_A2 : null
      if (!cc) return null
      const es = p.NAME_ES || p.NAME
      // Nombres alternativos con los que también se busca (local, inglés, ASCII, alternativos).
      const alt = [...new Set([p.NAME, p.NAME_EN, p.NAMEASCII, ...(p.NAMEALT ? String(p.NAMEALT).split('|') : [])].filter((n) => n && n !== es))]
      return [es, alt.join('|'), cc, p.ADM1NAME || null, r4(p.LATITUDE), r4(p.LONGITUDE), Math.round(p.POP_MAX || 0)]
    })
    .filter(Boolean)
    .sort((a, b) => b[6] - a[6])
  const text = JSON.stringify({ cols: ['es', 'alt', 'cc', 'region', 'lat', 'lon', 'pop'], rows })
  fs.writeFileSync(path.join(root, 'public/data/places.json'), text)
  console.log(`public/data/places.json: ${rows.length} poblaciones, ${(text.length / 1024).toFixed(0)} KB`)
}

// ── Catálogo de búsqueda: poblaciones de ≥5.000 habitantes (GeoNames cities5000, CC BY 4.0) ──
// Troceado por las dos primeras letras de cada nombre: cada búsqueda descarga solo unos KB.
// El nombre a mostrar es el español de Natural Earth cuando la población coincide (Pekín, Múnich…).
{
  const zip = path.join(cache, 'cities5000.zip')
  const txt = path.join(cache, 'cities5000.txt')
  if (!fs.existsSync(txt)) {
    console.log('Descargando GeoNames cities5000')
    const res = await fetch('https://download.geonames.org/export/dump/cities5000.zip')
    if (!res.ok) throw new Error(`GeoNames: HTTP ${res.status}`)
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
    const { execSync } = await import('node:child_process')
    execSync(`unzip -o -q "${rel(zip)}" -d "${rel(cache)}"`, { cwd: root })
  }
  const admin1File = path.join(cache, 'admin1CodesASCII.txt')
  if (!fs.existsSync(admin1File)) {
    const res = await fetch('https://download.geonames.org/export/dump/admin1CodesASCII.txt')
    fs.writeFileSync(admin1File, await res.text())
  }
  const admin1 = new Map(fs.readFileSync(admin1File, 'utf8').split('\n').map((l) => l.split('\t')).map(([k, n]) => [k, n]))

  const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[.()'’]/g, '').replace(/\s+/g, ' ').trim()
  const latin = (s) => /^[\p{Script=Latin}0-9\s\-'’.]+$/u.test(s)

  // Natural Earth (ya descargado arriba) para los nombres en español.
  const ne = JSON.parse(fs.readFileSync(path.join(cache, 'ne_places.geojson'), 'utf8')).features.map((f) => f.properties)
  const neByCc = new Map()
  for (const p of ne) if (p.NAME_ES && /^[A-Z]{2}$/.test(p.ISO_A2)) neByCc.set(p.ISO_A2, [...(neByCc.get(p.ISO_A2) ?? []), p])
  const spanishName = (cc, lat, lon, names) => {
    for (const p of neByCc.get(cc) ?? []) {
      if (Math.abs(p.LATITUDE - lat) > 0.15 || Math.abs(p.LONGITUDE - lon) > 0.2) continue
      const keys = [p.NAME, p.NAME_EN, p.NAMEASCII, p.NAME_ES].filter(Boolean).map(fold)
      if (names.some((n) => keys.includes(n))) return p.NAME_ES
    }
    return null
  }

  // Región en español: la región de Natural Earth que contiene el punto (name_es), o la que tenga el
  // mismo código de GeoNames, o el nombre en inglés de GeoNames.
  const neAdmin = JSON.parse(fs.readFileSync(path.join(cache, 'ne_admin1.geojson'), 'utf8')).features
  const adminByCc = new Map()
  const adminByGn = new Map()
  for (const feat of neAdmin) {
    const p = feat.properties
    const label = p.name_es || p.name
    if (!label || !/^[A-Z]{2}$/.test(p.iso_a2)) continue
    if (p.gn_a1_code) adminByGn.set(p.gn_a1_code, label)
    const polys = feat.geometry?.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry?.type === 'MultiPolygon' ? feat.geometry.coordinates : []
    for (const poly of polys) {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
      for (const [x, y] of poly[0]) ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)))
      adminByCc.set(p.iso_a2, [...(adminByCc.get(p.iso_a2) ?? []), { label, poly, bbox: [x0, y0, x1, y1] }])
    }
  }
  const inRing = (x, y, ring) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  const regionName = (cc, lat, lon, gnCode, fallback) => {
    for (const a of adminByCc.get(cc) ?? []) {
      const [x0, y0, x1, y1] = a.bbox
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue
      if (inRing(lon, lat, a.poly[0]) && !a.poly.slice(1).some((h) => inRing(lon, lat, h))) return a.label
    }
    return adminByGn.get(gnCode) ?? fallback
  }

  const shards = new Map()
  let count = 0
  for (const line of fs.readFileSync(txt, 'utf8').split('\n')) {
    const c = line.split('\t')
    if (c.length < 15) continue
    const [, name, ascii, alternates, lat, lon, , , cc, , adm1, , , , pop] = c
    if (!/^[A-Z]{2}$/.test(cc)) continue
    const la = Number(lat), lo = Number(lon)
    const es = spanishName(cc, la, lo, [fold(name), fold(ascii)])
    const display = es ?? name
    const alts = alternates.split(',').filter((a) => a && a.length <= 25 && latin(a)).slice(0, 4)
    const keys = [...new Set([display, name, ascii, ...alts].map(fold).filter((k) => /^[a-z0-9]{2}/.test(k)))]
    const row = [display, cc, regionName(cc, la, lo, `${cc}.${adm1}`, admin1.get(`${cc}.${adm1}`) ?? null), Math.round(la * 1e3) / 1e3, Math.round(lo * 1e3) / 1e3, Number(pop) || 0]
    count++
    for (const prefix of new Set(keys.map((k) => k.slice(0, 2)))) {
      const list = shards.get(prefix) ?? []
      list.push([...row, keys.filter((k) => k.startsWith(prefix) || k.split(' ').some((w) => w.startsWith(prefix)))])
      shards.set(prefix, list)
    }
    // Que también se encuentre por palabras sueltas («york» → Nueva York).
    for (const k of keys)
      for (const w of k.split(' ').slice(1))
        if (/^[a-z0-9]{2}/.test(w) && !keys.some((x) => x.startsWith(w.slice(0, 2)))) {
          const list = shards.get(w.slice(0, 2)) ?? []
          list.push([...row, [k]])
          shards.set(w.slice(0, 2), list)
        }
  }
  const dir = path.join(root, 'public/data/places')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // Los trozos de más de 60 KB («sa», «ma»…) se parten por tres letras; split.json dice cuáles.
  let total = 0
  let biggest = 0
  let files = 0
  const split = []
  const write = (name, rows) => {
    rows.sort((a, b) => b[5] - a[5])
    const text = JSON.stringify(rows)
    // Prefijo «p_»: «con», «aux», «nul» o «prn» son nombres reservados en Windows.
    fs.writeFileSync(path.join(dir, `p_${name}.json`), text)
    total += text.length
    biggest = Math.max(biggest, text.length)
    files++
  }
  for (const [prefix, rows] of shards) {
    if (JSON.stringify(rows).length <= 60_000) {
      write(prefix, rows)
      continue
    }
    split.push(prefix)
    const sub = new Map()
    for (const row of rows) {
      const keys = row[6]
      for (const p3 of new Set(keys.flatMap((k) => [k, ...k.split(' ')]).filter((w) => w.startsWith(prefix) && w.length >= 3).map((w) => w.slice(0, 3)))) {
        sub.set(p3, [...(sub.get(p3) ?? []), row])
      }
    }
    for (const [p3, list] of sub) write(p3, list)
  }
  fs.writeFileSync(path.join(dir, 'split.json'), JSON.stringify(split.sort()))
  console.log(`public/data/places/: ${count} poblaciones en ${files} trozos (${split.length} partidos a 3 letras), ${(total / 1e6).toFixed(1)} MB, el mayor ${(biggest / 1024).toFixed(0)} KB`)
}
