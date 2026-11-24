// Dinero del viaje: monedas, moneda de cada país, tipos de cambio y formato.
// Tipos de cambio: currency-api de Fawaz Ahmed (datos CC0, gratis y sin clave, servidos por jsDelivr), con
// histórico diario: https://github.com/fawazahmed0/exchange-api
import { isSettlement } from './balances.js'
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
      // Los céntimos se ven siempre (también por encima de 1000): son cuentas entre personas.
      maximumFractionDigits: opts.compact ? 0 : 2,
      minimumFractionDigits: opts.compact || Math.round(amount * 100) % 100 === 0 ? 0 : 2,
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

// Las cuentas van en balances.js: las comparte la función de Vercel que recuerda las deudas.
export { balancesOf, isSettlement, netBalances, settleBalances, sharesOf } from './balances.js'

/** Lo gastado de verdad (sin los pagos entre personas), en la moneda del viaje. */
export const totalSpent = (list: Pick<Expense, 'category' | 'amount' | 'rate'>[]) => list.reduce((a, e) => (isSettlement(e) ? a : a + e.amount * e.rate), 0)
