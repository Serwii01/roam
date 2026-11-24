// Ordenar los sitios de un día para andar menos. El primero se queda donde está (es por donde se empieza) y las notas y
// los sitios sin ubicación siguen detrás del sitio al que acompañaban.
import { isNote, type Sight } from './db'
import { haversine } from './geo'

type Place = Pick<Sight, 'id' | 'lat' | 'lon' | 'time' | 'kind'>
const dist = (a: Place, b: Place) => haversine([a.lon!, a.lat!], [b.lon!, b.lat!])
const length = (path: Place[]) => path.slice(1).reduce((a, p, i) => a + dist(path[i], p), 0)

/**
 * El día en el orden más corto y los km (en línea recta) que se ahorran. null si no merece la pena (menos del 10 % o de
 * 300 m), si hay menos de 4 sitios con ubicación o si alguno tiene hora: entonces el orden lo mandan las horas.
 */
export function nearOrder<T extends Place>(sights: T[]): { order: T[]; saved: number } | null {
  if (sights.some((s) => s.time)) return null
  const head: T[] = []
  const blocks: T[][] = []
  for (const s of sights) {
    if (!isNote(s) && s.lat != null && s.lon != null) blocks.push([s])
    else (blocks.at(-1) ?? head).push(s)
  }
  if (blocks.length < 4) return null

  // Vecino más cercano y después 2-opt (dar la vuelta a un tramo si acorta), con el primero fijo.
  const left = blocks.slice(1)
  const path = [blocks[0]]
  while (left.length) {
    const from = path.at(-1)![0]
    const k = left.reduce((best, b, i) => (dist(from, b[0]) < dist(from, left[best][0]) ? i : best), 0)
    path.push(...left.splice(k, 1))
  }
  const improve = (start: T[][]) => {
    let best = start
    for (let better = true; better; ) {
      better = false
      for (let i = 1; i < best.length - 1; i++)
        for (let j = i + 1; j < best.length; j++) {
          const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
          if (total(next) < total(best) - 1e-9) {
            best = next
            better = true
          }
        }
    }
    return best
  }
  const total = (b: T[][]) => length(b.map((x) => x[0]))
  // Se mejoran las dos (la de vecinos y la del usuario) y se queda la más corta.
  const [a, b] = [improve(path), improve(blocks)]
  const best = total(a) < total(b) ? a : b
  const before = total(blocks)
  const saved = before - total(best)
  if (saved < 0.3 || saved < before * 0.1) return null
  return { order: [...head, ...best.flat()], saved }
}
