import { useMutation, useQuery } from '@tanstack/react-query'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { api } from '../lib/api'
import type { Expense } from '../lib/db'
import { describeChange, restorable } from '../lib/expenseHistory'
import { timeAgo } from '../lib/timeAgo'

/** Quién apuntó, cambió o borró cada gasto; lo borrado se puede recuperar. Con `expenseId`, solo los cambios de ese gasto. */
export function ExpenseHistory({ tripId, expenseId, list, nameOf, locked, onRestored }: { tripId: string; expenseId?: string; list: Expense[]; nameOf: (key: string) => string; locked: boolean; onRestored: () => void }) {
  const history = useQuery({ queryKey: ['expense-history', tripId], queryFn: () => api.listExpenseHistory(tripId) })
  const restore = useMutation({ mutationFn: (e: Expense) => api.addExpense(tripId, restorable(e)), onSuccess: onRestored })
  const changes = (history.data ?? []).filter((c) => !expenseId || c.expense_id === expenseId)
  // Solo el último borrado de cada gasto que siga borrado.
  const seen = new Set<string>()
  if (history.isLoading) return <p className="text-sm text-ink-soft">Cargando el historial…</p>
  return (
    <div>
      <ErrorNote error={history.error ?? restore.error} />
      {!changes.length && !history.error && <p className="text-sm text-ink-soft">Aún no hay cambios guardados.</p>}
      <ul className="divide-y divide-surface-highest">
        {changes.map((c) => {
          const { title, details } = describeChange(c, nameOf)
          const gone = c.action === 'delete' && c.before && !seen.has(c.expense_id) && !list.some((e) => e.id === c.expense_id)
          seen.add(c.expense_id)
          return (
            <li key={c.id} className="flex items-start gap-3 py-2 text-sm">
              <Icon name={c.action === 'insert' ? 'add' : c.action === 'delete' ? 'delete' : 'edit'} size={18} className={`mt-0.5 shrink-0 ${c.action === 'delete' ? 'text-red-700' : 'text-ink-soft'}`} />
              <span className="min-w-0 flex-1">
                <span className="block break-words">
                  <b>{c.actor_id ? nameOf(`u:${c.actor_id}`) : 'Alguien'}</b> {title}
                </span>
                {details.map((d) => (
                  <span key={d} className="block break-words text-xs text-ink-soft">
                    {d}
                  </span>
                ))}
                <time dateTime={c.created_at} className="block text-xs text-ink-soft">
                  {timeAgo(c.created_at)}
                </time>
              </span>
              {gone && !locked && (
                <button type="button" className="btn btn-ghost shrink-0 px-3! py-1.5! text-sm" disabled={restore.isPending} onClick={() => restore.mutate(c.before!)}>
                  <Icon name="undo" size={16} /> Recuperar
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
