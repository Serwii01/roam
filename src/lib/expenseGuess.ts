// Ayudas al apuntar un gasto: la categoría según lo escrito y el aviso de que parece repetido.
import type { Expense, ExpenseCategory } from './db'
import { fold } from './exonyms'
import { isSettlement } from './money'

// Por orden: gana la primera que coincide («taxi al aeropuerto» es transporte; «entrada museo», entradas).
// Palabras enteras, sin tildes y en singular (se acepta el plural).
const WORDS: [ExpenseCategory, string][] = [
  ['flights', 'vuelo avion aerolinea ryanair vueling iberia easyjet pegasus'],
  ['transport', 'taxi uber cabify bolt bitaksi metro bus autobus bonobus tranvia tren ferry barco gasolina peaje parking aparcamiento transfer bono billete'],
  ['lodging', 'hotel hostal hostel airbnb apartamento alojamiento riad ryokan camping'],
  ['tips', 'propina'],
  ['connectivity', 'sim esim roaming internet wifi datos'],
  ['health', 'farmacia medicina medico ibuprofeno paracetamol tirita'],
  ['fees', 'visado visa seguro tasa comision'],
  ['activities', 'entrada museo palacio concierto teatro cine espectaculo partido estadio hammam'],
  ['tours', 'excursion tour visita crucero guia'],
  ['gifts', 'regalo iman souvenir recuerdo postal'],
  ['drinks', 'cerveza birra copa vino bar pub discoteca coctel cubata chupito'],
  ['shopping', 'sudadera camiseta ropa zapatilla bolso cartera colonia perfume gafas chaqueta gorra bufanda reloj joya'],
  ['food', 'desayuno comida almuerzo merienda cena cafe te kebab pizza restaurante super supermercado helado dulce baklava bocadillo hamburguesa agua'],
]
const INDEX = new Map(WORDS.flatMap(([c, words], rank) => words.split(' ').map((w) => [w, { c, rank }] as const)))

/** Categoría que sugiere la descripción, o null si no se reconoce ninguna palabra. */
export function guessCategory(description: string): ExpenseCategory | null {
  let best: { c: ExpenseCategory; rank: number } | null = null
  for (const w of fold(description).split(/[^a-z0-9ñ]+/)) {
    const hit = INDEX.get(w) ?? INDEX.get(w.replace(/s$/, '')) ?? INDEX.get(w.replace(/es$/, ''))
    if (hit && (!best || hit.rank < best.rank)) best = hit
  }
  return best?.c ?? null
}

/** Otro gasto del mismo día con el mismo importe y moneda: puede que lo haya apuntado ya otra persona. */
export function findDuplicate(list: Expense[], e: { id?: string; amount: number; currency: string; spent_on: string | null }): Expense | undefined {
  return list.find((x) => x.id !== e.id && !isSettlement(x) && x.currency === e.currency && Math.abs(x.amount - e.amount) < 0.005 && x.spent_on === e.spent_on)
}
