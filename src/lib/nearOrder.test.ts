import { describe, expect, it } from 'vitest'
import type { Expense, Sight } from './db'
import { findDuplicate, guessCategory } from './expenseGuess'
import { nearOrder } from './nearOrder'

type P = Pick<Sight, 'id' | 'lat' | 'lon' | 'time' | 'kind'>
const p = (id: string, x: number | null, extra: Partial<P> = {}): P => ({ id, lat: x == null ? null : 41, lon: x == null ? null : 29 + x / 100, time: null, ...extra })
const ids = (r: ReturnType<typeof nearOrder>) => r?.order.map((s) => s.id).join('')

describe('nearOrder', () => {
  it('evita ir y volver y empieza por el mismo sitio', () => {
    const r = nearOrder([p('a', 0), p('d', 3), p('b', 1), p('c', 2)])
    expect(ids(r)).toBe('abcd')
    expect(r!.saved).toBeGreaterThan(1)
  })
  it('las notas y los sitios sin ubicación siguen a su sitio, y no se pierde ninguno', () => {
    expect(ids(nearOrder([p('n', null, { kind: 'note' }), p('a', 0), p('d', 3), p('x', null), p('b', 1), p('c', 2)]))).toBe('nabcdx')
  })
  it('no propone nada si hay horas, pocos sitios o ya está bien', () => {
    expect(nearOrder([p('a', 0, { time: '10:00' }), p('d', 3), p('b', 1), p('c', 2)])).toBeNull()
    expect(nearOrder([p('a', 0), p('c', 2), p('b', 1)])).toBeNull()
    expect(nearOrder([p('a', 0), p('b', 1), p('c', 2), p('d', 3)])).toBeNull()
  })
})

describe('guessCategory', () => {
  it.each([
    ['uber', 'transport'],
    ['Taxi aeropuerto', 'transport'],
    ['recarga bonobús', 'transport'],
    ['sudaderas', 'shopping'],
    ['colonias', 'shopping'],
    ['parte 1 bolsos', 'shopping'],
    ['Cerveza', 'drinks'],
    ['cena 2', 'food'],
    ['Entradas palacio', 'activities'],
    ['hoteles', 'lodging'],
  ])('%s → %s', (text, category) => expect(guessCategory(text)).toBe(category))
  it('no adivina si no reconoce nada (ni dentro de otra palabra)', () => {
    expect(guessCategory('pistola')).toBeNull()
    expect(guessCategory('Barbería')).toBeNull()
    expect(guessCategory('')).toBeNull()
  })
})

it('findDuplicate: mismo día, importe y moneda; nunca él mismo ni un pago', () => {
  const x = { id: '1', amount: 20, currency: 'EUR', spent_on: '2026-11-19', category: 'food' } as Expense
  const same = { amount: 20, currency: 'EUR', spent_on: '2026-11-19' }
  expect(findDuplicate([x], same)?.id).toBe('1')
  expect(findDuplicate([x], { ...same, id: '1' })).toBeUndefined()
  expect(findDuplicate([x], { ...same, currency: 'TRY' })).toBeUndefined()
  expect(findDuplicate([{ ...x, category: 'settlement' }], same)).toBeUndefined()
})
