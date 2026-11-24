import { describe, expect, it, vi } from 'vitest'
import { balancesOf, netBalances } from './money'
import { groupNotifications } from './notifyGroup.js'
import { reminders, type ReminderTrip } from './reminders.js'
import type { Expense } from './db'

vi.mock('./supabase', () => ({ supabase: {} }))
const { pushPlan } = await import('./push')

const gasto = (e: Partial<Expense>): Expense => ({ id: 'e', trip_id: 't', stop_id: null, user_id: null, paid_by: null, category: 'food', description: null, amount: 30, currency: 'EUR', rate: 1, spent_on: '2026-11-19', payer_key: 'u:a', split_mode: 'equal', split: [{ k: 'u:a', v: 1 }, { k: 'u:b', v: 1 }], created_at: '2026-11-19T10:00:00Z', ...e })
const pago = (status: Expense['payment_status']) => gasto({ id: 'p', category: 'settlement', amount: 15, payer_key: 'u:b', split_mode: 'amount', split: [{ k: 'u:a', v: 15 }], payment_status: status, created_at: '2026-11-22T10:00:00Z', spent_on: '2026-11-22' })
const viaje = (expenses: Expense[], extra: Partial<ReminderTrip> = {}): ReminderTrip[] => [
  { trip: { id: 't', title: 'Estambul', user_id: 'a', start_date: '2026-11-18', end_date: '2026-11-22', companions: [] }, users: ['a', 'b'], expenses, budget: { currency: 'EUR', closed_at: null }, ...extra },
]

describe('recordatorios', () => {
  it('avisa solo a quien debe, unos días después de terminar', () => {
    const r = reminders(viaje([gasto({})]), '2026-11-23')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ user_id: 'b', kind: 'reminders', title: 'Te queda por pagar 15,00 €' })
    expect(reminders(viaje([gasto({})]), '2026-11-24')).toHaveLength(0)
  })
  it('no avisa si ya está en paz o con las cuentas cerradas', () => {
    expect(reminders(viaje([gasto({}), pago('confirmed')]), '2026-11-23')).toHaveLength(0)
    expect(reminders(viaje([gasto({})], { budget: { currency: 'EUR', closed_at: 'x' } }), '2026-11-23')).toHaveLength(0)
  })
  it('un pago rechazado vuelve a contar como deuda', () => {
    expect(reminders(viaje([gasto({}), pago('rejected')]), '2026-11-23')).toHaveLength(1)
  })
  it('recuerda confirmar un pago a quien lo recibe', () => {
    expect(reminders(viaje([gasto({}), pago('pending')]), '2026-11-24')).toMatchObject([{ user_id: 'a', tag: 'confirm-p' }])
  })
  it('pregunta por los gastos de ayer solo durante el viaje y si ayer no hubo ninguno', () => {
    expect(reminders(viaje([gasto({})]), '2026-11-21').map((x) => x.user_id)).toEqual(['a', 'b'])
    expect(reminders(viaje([gasto({})]), '2026-11-20')).toHaveLength(0)
    expect(reminders(viaje([]), '2026-11-21')).toHaveLength(0)
  })
  it('un viaje en solitario no recibe nada', () => {
    expect(reminders(viaje([gasto({})], { users: ['a'] }), '2026-11-23')).toHaveLength(0)
  })
})

it('los pagos rechazados no cuentan en los saldos y los pendientes sí', () => {
  const saldo = (s: Expense['payment_status']) => {
    const { paid, owed } = balancesOf([gasto({}), pago(s)], ['u:a', 'u:b'])
    return netBalances(paid, owed).get('u:b')
  }
  expect([saldo('pending'), saldo('confirmed'), saldo(null), saldo('rejected')]).toEqual([0, 0, 0, -15])
})

it('varios gastos del mismo viaje llegan en un solo aviso; los pagos, sueltos', () => {
  const n = (user_id: string, kind: string, title: string) => ({ user_id, kind, title, trip_id: 't', body: '', url: '/', tag: title })
  const out = groupNotifications([n('b', 'expenses', 'uno'), n('b', 'payments', 'pago'), n('b', 'expenses', 'dos'), n('c', 'expenses', 'tres')])
  expect(out.map((x) => x.title)).toEqual(['2 cambios en los gastos', 'pago', 'tres'])
})

describe('avisos por defecto', () => {
  const base = { support: 'ok' as const, permission: 'default', off: false, askedAt: 0, now: Date.now() }
  it('propone activarlos, y con permiso se activan solos', () => {
    expect(pushPlan(base)).toBe('ask')
    expect(pushPlan({ ...base, permission: 'granted' })).toBe('subscribe')
  })
  it('respeta a quien los desactiva, los bloquea o acaba de decir que luego', () => {
    expect(pushPlan({ ...base, permission: 'granted', off: true })).toBe('none')
    expect(pushPlan({ ...base, permission: 'denied' })).toBe('none')
    expect(pushPlan({ ...base, askedAt: Date.now() - 1000 })).toBe('none')
    expect(pushPlan({ ...base, support: 'ios-install' })).toBe('none')
  })
})
