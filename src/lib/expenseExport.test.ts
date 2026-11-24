import { describe, expect, it } from 'vitest'
import type { Expense } from './db'
import { expenseRows, expensesCsv, sharesLabel } from './expenseExport'
import { balancesOf, formatMoney, netBalances, settleBalances } from './money'

const P = ['u:a', 'u:b', 'u:c', 'u:d']
const NAMES: Record<string, string> = { 'u:a': 'Ana', 'u:b': 'Bea', 'u:c': 'Cai', 'u:d': 'Dani' }
const nameOf = (k: string) => NAMES[k] ?? k
const entre = (...keys: string[]) => keys.map((k) => ({ k, v: 1 }))

let n = 0
const gasto = (e: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  trip_id: 't',
  stop_id: null,
  user_id: null,
  paid_by: null,
  category: 'food',
  description: null,
  amount: 10,
  currency: 'EUR',
  rate: 1,
  spent_on: '2026-11-19',
  payer_key: 'u:a',
  split_mode: 'equal',
  split: entre(...P),
  created_at: '2026-11-19T00:00:00Z',
  ...e,
})
const pago = (from: string, to: string, amount: number) => gasto({ category: 'settlement', payer_key: from, amount, split_mode: 'amount', split: [{ k: to, v: amount }] })

describe('exportar gastos', () => {
  it('pasa todos los gastos y pagos, con importes convertidos y por fecha', () => {
    const cena = gasto({ description: 'Cena', amount: 1000, currency: 'TRY', rate: 0.018, spent_on: '2026-11-20' })
    const lines = expensesCsv([cena, gasto({ description: 'Metro' }), pago('u:b', 'u:a', 5)], P, nameOf, 'EUR').trim().split('\r\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('Parte de Ana (EUR)')
    expect(lines[1]).toContain('Metro')
    expect(lines[3]).toBe('2026-11-20;Gasto;Cena;Comida;1000,00;TRY;18,00;Ana;4,50;4,50;4,50;4,50')
  })

  it('escapa separadores y neutraliza fórmulas', () => {
    const csv = expensesCsv([gasto({ description: '=1+1' }), gasto({ description: 'a;"b"' })], P, nameOf, 'EUR')
    expect(csv).toContain(";'=1+1;")
    expect(csv).toContain(';"a;""b""";')
  })

  it('describe quién participa', () => {
    const label = (e: Expense) => sharesLabel(expenseRows([e], P, nameOf)[0], P, nameOf)
    expect(label(gasto({}))).toBe('Todos')
    expect(label(gasto({ split: entre('u:b', 'u:c', 'u:d') }))).toBe('Todos menos Ana')
    expect(label(gasto({ split: entre('u:b') }))).toBe('Solo Bea')
    expect(label(gasto({ split_mode: 'shares', amount: 9, split: [{ k: 'u:a', v: 1 }, { k: 'u:b', v: 2 }] }))).toBe('Ana 3,00, Bea 6,00')
    expect(label(pago('u:b', 'u:a', 5))).toBe('Ana')
  })
})

describe('saldos al céntimo', () => {
  it('suman cero y, al apuntar los pagos propuestos, no queda ninguna deuda', () => {
    const list = [gasto({ split: entre('u:a', 'u:b', 'u:c') }), gasto({ amount: 0.05, payer_key: 'u:b' }), gasto({ amount: 1098, rate: 0.018069556, payer_key: 'u:c' })]
    const { paid, owed } = balancesOf(list, P)
    expect(Math.abs([...netBalances(paid, owed).values()].reduce((a, b) => a + b, 0))).toBeLessThan(0.001)
    const after = balancesOf([...list, ...settleBalances(paid, owed).map((t) => pago(t.from, t.to, t.amount))], P)
    expect(settleBalances(after.paid, after.owed)).toEqual([])
  })

  it('un pago que no propuso la app también cuenta (a cualquiera y por cualquier importe)', () => {
    const { paid, owed } = balancesOf([gasto({ amount: 40 }), pago('u:b', 'u:c', 28)], P)
    expect(netBalances(paid, owed).get('u:b')).toBe(18)
    expect(netBalances(paid, owed).get('u:c')).toBe(-38)
  })

  it('se ven los céntimos por encima de 1000', () => {
    expect(formatMoney(1028.4, 'EUR')).toContain('28,40')
    expect(formatMoney(50, 'EUR')).not.toContain(',')
  })
})
