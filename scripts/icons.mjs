// Material Symbols pesa ~1 MB con todos los iconos. Este script extrae del código los iconos usados,
// descarga de Google Fonts solo esos (parámetro icon_names) y guarda la fuente en public/fonts.
// La descarga es en tiempo de compilación: los visitantes nunca contactan con Google (RGPD).
// Uso: npm run icons            (se ejecuta también antes de cada build)
//      npm run icons -- --check (falla si el código usa un icono que no está en la fuente)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const fontsDir = path.join(root, 'public/fonts')
const manifestPath = path.join(fontsDir, 'material-symbols.json')

const files = []
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(f.name)) files.push(p)
  }
}
walk(path.join(root, 'src'))

const names = new Set()
const patterns = [
  /<Icon[^>]*?\sname=["']([a-z0-9_]+)["']/g, // <Icon name="flight" />
  /\bicon(?:Name)?:\s*['"]([a-z0-9_]+)['"]/g, // { icon: 'train' }
  /\bicon=["']([a-z0-9_]+)["']/g, // icon="public"
  /<Icon[^>]*?\sname=\{[^}]*?['"]([a-z0-9_]+)['"][^}]*?['"]([a-z0-9_]+)['"]/g, // name={x ? 'a' : 'b'}
  /\bicon\s*\?\?\s*['"]([a-z0-9_]+)['"]/g, // featured?.icon ?? 'lock'
]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const re of patterns) for (const m of src.matchAll(re)) m.slice(1).forEach((n) => n && names.add(n))
}
const list = [...names].sort()

if (process.argv.includes('--check')) {
  const current = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : []
  const missing = list.filter((n) => !current.includes(n))
  if (missing.length) {
    console.error(`Faltan iconos en la fuente: ${missing.join(', ')}. Ejecuta npm run icons.`)
    process.exit(1)
  }
  console.log(`✓ ${list.length} iconos en public/fonts/material-symbols.woff2`)
  process.exit(0)
}

const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
if (previous && previous.join() === list.join() && fs.existsSync(path.join(fontsDir, 'material-symbols.woff2'))) {
  console.log(`iconos: sin cambios (${list.length})`)
  process.exit(0)
}

const css = await fetch(
  `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${list.join(',')}&display=block`,
  // Con un navegador moderno como agente, Google sirve WOFF2.
  { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } },
).then((r) => {
  if (!r.ok) throw new Error(`Google Fonts: HTTP ${r.status}`)
  return r.text()
})
const url = css.match(/url\((https:[^)]+)\)/)?.[1]
if (!url) throw new Error('No se encontró la URL de la fuente en la respuesta de Google Fonts')
const font = Buffer.from(await (await fetch(url)).arrayBuffer())
fs.mkdirSync(fontsDir, { recursive: true })
fs.writeFileSync(path.join(fontsDir, 'material-symbols.woff2'), font)
fs.writeFileSync(manifestPath, JSON.stringify(list))
console.log(`public/fonts/material-symbols.woff2: ${list.length} iconos, ${(font.length / 1024).toFixed(1)} KB`)
