import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatDay } from './DatePicker'
import { Icon } from './Icon'
import { formatRange } from './ui'
import { sharesLabel, type ExpenseRow } from '../lib/expenseExport'
import { formatMoney } from '../lib/money'
import type { Transfer } from './TripBalances'

/**
 * Informe de gastos del viaje: todos los gastos y pagos, el saldo de cada uno y quién paga a quién. Se ve en pantalla y
 * se guarda como PDF desde el diálogo de impresión del dispositivo (index.css esconde el resto de la app al imprimir).
 */
export function ExpenseReport({
  title,
  start,
  end,
  currency,
  total,
  rows,
  people,
  nameOf,
  paid,
  owed,
  net,
  transfers,
  onCsv,
  onClose,
}: {
  title: string
  start: string | null
  end: string | null
  currency: string
  total: number
  rows: ExpenseRow[]
  people: string[]
  nameOf: (k: string) => string
  paid: Map<string, number>
  owed: Map<string, number>
  net: Map<string, number>
  transfers: Transfer[]
  onCsv: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('print-report')
    return () => {
      removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      document.body.classList.remove('print-report')
    }
  }, [onClose])
  const money = (n: number) => formatMoney(n, currency)
  const spending = rows.filter((r) => !r.settlement)
  const payments = rows.filter((r) => r.settlement)
  const group = people.length > 1
  const th = 'px-2 py-1.5 text-left font-semibold'
  const td = 'px-2 py-1.5 align-top'

  return createPortal(
    <div id="expense-report" role="dialog" aria-modal="true" aria-label="Informe de gastos" className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-white text-neutral-900">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] print:hidden">
        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100" aria-label="Cerrar" onClick={onClose}>
          <Icon name="close" size={22} />
        </button>
        <span className="min-w-0 flex-1" />
        <button type="button" className="btn min-h-11 border border-neutral-300" onClick={onCsv}>
          <Icon name="table_view" size={18} /> CSV
        </button>
        <button type="button" className="btn btn-accent min-h-11" onClick={() => window.print()}>
          <Icon name="picture_as_pdf" size={18} /> Guardar PDF
        </button>
      </div>
      <div className="mx-auto max-w-3xl space-y-6 p-4 pb-16 text-sm md:p-8 print:max-w-none print:p-0">
        <header>
          <h1 className="font-display text-2xl font-bold">Gastos de «{title}»</h1>
          <p className="text-neutral-600">
            {start ? `${formatRange(start, end)} · ` : ''}
            {spending.length} {spending.length === 1 ? 'gasto' : 'gastos'} · {money(total)} en total
          </p>
        </header>
        {group && (
          <section>
            <h2 className="mb-1 font-display text-lg font-semibold">Para quedar en paz</h2>
            {transfers.length ? (
              <ul>
                {transfers.map((t) => (
                  <li key={t.from + t.to} className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
                    <span>
                      {nameOf(t.from)} → {nameOf(t.to)}
                    </span>
                    <b className="tabular-nums">{money(t.amount)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Estáis en paz: nadie debe nada a nadie.</p>
            )}
          </section>
        )}
        {group && (
          <section>
            <h2 className="mb-1 font-display text-lg font-semibold">Saldos</h2>
            <table className="w-full border-collapse text-xs sm:text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className={th}>Persona</th>
                  <th className={`${th} text-right!`}>Puso</th>
                  <th className={`${th} text-right!`}>Le toca</th>
                  <th className={`${th} text-right!`}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {people.map((k) => {
                  const b = net.get(k) ?? 0
                  return (
                    <tr key={k} className="border-b border-neutral-200">
                      <td className={td}>{nameOf(k)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(paid.get(k) ?? 0)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(owed.get(k) ?? 0)}</td>
                      <td className={`${td} text-right font-semibold tabular-nums`}>
                        {b > 0 ? '+' : ''}
                        {money(b)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}
        <section>
          <h2 className="mb-1 font-display text-lg font-semibold">Gastos</h2>
          <table className="w-full border-collapse text-xs sm:text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Gasto</th>
                {group && <th className={th}>Pagó</th>}
                <th className={`${th} text-right!`}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {spending.map((r) => (
                <tr key={r.id} className="break-inside-avoid border-b border-neutral-200">
                  <td className={`${td} whitespace-nowrap`}>{r.date ? formatDay(r.date, false) : '—'}</td>
                  <td className={`${td} [overflow-wrap:anywhere]`}>
                    {r.concept}
                    <span className="block text-neutral-600">{[r.currency !== currency ? formatMoney(r.amount, r.currency) : null, group ? sharesLabel(r, people, nameOf) : r.category].filter(Boolean).join(' · ')}</span>
                  </td>
                  {group && <td className={`${td} [overflow-wrap:anywhere]`}>{r.payer ?? 'No consta'}</td>}
                  <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {payments.length > 0 && (
          <section>
            <h2 className="mb-1 font-display text-lg font-semibold">Pagos ya hechos</h2>
            <ul>
              {payments.map((r) => (
                <li key={r.id} className="flex justify-between gap-4 border-b border-neutral-200 py-1.5">
                  <span>
                    {r.date ? `${formatDay(r.date, false)} · ` : ''}
                    {r.payer ?? '¿?'} → {r.shares.map((s) => s.name).join(', ')}
                    <span className="block text-xs text-neutral-600">{r.category}</span>
                  </span>
                  <b className="tabular-nums">{money(r.total)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>,
    document.body,
  )
}
