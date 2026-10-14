// Material Symbols pesa ~2,4 MB con todos los iconos. Google Fonts permite pedir solo los usados
// (parámetro icon_names). Este script los extrae del código y actualiza el <link> de index.html.
// Uso: npm run icons            (se ejecuta también antes de cada build)
//      npm run icons -- --check (falla si falta algún icono en el enlace)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
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
const href = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${list.join(',')}&display=block`

const htmlPath = path.join(root, 'index.html')
const html = fs.readFileSync(htmlPath, 'utf8')
const re = /<link id="icons" rel="stylesheet" href="[^"]*" \/>/
if (process.argv.includes('--check')) {
  const current = html.match(/icon_names=([a-z0-9_,]+)/)?.[1].split(',') ?? []
  const missing = list.filter((n) => !current.includes(n))
  if (missing.length) {
    console.error(`Faltan iconos en index.html: ${missing.join(', ')}. Ejecuta npm run icons.`)
    process.exit(1)
  }
  console.log(`✓ ${list.length} iconos en el enlace de Material Symbols`)
} else {
  if (!re.test(html)) throw new Error('index.html no tiene <link id="icons" …>')
  fs.writeFileSync(htmlPath, html.replace(re, `<link id="icons" rel="stylesheet" href="${href.replace(/&/g, '&amp;')}" />`))
  console.log(`index.html: ${list.length} iconos → ${list.join(' ')}`)
}
