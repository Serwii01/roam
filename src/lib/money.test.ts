// Reparto de gastos y saldos: si esto falla, la app le dice a alguien que debe un dinero que no debe.
import { describe, expect, it } from 'vitest'
import type { Expense } from './db'
import { balancesOf, isSettlement, settleBalances, sharesOf, totalSpent } from './money'

const A = 'u:ana'
const B = 'u:bea'
const C = 'g:Carlos'

const expense = (patch: Partial<Expense>) => ({ amount: 0, rate: 1, split_mode: 'equal', split: null, payer_key: null, paid_by: null, category: 'food', ...patch }) as Expense

/** Saldo final de cada persona: positivo = le deben. */
function net(expenses: Expense[], people: string[]) {
  const { paid, owed } = balancesOf(expenses, people)
  return Object.fromEntries([...new Set([...paid.keys(), ...owed.keys()])].map((k) => [k, (paid.get(k) ?? 0) - (owed.get(k) ?? 0)]))
}

describe('sharesOf', () => {
  it('a partes iguales entre los marcados', () => {
    const s = sharesOf(expense({ amount: 90, split: [{ k: A, v: 1 }, { k: C, v: 1 }] }), [A, B, C])
    expect([...s.keys()]).toEqual([A, C])
    expect(s.get(A)).toBe(45)
    expect(s.get(C)).toBe(45)
  })

  it('sin reparto guardado se divide solo entre quienes tienen cuenta', () => {
    const s = sharesOf(expense({ amount: 100 }), [A, B, C])
    expect(s.get(A)).toBe(50)
    expect(s.get(B)).toBe(50)
    expect(s.has(C)).toBe(false)
  })

  it('sin nadie con cuenta se divide entre todos', () => {
    const s = sharesOf(expense({ amount: 30 }), [C, 'g:Dani', 'g:Eva'])
    expect([...s.values()]).toEqual([10, 10, 10])
  })

  it('por porcentaje', () => {
    const s = sharesOf(expense({ amount: 200, split_mode: 'percent', split: [{ k: A, v: 75 }, { k: B, v: 25 }] }), [A, B])
    expect(s.get(A)).toBe(150)
    expect(s.get(B)).toBe(50)
  })

  it('por importe, convertido a la moneda del viaje', () => {
    const s = sharesOf(expense({ amount: 100, rate: 0.5, split_mode: 'amount', split: [{ k: A, v: 70 }, { k: B, v: 30 }] }), [A, B])
    expect(s.get(A)).toBe(35)
    expect(s.get(B)).toBe(15)
  })

  it('por partes: quien tiene 2 paga el doble', () => {
    const s = sharesOf(expense({ amount: 90, split_mode: 'shares', split: [{ k: A, v: 2 }, { k: B, v: 1 }] }), [A, B])
    expect(s.get(A)).toBe(60)
    expect(s.get(B)).toBe(30)
  })

  it('ignora a quien tiene 0 en el reparto', () => {
    const s = sharesOf(expense({ amount: 90, split_mode: 'shares', split: [{ k: A, v: 1 }, { k: B, v: 0 }] }), [A, B])
    expect(s.get(A)).toBe(90)
    expect(s.has(B)).toBe(false)
  })

  it('aplica el tipo de cambio', () => {
    const s = sharesOf(expense({ amount: 1000, rate: 0.03, split: [{ k: A, v: 1 }, { k: B, v: 1 }] }), [A, B])
    expect(s.get(A)).toBeCloseTo(15)
  })
})

describe('balancesOf', () => {
  it('lo que uno paga por todos se lo deben los demás', () => {
    const n = net([expense({ amount: 90, payer_key: A, split: [{ k: A, v: 1 }, { k: B, v: 1 }, { k: C, v: 1 }] })], [A, B, C])
    expect(n[A]).toBeCloseTo(60)
    expect(n[B]).toBeCloseTo(-30)
    expect(n[C]).toBeCloseTo(-30)
  })

  it('sin «pagó» el gasto no entra en las cuentas', () => {
    const n = net([expense({ amount: 90 })], [A, B])
    expect(n[A]).toBe(0)
    expect(n[B]).toBe(0)
  })

  it('usa paid_by en los gastos antiguos sin payer_key', () => {
    const { paid } = balancesOf([expense({ amount: 40, paid_by: 'ana' })], [A, B])
    expect(paid.get(A)).toBe(40)
  })

  it('un pago para saldar cuentas deja a las dos personas en paz', () => {
    const list = [
      expense({ amount: 100, payer_key: A, split: [{ k: A, v: 1 }, { k: B, v: 1 }] }),
      expense({ amount: 50, payer_key: B, category: 'settlement', split_mode: 'amount', split: [{ k: A, v: 50 }] }),
    ]
    const n = net(list, [A, B])
    expect(n[A]).toBeCloseTo(0)
    expect(n[B]).toBeCloseTo(0)
  })

  it('cuenta a quien pagó aunque ya no esté en el viaje', () => {
    const n = net([expense({ amount: 60, payer_key: 'u:ex', split: [{ k: A, v: 1 }, { k: B, v: 1 }] })], [A, B])
    expect(n['u:ex']).toBe(60)
  })

  it('los saldos siempre suman cero', () => {
    const list = [
      expense({ amount: 33.33, payer_key: A, split: [{ k: A, v: 1 }, { k: B, v: 1 }, { k: C, v: 1 }] }),
      expense({ amount: 1500, rate: 0.0061, payer_key: B, split_mode: 'percent', split: [{ k: A, v: 10 }, { k: B, v: 30 }, { k: C, v: 60 }] }),
      expense({ amount: 71, payer_key: C, split_mode: 'shares', split: [{ k: A, v: 3 }, { k: C, v: 1 }] }),
    ]
    expect(Object.values(net(list, [A, B, C])).reduce((a, v) => a + v, 0)).toBeCloseTo(0)
  })
})

describe('settleBalances', () => {
  const settle = (balance: Record<string, number>) => settleBalances(new Map(Object.entries(balance).map(([k, v]) => [k, Math.max(v, 0)])), new Map(Object.entries(balance).map(([k, v]) => [k, Math.max(-v, 0)])))

  it('sin deudas no hay pagos', () => {
    expect(settle({ [A]: 0, [B]: 0 })).toEqual([])
  })

  it('el que debe paga al que le deben', () => {
    expect(settle({ [A]: 30, [B]: -30 })).toEqual([{ from: B, to: A, amount: 30 }])
  })

  it('reparte una deuda entre dos acreedores', () => {
    expect(settle({ [A]: 20, [B]: 10, [C]: -30 })).toEqual([
      { from: C, to: A, amount: 20 },
      { from: C, to: B, amount: 10 },
    ])
  })

  it('ignora los restos de redondeo de menos de medio céntimo', () => {
    expect(settle({ [A]: 0.004, [B]: -0.004 })).toEqual([])
  })

  it('después de pagar, todo el mundo queda a cero', () => {
    const balance: Record<string, number> = { a: 41.37, b: -12.5, c: 7.13, d: -36, e: 0 }
    for (const p of settle(balance)) {
      balance[p.from] += p.amount
      balance[p.to] -= p.amount
    }
    for (const v of Object.values(balance)) expect(Math.abs(v)).toBeLessThan(0.01)
  })
})

describe('totalSpent', () => {
  it('no cuenta los pagos para saldar cuentas', () => {
    const list = [expense({ amount: 100, rate: 0.5 }), expense({ amount: 10 }), expense({ amount: 999, category: 'settlement' })]
    expect(totalSpent(list)).toBe(60)
    expect(list.filter(isSettlement)).toHaveLength(1)
  })
})
