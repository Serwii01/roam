// Historial de los gastos: qué cambió, en una frase, y recuperar lo borrado.
import type { NewExpense } from './api/types'
import type { Expense, ExpenseCategory, ExpenseChange } from './db'
import { EXPENSE_CATEGORIES, formatMoney, isSettlement } from './money'
import { payerOf } from './tripPeople'

const label = (e: Expense) => e.description || (isSettlement(e) ? (e.transfer_kind === 'cash' ? 'Cambio de efectivo' : 'Pago') : (EXPENSE_CATEGORIES[e.category as ExpenseCategory]?.label ?? 'Gasto'))
const money = (e: Expense) => formatMoney(Number(e.amount), e.currency)
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Qué se hizo («apuntó Cena · 30 €») y, si se cambió, qué. */
export function describeChange(c: ExpenseChange, nameOf: (key: string) => string): { title: string; details: string[] } {
  const e = (c.after ?? c.before)!
  const what = `${label(e)} · ${money(e)}`
  if (c.action === 'insert') return { title: `apuntó ${what}`, details: [] }
  if (c.action === 'delete') return { title: `borró ${what}`, details: [] }
  const [a, b] = [c.before!, c.after!]
  if (a.payment_status !== b.payment_status && same(a.split, b.split) && Number(a.amount) === Number(b.amount)) {
    const done = b.payment_status === 'confirmed' ? 'confirmó' : b.payment_status === 'rejected' ? 'rechazó' : 'dejó por confirmar'
    return { title: `${done} ${what}`, details: [] }
  }
  const who = (x: Expense) => {
    const k = payerOf(x)
    return k ? nameOf(k) : 'nadie'
  }
  const details: string[] = []
  if (Number(a.amount) !== Number(b.amount) || a.currency !== b.currency) details.push(`Importe: ${money(a)} → ${money(b)}`)
  if ((a.description ?? '') !== (b.description ?? '')) details.push(`Nombre: ${a.description || 'sin nombre'} → ${b.description || 'sin nombre'}`)
  if (payerOf(a) !== payerOf(b)) details.push(`Pagó: ${who(a)} → ${who(b)}`)
  if (a.category !== b.category) details.push(`Categoría: ${EXPENSE_CATEGORIES[a.category as ExpenseCategory]?.label ?? a.category} → ${EXPENSE_CATEGORIES[b.category as ExpenseCategory]?.label ?? b.category}`)
  if (a.spent_on !== b.spent_on) details.push(`Fecha: ${a.spent_on ?? 'sin fecha'} → ${b.spent_on ?? 'sin fecha'}`)
  if (!same(a.split, b.split) || a.split_mode !== b.split_mode) details.push('Cambió el reparto')
  if (Number(a.rate) !== Number(b.rate) && a.currency === b.currency) details.push('Cambió el tipo de cambio')
  return { title: `cambió ${what}`, details }
}

/** Los datos para volver a apuntar un gasto borrado, con su mismo id (así no se recupera dos veces). La foto del ticket ya no existe. */
export function restorable(e: Expense): NewExpense & { id: string } {
  return {
    id: e.id,
    category: e.category,
    amount: Number(e.amount),
    currency: e.currency,
    rate: Number(e.rate),
    stop_id: e.stop_id,
    paid_by: e.paid_by,
    payer_key: e.payer_key ?? null,
    description: e.description,
    spent_on: e.spent_on,
    split_mode: e.split_mode ?? 'equal',
    split: e.split ?? null,
    transfer_kind: e.transfer_kind ?? null,
  }
}
