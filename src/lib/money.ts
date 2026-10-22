// Dinero del viaje: monedas, moneda de cada país, tipos de cambio y formato.
// Tipos de cambio: currency-api de Fawaz Ahmed (datos CC0, gratis y sin clave, servidos por jsDelivr), con
// histórico diario: https://github.com/fawazahmed0/exchange-api
import type { Expense, ExpenseCategory } from './db'

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; icon: string; color: string }> = {
  flights: { label: 'Vuelos', icon: 'flight', color: '#b33200' },
  transport: { label: 'Transporte', icon: 'commute', color: '#e2581e' },
  // Gris pizarra en vez de casi negro: se ve sobre fondo claro y oscuro, y con el icono blanco encima.
  lodging: { label: 'Alojamiento', icon: 'hotel', color: '#56606b' },
  food: { label: 'Comida', icon: 'restaurant', color: '#e8933a' },
  drinks: { label: 'Bebidas y ocio', icon: 'local_bar', color: '#a8458f' },
  activities: { label: 'Entradas', icon: 'local_activity', color: '#5b6cff' },
  tours: { label: 'Excursiones', icon: 'tour', color: '#2f7fb8' },
  shopping: { label: 'Compras', icon: 'shopping_bag', color: '#2e9e6b' },
  gifts: { label: 'Regalos', icon: 'redeem', color: '#d4a017' },
  health: { label: 'Salud', icon: 'medical_services', color: '#c43c4c' },
  connectivity: { label: 'Internet y SIM', icon: 'sim_card', color: '#4b9a9a' },
  tips: { label: 'Propinas', icon: 'volunteer_activism', color: '#9a7b4b' },
  fees: { label: 'Trámites y seguros', icon: 'description', color: '#8a8d93' },
  other: { label: 'Otros', icon: 'more_horiz', color: '#c4c6cb' },
}
export const CATEGORY_ORDER = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]

/** Moneda de los países más visitados (el resto usa la del viaje por defecto). */
const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK'.split(' ')
const COUNTRY_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
  GB: 'GBP', CH: 'CHF', LI: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN',
  RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL', TR: 'TRY', UA: 'UAH', GE: 'GEL', AM: 'AMD', RU: 'RUB',
  US: 'USD', CA: 'CAD', MX: 'MXN', CU: 'CUP', DO: 'DOP', CR: 'CRC', PA: 'USD', GT: 'GTQ', CO: 'COP', PE: 'PEN', CL: 'CLP', AR: 'ARS',
  BR: 'BRL', UY: 'UYU', PY: 'PYG', BO: 'BOB', EC: 'USD', VE: 'VES',
  MA: 'MAD', TN: 'TND', EG: 'EGP', ZA: 'ZAR', KE: 'KES', TZ: 'TZS', SN: 'XOF', NA: 'NAD', MU: 'MUR',
  AE: 'AED', QA: 'QAR', SA: 'SAR', JO: 'JOD', IL: 'ILS', OM: 'OMR', IN: 'INR', NP: 'NPR', LK: 'LKR', MV: 'MVR',
  CN: 'CNY', HK: 'HKD', MO: 'MOP', TW: 'TWD', JP: 'JPY', KR: 'KRW', TH: 'THB', VN: 'VND', KH: 'KHR', LA: 'LAK', MM: 'MMK',
  MY: 'MYR', SG: 'SGD', ID: 'IDR', PH: 'PHP', AU: 'AUD', NZ: 'NZD', FJ: 'FJD',
}
export const currencyForCountry = (cc?: string | null) => (cc ? COUNTRY_CURRENCY[cc] : undefined)

/** Monedas que se ofrecen en el selector (las de la tabla y algunas más). */
export const CURRENCIES = [...new Set(['EUR', 'USD', 'GBP', ...Object.values(COUNTRY_CURRENCY)])].sort()

const names = (() => {
  try {
    return new Intl.DisplayNames('es', { type: 'currency' })
  } catch {
    return null
  }
})()
export const currencyName = (code: string) => names?.of(code) ?? code

export function formatMoney(amount: number, currency: string, opts: { compact?: boolean } = {}) {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: opts.compact || Math.abs(amount) >= 1000 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('es-ES')} ${currency}`
  }
}

const rates = new Map<string, Promise<number>>()
const SOURCES = (date: string, from: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${from}.json`,
  `https://${date}.currency-api.pages.dev/v1/currencies/${from}.json`,
]

/**
 * Unidades de `to` por cada unidad de `from` el día `date` (o el último disponible). Solo se envían las
 * monedas y la fecha. Si la fecha es futura o muy antigua se usa el cambio de hoy.
 */
export function exchangeRate(from: string, to: string, date?: string | null): Promise<number> {
  if (from === to) return Promise.resolve(1)
  const today = new Date().toISOString().slice(0, 10)
  const day = date && date < today && date >= '2024-03-02' ? date : 'latest'
  const key = `${from}>${to}@${day}`
  if (!rates.has(key)) {
    const f = from.toLowerCase()
    const t = to.toLowerCase()
    const p = (async () => {
      for (const url of SOURCES(day, f)) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
          if (!res.ok) continue
          const json = (await res.json()) as Record<string, Record<string, number>>
          const r = json[f]?.[t]
          if (r && r > 0) return r
        } catch {
          /* siguiente fuente */
        }
      }
      throw new Error('No se pudo obtener el tipo de cambio')
    })().catch((e) => {
      rates.delete(key)
      throw e
    })
    rates.set(key, p)
  }
  return rates.get(key)!
}

/**
 * Lo que le toca a cada persona de un gasto, en la moneda del viaje. `people`: todas las del viaje.
 * Sin reparto guardado (gastos de antes de poder elegirlo) se divide entre quienes tienen cuenta, como entonces:
 * así, añadir después a un compañero sin cuenta no cambia lo que ya estaba repartido.
 */
export function sharesOf(e: Pick<Expense, 'amount' | 'rate' | 'split_mode' | 'split'>, people: string[]): Map<string, number> {
  const total = e.amount * e.rate
  const out = new Map<string, number>()
  const split = (e.split ?? []).filter((x) => x.v > 0)
  const mode = e.split_mode ?? 'equal'
  if (!split.length || mode === 'equal') {
    const members = people.filter((k) => k.startsWith('u:'))
    const who = split.length ? split.map((x) => x.k) : members.length ? members : people
    for (const k of who) out.set(k, total / Math.max(1, who.length))
  } else if (mode === 'percent') {
    for (const x of split) out.set(x.k, (total * x.v) / 100)
  } else if (mode === 'amount') {
    for (const x of split) out.set(x.k, x.v * e.rate)
  } else {
    const sum = split.reduce((a, x) => a + x.v, 0)
    for (const x of split) out.set(x.k, (total * x.v) / sum)
  }
  return out
}

/** ¿Es un pago para saldar cuentas («Julia te ha pagado 45 €») y no un gasto? */
export const isSettlement = (e: Pick<Expense, 'category'>) => e.category === 'settlement'
/** Lo gastado de verdad (sin los pagos para saldar cuentas), en la moneda del viaje. */
export const totalSpent = (list: Pick<Expense, 'category' | 'amount' | 'rate'>[]) => list.reduce((a, e) => (isSettlement(e) ? a : a + e.amount * e.rate), 0)

/** Saldo de cada persona (pagado − lo que le toca): positivo = le deben, negativo = debe. */
export function balancesOf(expenses: Expense[], people: string[]) {
  const paid = new Map<string, number>(people.map((p) => [p, 0]))
  const owed = new Map<string, number>(people.map((p) => [p, 0]))
  for (const e of expenses) {
    const payer = e.payer_key ?? (e.paid_by ? `u:${e.paid_by}` : null)
    if (!payer) continue // sin «pagó» no entra en las cuentas
    paid.set(payer, (paid.get(payer) ?? 0) + e.amount * e.rate)
    for (const [k, v] of sharesOf(e, people)) owed.set(k, (owed.get(k) ?? 0) + v)
  }
  return { paid, owed }
}

/** Quién paga a quién para quedar en paz, con el mínimo de pagos (de mayor deudor a mayor acreedor). */
export function settleBalances(paid: Map<string, number>, owed: Map<string, number>): { from: string; to: string; amount: number }[] {
  const keys = [...new Set([...paid.keys(), ...owed.keys()])]
  const balance = keys.map((p) => ({ p, v: (paid.get(p) ?? 0) - (owed.get(p) ?? 0) }))
  const debtors = balance.filter((b) => b.v < -0.005).sort((a, b) => a.v - b.v)
  const creditors = balance.filter((b) => b.v > 0.005).sort((a, b) => b.v - a.v)
  const out: { from: string; to: string; amount: number }[] = []
  for (const d of debtors) {
    let owe = -d.v
    for (const c of creditors) {
      if (owe < 0.005) break
      if (c.v < 0.005) continue
      const x = Math.min(owe, c.v)
      out.push({ from: d.p, to: c.p, amount: x })
      owe -= x
      c.v -= x
    }
  }
  return out
}
