import { describe, expect, it } from 'vitest'
import type { Expense } from './db'
import { balancesOf, settleBalances, sharesOf, totalSpent } from './money'

const ANA = 'u:ana'
const BEA = 'u:bea'
const CARLOS = 'g:Carlos' // compañero sin cuenta
const PEOPLE = [ANA, BEA, CARLOS]

let n = 0
const gasto = (e: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  trip_id: 't1',
  stop_id: null,
  user_id: null,
  paid_by: null,
  category: 'food',
  description: null,
  amount: 0,
  currency: 'EUR',
  rate: 1,
  spent_on: null,
  payer_key: null,
  split_mode: 'equal',
  split: null,
  created_at: '2026-01-01T00:00:00Z',
  ...e,
})

/** Saldo final de cada uno: positivo = le deben. */
const saldos = (list: Expense[], people = PEOPLE) => {
  const { paid, owed } = balancesOf(list, people)
  return Object.fromEntries(people.map((p) => [p, (paid.get(p) ?? 0) - (owed.get(p) ?? 0)]))
}

describe('sharesOf', () => {
  it('sin reparto guardado divide solo entre quienes tienen cuenta', () => {
    const s = sharesOf(gasto({ amount: 90 }), PEOPLE)
    expect(Object.fromEntries(s)).toEqual({ [ANA]: 45, [BEA]: 45 })
  })

  it('si nadie tiene cuenta, divide entre todos', () => {
    const s = sharesOf(gasto({ amount: 30 }), ['g:Uno', 'g:Dos', 'g:Tres'])
    expect([...s.values()]).toEqual([10, 10, 10])
  })

  it('a partes iguales entre los elegidos, sin cuenta incluidos', () => {
    const s = sharesOf(gasto({ amount: 60, split: [{ k: ANA, v: 1 }, { k: CARLOS, v: 1 }] }), PEOPLE)
    expect(Object.fromEntries(s)).toEqual({ [ANA]: 30, [CARLOS]: 30 })
  })

  it('ignora a quien tiene valor 0 en el reparto', () => {
    const s = sharesOf(gasto({ amount: 60, split: [{ k: ANA, v: 1 }, { k: BEA, v: 0 }, { k: CARLOS, v: 1 }] }), PEOPLE)
    expect(s.has(BEA)).toBe(false)
    expect(s.get(ANA)).toBe(30)
  })

  it('por porcentaje', () => {
    const s = sharesOf(gasto({ amount: 200, split_mode: 'percent', split: [{ k: ANA, v: 75 }, { k: BEA, v: 25 }] }), PEOPLE)
    expect(Object.fromEntries(s)).toEqual({ [ANA]: 150, [BEA]: 50 })
  })

  it('por importe, convertido a la moneda del viaje', () => {
    // 100 USD a 0,9: Ana 70 USD (63 €), Bea 30 USD (27 €)
    const s = sharesOf(gasto({ amount: 100, currency: 'USD', rate: 0.9, split_mode: 'amount', split: [{ k: ANA, v: 70 }, { k: BEA, v: 30 }] }), PEOPLE)
    expect(s.get(ANA)).toBeCloseTo(63)
    expect(s.get(BEA)).toBeCloseTo(27)
  })

  it('por partes', () => {
    const s = sharesOf(gasto({ amount: 120, split_mode: 'shares', split: [{ k: ANA, v: 2 }, { k: BEA, v: 1 }, { k: CARLOS, v: 1 }] }), PEOPLE)
    expect(Object.fromEntries(s)).toEqual({ [ANA]: 60, [BEA]: 30, [CARLOS]: 30 })
  })

  it('aplica el tipo de cambio', () => {
    const s = sharesOf(gasto({ amount: 1000, currency: 'JPY', rate: 0.006 }), [ANA, BEA])
    expect(s.get(ANA)).toBeCloseTo(3)
  })
})

describe('totalSpent', () => {
  it('suma en la moneda del viaje y no cuenta los pagos para saldar', () => {
    const list = [gasto({ amount: 50 }), gasto({ amount: 100, rate: 0.5 }), gasto({ amount: 40, category: 'settlement' })]
    expect(totalSpent(list)).toBe(100)
  })
})

describe('balancesOf', () => {
  it('quien paga queda a favor por lo que pagó menos su parte', () => {
    expect(saldos([gasto({ amount: 90, payer_key: ANA })], [ANA, BEA])).toEqual({ [ANA]: 45, [BEA]: -45 })
  })

  it('usa paid_by si no hay payer_key (gastos antiguos)', () => {
    expect(saldos([gasto({ amount: 90, paid_by: 'bea' })], [ANA, BEA])).toEqual({ [ANA]: -45, [BEA]: 45 })
  })

  it('un gasto sin «pagó» no entra en las cuentas', () => {
    expect(saldos([gasto({ amount: 90 })], [ANA, BEA])).toEqual({ [ANA]: 0, [BEA]: 0 })
  })

  it('los saldos siempre suman cero', () => {
    const list = [
      gasto({ amount: 90, payer_key: ANA }),
      gasto({ amount: 33.33, payer_key: CARLOS, split: [{ k: ANA, v: 1 }, { k: BEA, v: 1 }, { k: CARLOS, v: 1 }] }),
      gasto({ amount: 100, currency: 'USD', rate: 0.93, payer_key: BEA, split_mode: 'percent', split: [{ k: ANA, v: 10 }, { k: BEA, v: 60 }, { k: CARLOS, v: 30 }] }),
    ]
    const total = Object.values(saldos(list)).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(0, 9)
  })

  it('un pago para saldar deja las cuentas en paz', () => {
    const list = [
      gasto({ amount: 90, payer_key: ANA }),
      // Bea le paga a Ana sus 45 €
      gasto({ amount: 45, category: 'settlement', payer_key: BEA, split: [{ k: ANA, v: 1 }] }),
    ]
    const s = saldos(list, [ANA, BEA])
    expect(s[ANA]).toBeCloseTo(0)
    expect(s[BEA]).toBeCloseTo(0)
  })
})

describe('settleBalances', () => {
  const settle = (list: Expense[], people = PEOPLE) => {
    const { paid, owed } = balancesOf(list, people)
    return settleBalances(paid, owed)
  }

  it('sin gastos no hay pagos', () => {
    expect(settle([])).toEqual([])
  })

  it('un deudor y un acreedor: un solo pago', () => {
    expect(settle([gasto({ amount: 90, payer_key: ANA })], [ANA, BEA])).toEqual([{ from: BEA, to: ANA, amount: 45 }])
  })

  it('con varios, cada deudor paga lo suyo y quedan todos en paz', () => {
    const list = [
      gasto({ amount: 300, payer_key: ANA, split: PEOPLE.map((k) => ({ k, v: 1 })) }),
      gasto({ amount: 60, payer_key: BEA, split: PEOPLE.map((k) => ({ k, v: 1 })) }),
    ]
    // Cada uno debía 120: Ana +180, Bea −60, Carlos −120
    const pagos = settle(list)
    expect(pagos).toEqual([
      { from: CARLOS, to: ANA, amount: 120 },
      { from: BEA, to: ANA, amount: 60 },
    ])
  })

  it('tras hacer los pagos propuestos, el saldo de todos es cero', () => {
    const list = [
      gasto({ amount: 123.45, payer_key: ANA, split: PEOPLE.map((k) => ({ k, v: 1 })) }),
      gasto({ amount: 67.8, payer_key: BEA, split_mode: 'shares', split: [{ k: ANA, v: 1 }, { k: BEA, v: 2 }, { k: CARLOS, v: 3 }] }),
      gasto({ amount: 5000, currency: 'JPY', rate: 0.0061, payer_key: CARLOS, split: [{ k: ANA, v: 1 }, { k: BEA, v: 1 }] }),
    ]
    const pagos = settle(list)
    const settlements = pagos.map((p) => gasto({ amount: p.amount, category: 'settlement', payer_key: p.from, split: [{ k: p.to, v: 1 }] }))
    for (const v of Object.values(saldos([...list, ...settlements]))) expect(Math.abs(v)).toBeLessThan(0.01)
    expect(pagos.length).toBeLessThanOrEqual(PEOPLE.length - 1)
  })

  it('ignora los céntimos de redondeo', () => {
    const paid = new Map([[ANA, 10], [BEA, 0.003]])
    const owed = new Map([[ANA, 10.003], [BEA, 0]])
    expect(settleBalances(paid, owed)).toEqual([])
  })
})
