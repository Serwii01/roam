// Exportar los gastos de un viaje: filas ya calculadas (las usa también el informe imprimible) y CSV para Excel,
// Numbers o Google Sheets.
import type { Expense, ExpenseCategory } from './db'
import { EXPENSE_CATEGORIES, isSettlement, sharesOf } from './money'

export interface ExpenseRow {
  id: string
  date: string | null
  settlement: boolean
  /** Pago que quien lo recibe ha rechazado: no cuenta en los saldos. */
  rejected: boolean
  concept: string
  category: string
  /** Importe original y, en la moneda del viaje, el total. */
  amount: number
  currency: string
  total: number
  payer: string | null
  /** Lo que le toca a cada persona (en un pago, quien lo recibe), en la moneda del viaje. */
  shares: { key: string; name: string; amount: number }[]
}

/** Los gastos y pagos por fecha, con los nombres puestos. `nameOf` da el nombre de una persona por su clave. */
export function expenseRows(list: Expense[], people: string[], nameOf: (key: string) => string): ExpenseRow[] {
  return [...list]
    .sort((a, b) => (a.spent_on ?? '9999').localeCompare(b.spent_on ?? '9999') || a.created_at.localeCompare(b.created_at))
    .map((e) => {
      const settlement = isSettlement(e)
      const payer = e.payer_key ?? (e.paid_by ? `u:${e.paid_by}` : null)
      const rejected = e.payment_status === 'rejected'
      const category = settlement ? `${e.transfer_kind === 'cash' ? 'Cambio de efectivo' : 'Pago entre personas'}${rejected ? ' (rechazado, no cuenta)' : e.payment_status === 'pending' ? ' (sin confirmar)' : ''}` : (EXPENSE_CATEGORIES[e.category as ExpenseCategory]?.label ?? e.category)
      return {
        id: e.id,
        date: e.spent_on,
        settlement,
        rejected,
        concept: e.description || category,
        category,
        amount: e.amount,
        currency: e.currency,
        total: e.amount * e.rate,
        payer: payer ? nameOf(payer) : null,
        shares: [...sharesOf(e, people)].map(([key, amount]) => ({ key, name: nameOf(key), amount })),
      }
    })
}

/** «Todos», «Todos menos Ana», «Solo Bea» o la lista; con importes si no es a partes iguales. */
export function sharesLabel(row: ExpenseRow, people: string[], nameOf: (key: string) => string): string {
  if (row.shares.some((s) => Math.abs(s.amount - row.shares[0].amount) > 0.011)) return row.shares.map((s) => `${s.name} ${num(s.amount)}`).join(', ')
  if (row.shares.length === 1) return row.settlement ? row.shares[0].name : `Solo ${row.shares[0].name}`
  const out = people.filter((p) => !row.shares.some((s) => s.key === p))
  if (!out.length) return 'Todos'
  if (out.length === 1 && people.length > 3) return `Todos menos ${nameOf(out[0])}`
  return row.shares.map((s) => s.name).join(', ')
}

const num = (n: number) => n.toFixed(2).replace('.', ',')
/** Celda de CSV. Un texto que empieza por = + - @ se marca como texto: Excel lo ejecutaría como fórmula. */
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV con punto y coma, coma decimal y BOM: así lo abre bien Excel en español. Una columna por persona. */
export function expensesCsv(list: Expense[], people: string[], nameOf: (key: string) => string, currency: string): string {
  const rows = expenseRows(list, people, nameOf)
  // También quien ya no está en el viaje pero entra en algún reparto.
  const keys = [...new Set([...people, ...rows.flatMap((r) => r.shares.map((s) => s.key))])]
  const head = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Importe', 'Moneda', `Total (${currency})`, 'Pagó', ...keys.map((k) => `Parte de ${nameOf(k)} (${currency})`)]
  const lines = rows.map((r) => [
    r.date ?? '',
    r.settlement ? 'Pago' : 'Gasto',
    cell(r.concept),
    cell(r.category),
    num(r.amount),
    r.currency,
    num(r.total),
    cell(r.payer ?? ''),
    ...keys.map((k) => {
      const s = r.shares.find((x) => x.key === k)
      return s ? num(s.amount) : ''
    }),
  ])
  return '﻿' + [head.map(cell), ...lines].map((l) => l.join(';')).join('\r\n') + '\r\n'
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'viaje'

/** En el móvil abre la hoja de compartir (WhatsApp, Archivos…); si no se puede, descarga el archivo. */
export async function saveCsv(title: string, csv: string) {
  const file = new File([csv], `gastos-${slug(title)}.csv`, { type: 'text/csv' })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Gastos de ${title}` })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  Object.assign(document.createElement('a'), { href: url, download: file.name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
