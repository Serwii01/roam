import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CurrencySelect } from './CurrencySelect'
import { ErrorNote } from './ui'
import { parseAmount } from '../lib/amount'
import { api } from '../lib/api'
import type { Expense, TripWithStops } from '../lib/db'
import { exchangeRate } from '../lib/money'

export function BudgetForm({
  trip,
  current,
  fallbackCurrency,
  expenses,
  onDone,
  onCancel,
}: {
  trip: TripWithStops
  current: { currency: string; amount: number | null } | null
  fallbackCurrency: string
  expenses: Expense[]
  onDone: () => void
  onCancel: () => void
}) {
  const [currency, setCurrency] = useState(current?.currency ?? fallbackCurrency)
  const [amount, setAmount] = useState(current?.amount ? String(current.amount).replace('.', ',') : '')
  const save = useMutation({
    mutationFn: async () => {
      // Si cambia la moneda del viaje, se recalcula el cambio de cada gasto a la nueva.
      if ((current?.currency ?? fallbackCurrency) !== currency) {
        for (const e of expenses) {
          const rate = await exchangeRate(e.currency, currency, e.spent_on)
          await api.updateExpense(e.id, { rate })
        }
      }
      return api.setBudget(trip.id, { currency, amount: amount.trim() ? parseAmount(amount) : null })
    },
    onSuccess: onDone,
  })
  return (
    <form
      className="rounded-sm bg-surface-low p-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <label className="label-stamp mb-1 block text-ink-soft" htmlFor="budget-amount">
        Presupuesto total (opcional)
      </label>
      <div className="flex gap-2">
        <input id="budget-amount" className="field min-w-0 flex-1 py-2.5!" inputMode="decimal" placeholder="2.000" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <CurrencySelect value={currency} onChange={setCurrency} label="Moneda del viaje" />
      </div>
      <p className="mt-1 text-xs text-ink-soft">Los gastos en otras monedas se suman en {currency}.</p>
      <ErrorNote error={save.error} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-dark" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
