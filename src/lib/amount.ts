// Importes escritos a mano y fecha de hoy, para los formularios de gastos.
import { localDate } from './today'

export const parseAmount = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
// La fecha del móvil: en UTC, un gasto de madrugada en Estambul salía con el día anterior.
export const today = () => localDate()
export const parseNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}
export const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
