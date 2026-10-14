// Avatares por defecto: monigotes garabateados "Croodles" de Vijay Verma (CC BY 4.0), generados con
// DiceBear como SVG estáticos en public/avatars. Así no dependen de ningún servicio externo.
// Uso: npm run avatars
import fs from 'node:fs'
import path from 'node:path'
import { createAvatar } from '@dicebear/core'
import { croodles } from '@dicebear/collection'

const COUNT = 24
// Paleta del diseño ROAM: fondos claros y tintas (con algún toque de color para dar variedad).
const BACKGROUNDS = ['ffdbd0', 'eeeeef', 'f3f3f4', 'e2e2e3', 'ffb59f', 'fbfaf8', 'f6e7dc', 'e8e8e9']
const HAIR = ['1a1c1d', 'd53e00', 'aa3000', '46464b', '852400', '77777b', '2a6f97', '5b8c51']

const dir = path.resolve(import.meta.dirname, '../public/avatars')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
for (let i = 0; i < COUNT; i++) {
  const svg = createAvatar(croodles, {
    seed: `roam-doodle-${i}`,
    backgroundColor: [BACKGROUNDS[i % BACKGROUNDS.length]],
    topColor: [HAIR[(i * 3) % HAIR.length]],
    radius: 50,
    size: 128,
  }).toString()
  fs.writeFileSync(path.join(dir, `doodle-${String(i + 1).padStart(2, '0')}.svg`), svg)
}
console.log(`public/avatars: ${COUNT} avatares`)
