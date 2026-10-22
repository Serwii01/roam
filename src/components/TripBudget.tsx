import { useEffect, useMemo, useRef, useState } from 'react'
import { ask } from './ConfirmDialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from './Avatar'
import { DateField, daysBetween, formatDay } from './DatePicker'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { api } from '../lib/api'
import type { NewExpense } from '../lib/api/types'
import { useUser } from '../lib/auth'
import { localeCountry } from '../lib/geocode'
import { useProfile } from '../lib/hooks'
import type { Expense, ExpenseCategory, SplitMode, TripMember, TripWithStops } from '../lib/db'
import { CATEGORY_ORDER, CURRENCIES, EXPENSE_CATEGORIES, balancesOf, currencyForCountry, currencyName, exchangeRate, formatMoney, settleBalances, sharesOf } from '../lib/money'

const parseAmount = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
const today = () => new Date().toISOString().slice(0, 10)
const parseNum = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}
const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** Una persona del reparto: con cuenta ('u:<id>') o compañero añadido a mano ('g:<nombre>'). */
export interface Person {
  key: string
  name: string
  me: boolean
  guest: boolean
  avatar: { id: string; avatar_url: string | null; display_name?: string | null; username?: string }
}

/** Participantes con cuenta más los compañeros sin cuenta (sin repetir a quien ya está por nombre). */
export function tripPeople(members: TripMember[], companions: string[], me: string): Person[] {
  const out: Person[] = members.map((m) => ({
    key: `u:${m.user_id}`,
    name: m.user_id === me ? 'Tú' : m.display_name || m.username,
    me: m.user_id === me,
    guest: false,
    avatar: { id: m.user_id, avatar_url: m.avatar_url, display_name: m.display_name, username: m.username },
  }))
  const taken = new Set(members.flatMap((m) => [m.display_name, m.username].filter(Boolean).map((n) => n!.trim().toLowerCase())))
  for (const raw of companions) {
    const name = raw.trim().slice(0, 80)
    if (!name || taken.has(name.toLowerCase())) continue
    taken.add(name.toLowerCase())
    out.push({ key: `g:${name}`, name, me: false, guest: true, avatar: { id: `g:${name}`, avatar_url: null, display_name: name } })
  }
  return out
}
const payerOf = (e: Expense) => e.payer_key ?? (e.paid_by ? `u:${e.paid_by}` : null)

const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'equal', label: 'Igual', hint: 'A partes iguales entre los marcados' },
  { id: 'percent', label: '%', hint: 'Cada uno un porcentaje (tiene que sumar 100 %)' },
  { id: 'amount', label: 'Importe', hint: 'Cuánto le toca exactamente a cada uno' },
  { id: 'shares', label: 'Partes', hint: 'Por partes: quien tiene 2 paga el doble que quien tiene 1' },
]

/** Presupuesto y gastos del viaje. Solo para participantes (la base de datos tampoco los enseña a nadie más). */
export function TripBudget({ trip, start }: { trip: TripWithStops; /** Abrir directamente el formulario. */ start?: 'budget' | 'expense' }) {
  const user = useUser()
  const qc = useQueryClient()
  const budget = useQuery({ queryKey: ['budget', trip.id], queryFn: () => api.getBudget(trip.id) })
  const expenses = useQuery({ queryKey: ['expenses', trip.id], queryFn: () => api.listExpenses(trip.id) })
  const members = useQuery({ queryKey: ['members', trip.id], queryFn: () => api.listTripMembers(trip.id) })
  const [form, setForm] = useState<Expense | 'new' | null>(start === 'expense' ? 'new' : null)
  const [editBudget, setEditBudget] = useState(start === 'budget')
  const editingId = form && form !== 'new' ? form.id : null

  const profile = useProfile()
  // Moneda del viaje: la guardada o, si aún no hay, la de tu país (perfil o navegador).
  const homeCurrency = currencyForCountry(profile.data?.home_country) ?? currencyForCountry(localeCountry()) ?? 'EUR'
  const currency = budget.data?.currency ?? homeCurrency
  const list = useMemo(() => expenses.data ?? [], [expenses.data])
  const people = useMemo(() => tripPeople(members.data ?? [], trip.companions ?? [], user.id), [members.data, trip.companions, user.id])
  const keys = people.map((p) => p.key)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['expenses', trip.id] }), qc.invalidateQueries({ queryKey: ['budget', trip.id] })])

  const total = list.reduce((a, e) => a + e.amount * e.rate, 0)
  const byCat = CATEGORY_ORDER.map((c) => ({ c, v: list.filter((e) => e.category === c).reduce((a, e) => a + e.amount * e.rate, 0) })).filter((x) => x.v > 0)
  const days = trip.start_date && trip.end_date ? daysBetween(trip.start_date, trip.end_date) : null
  const limit = budget.data?.amount ?? null
  const pct = limit ? total / limit : null
  const planned = trip.status === 'planned'

  // Cuentas claras: lo que pagó cada uno frente a lo que le toca según el reparto de cada gasto.
  const { paid, owed } = balancesOf(list, keys)
  const transfers = settleBalances(paid, owed)
  const who = (k: string | null) => people.find((p) => p.key === k)

  const groups = useMemo(() => {
    const g = new Map<string, Expense[]>()
    for (const e of list) g.set(e.spent_on ?? '', [...(g.get(e.spent_on ?? '') ?? []), e])
    return [...g]
  }, [list])

  if (budget.isLoading || expenses.isLoading) return <div className="card h-40 animate-pulse p-4" />

  return (
    <div className="card p-4" id="gastos">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="headline-sm uppercase">{planned ? 'Presupuesto' : 'Presupuesto y gastos'}</h3>
        <span className="label-code flex items-center gap-1 text-ink-soft" title="Solo lo ven los participantes del viaje">
          <Icon name="lock" size={14} /> Privado
        </span>
      </div>
      <ErrorNote error={budget.error ?? expenses.error} />

      {editBudget ? (
        <BudgetForm trip={trip} current={budget.data ?? null} fallbackCurrency={homeCurrency} expenses={list} onDone={() => (setEditBudget(false), refresh())} onCancel={() => setEditBudget(false)} />
      ) : !list.length && !limit ? (
        <div className="rounded-sm bg-surface-low p-4 text-sm">
          <p className="text-ink-soft">{planned ? 'Fija cuánto quieres gastar y apunta lo que ya hayas reservado.' : 'Apunta lo que gastasteis: transporte, alojamiento, comida…'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditBudget(true)}>
              <Icon name="savings" size={18} /> Fijar presupuesto
            </button>
            <button type="button" className="btn btn-dark" onClick={() => setForm('new')}>
              <Icon name="add" size={18} /> Apuntar gasto
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="label-stamp text-ink-soft">{planned ? 'Previsto / reservado' : 'Gastado'}</div>
              <div className="font-display text-4xl font-bold tracking-tight">{formatMoney(total, currency)}</div>
            </div>
            <button type="button" className="text-right text-sm text-ink-soft hover:text-ink" onClick={() => setEditBudget(true)}>
              {limit ? (
                <>
                  de <b className="text-ink">{formatMoney(limit, currency)}</b>
                </>
              ) : (
                'Fijar presupuesto'
              )}
              <Icon name="edit" size={14} className="ml-1" />
            </button>
          </div>
          {pct !== null && (
            <>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-container" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full rounded-full transition-all ${pct > 1 ? 'bg-red-600' : pct > 0.85 ? 'bg-accent' : 'bg-ink'}`}
                  style={{ width: `${Math.min(100, pct * 100)}%` }}
                />
              </div>
              <div className={`mt-1 text-sm ${pct > 1 ? 'font-semibold text-red-700' : 'text-ink-soft'}`}>
                {pct > 1 ? `Te has pasado ${formatMoney(total - limit!, currency)}` : `Quedan ${formatMoney(limit! - total, currency)} · ${Math.round(pct * 100)}%`}
              </div>
            </>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {days && total > 0 && (
              <div className="rounded-sm bg-surface-low px-3 py-2">
                <div className="label-stamp text-ink-soft">Por día</div>
                <div className="font-display font-semibold">{formatMoney(total / days, currency)}</div>
              </div>
            )}
            {people.length > 1 && total > 0 && (
              <div className="rounded-sm bg-surface-low px-3 py-2">
                <div className="label-stamp text-ink-soft">Por persona</div>
                <div className="font-display font-semibold">{formatMoney(total / people.length, currency)}</div>
              </div>
            )}
          </div>

          {byCat.length > 0 && (
            <div className="mt-4">
              <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
                {byCat.map(({ c, v }) => (
                  <span key={c} style={{ width: `${(v / total) * 100}%`, background: EXPENSE_CATEGORIES[c].color }} title={EXPENSE_CATEGORIES[c].label} />
                ))}
              </div>
              <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {byCat
                  .sort((a, b) => b.v - a.v)
                  .map(({ c, v }) => (
                    <li key={c} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: EXPENSE_CATEGORIES[c].color }} />
                      <span className="min-w-0 flex-1 truncate">{EXPENSE_CATEGORIES[c].label}</span>
                      <span className="font-semibold">{formatMoney(v, currency, { compact: true })}</span>
                      <span className="w-9 text-right text-xs text-ink-soft">{Math.round((v / total) * 100)}%</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {form === null && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setEditBudget(true)}>
                <Icon name="savings" size={18} /> {limit ? 'Editar presupuesto' : 'Fijar presupuesto'}
              </button>
              <button type="button" className="btn btn-dark" onClick={() => setForm('new')}>
                <Icon name="add" size={18} /> Apuntar gasto
              </button>
            </div>
          )}
        </div>
      )}

      {form === 'new' && (
        <ExpenseForm
          trip={trip}
          currency={currency}
          hasBudget={!!budget.data}
          people={people}
          me={user.id}
          editing={null}
          onDone={() => (setForm(null), refresh())}
          onCancel={() => setForm(null)}
        />
      )}

      {groups.length > 0 && (
        <div className="mt-5 space-y-4">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="label-stamp mb-1.5 flex justify-between text-ink-soft">
                <span>{day ? formatDay(day) : 'Sin fecha'}</span>
                <span>{formatMoney(items.reduce((a, e) => a + e.amount * e.rate, 0), currency)}</span>
              </div>
              <ul className="space-y-1">
                {items.map((e) => {
                  const cat = EXPENSE_CATEGORIES[e.category]
                  const stop = trip.stops.find((s) => s.id === e.stop_id)
                  const payer = who(payerOf(e))
                  const n = e.split?.filter((x) => x.v > 0).length
                  const splitNote =
                    people.length > 1 && payer
                      ? e.split_mode && e.split_mode !== 'equal'
                        ? `reparto por ${e.split_mode === 'percent' ? '%' : e.split_mode === 'amount' ? 'importes' : 'partes'}`
                        : n && n < people.length
                          ? `para ${n}`
                          : null
                      : null
                  // Al editar, el formulario se abre en el sitio del gasto.
                  if (editingId === e.id)
                    return (
                      <li key={e.id}>
                        <ExpenseForm
                          trip={trip}
                          currency={currency}
                          hasBudget={!!budget.data}
                          people={people}
                          me={user.id}
                          editing={e}
                          onDone={() => (setForm(null), refresh())}
                          onCancel={() => setForm(null)}
                        />
                      </li>
                    )
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setForm(e)}
                        aria-label={`Editar ${e.description || cat.label}`}
                        className="group flex w-full items-center gap-3 rounded-sm bg-surface-low px-3 py-2 text-left text-sm transition hover:bg-surface-container"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: cat.color }}>
                          <Icon name={cat.icon} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{e.description || cat.label}</span>
                          <span className="block truncate text-xs text-ink-soft">
                            {[stop?.name, people.length > 1 && payer ? `pagó ${payer.me ? 'tú' : payer.name}` : null, splitNote].filter(Boolean).join(' · ') || cat.label}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-display font-semibold">{formatMoney(e.amount * e.rate, currency)}</span>
                          {e.currency !== currency && <span className="block text-xs text-ink-soft">{formatMoney(e.amount, e.currency)}</span>}
                        </span>
                        <Icon name="edit" size={16} className="shrink-0 text-ink-soft opacity-50 transition group-hover:opacity-100" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {people.length > 1 && list.some((e) => payerOf(e)) && (
        <div className="mt-5 rounded-sm border border-surface-highest p-3" id="cuentas">
          <div className="mb-2 flex items-center gap-2 font-display font-semibold">
            <Icon name="handshake" size={18} className="text-accent" /> Cuentas claras
          </div>
          <ul className="space-y-1.5 text-sm">
            {people.map((p) => {
              const raw = (paid.get(p.key) ?? 0) - (owed.get(p.key) ?? 0)
              const bal = Math.abs(raw) < 0.005 ? 0 : raw
              return (
                <li key={p.key} className="flex items-center gap-2">
                  <Avatar profile={p.avatar} className="h-6 w-6" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {p.name}
                      {p.guest && <span className="ml-1 text-xs text-ink-soft">(sin cuenta)</span>}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      pagó {formatMoney(paid.get(p.key) ?? 0, currency)} · le toca {formatMoney(owed.get(p.key) ?? 0, currency)}
                    </span>
                  </span>
                  <span className={`font-display font-semibold ${bal > 0 ? 'text-emerald-700' : bal < 0 ? 'text-red-700' : 'text-ink-soft'}`}>
                    {bal > 0 ? '+' : ''}
                    {formatMoney(bal, currency)}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 space-y-1 border-t border-surface-highest pt-2 text-sm">
            <div className="label-stamp text-ink-soft">Para quedar en paz</div>
            {transfers.length ? (
              transfers.map((t) => (
                <div key={`${t.from}${t.to}`} className="flex items-center gap-1.5">
                  <b>{who(t.from)?.name}</b>
                  <Icon name="arrow_forward" size={14} className="text-ink-soft" />
                  <b>{who(t.to)?.me ? 'ti' : who(t.to)?.name}</b>
                  <span className="ml-auto font-display font-semibold text-accent-deep">{formatMoney(t.amount, currency)}</span>
                </div>
              ))
            ) : (
              <span className="text-ink-soft">Estáis en paz.</span>
            )}
            <p className="pt-1 text-xs text-ink-soft">Cada gasto se reparte como se apuntó. Los gastos sin «pagó» no cuentan aquí.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function CurrencySelect({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const options = CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES]
  return (
    <select aria-label={label} className="field w-28 shrink-0 px-2! py-2.5!" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((c) => (
        <option key={c} value={c}>
          {c} · {currencyName(c)}
        </option>
      ))}
    </select>
  )
}

function BudgetForm({
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

function ExpenseForm({
  trip,
  currency: tripCurrency,
  hasBudget,
  people,
  me,
  editing,
  onDone,
  onCancel,
}: {
  trip: TripWithStops
  currency: string
  hasBudget: boolean
  people: Person[]
  me: string
  editing: Expense | null
  onDone: () => void
  onCancel: () => void
}) {
  const inTrip = !trip.start_date || (today() >= trip.start_date && today() <= (trip.end_date ?? trip.start_date))
  // Parada por defecto: la del día de hoy si se está de viaje.
  const todayStop = [...trip.stops].reverse().find((s) => s.arrived_on && s.arrived_on <= today())
  const [category, setCategory] = useState<ExpenseCategory>(editing?.category ?? 'food')
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace('.', ',') : '')
  const [stopId, setStopId] = useState<string | null>(editing ? editing.stop_id : inTrip ? (todayStop?.id ?? null) : null)
  const [currency, setCurrency] = useState(editing?.currency ?? currencyForCountry(trip.stops.find((s) => s.id === stopId)?.country_code) ?? tripCurrency)
  const [touchedCurrency, setTouchedCurrency] = useState(!!editing)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [date, setDate] = useState<string | null>(editing ? editing.spent_on : inTrip ? today() : (trip.start_date ?? null))
  const [payer, setPayer] = useState<string | null>(editing ? payerOf(editing) : `u:${me}`)
  const initial = editing?.split?.length ? editing.split : null
  const [mode, setMode] = useState<SplitMode>(initial ? (editing?.split_mode ?? 'equal') : 'equal')
  // Un gasto nuevo es de todos; uno antiguo sin reparto, de quienes tienen cuenta (como se calculaba).
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(initial ? initial.filter((x) => x.v > 0).map((x) => x.k) : people.filter((p) => !editing || !p.guest).map((p) => p.key)),
  )
  // Los importes propuestos se recalculan con el total mientras nadie los toque a mano.
  const [autoFill, setAutoFill] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() =>
    initial && editing?.split_mode !== 'equal' ? Object.fromEntries(initial.map((x) => [x.k, fmtNum(x.v)])) : {},
  )
  const [rate, setRate] = useState<number | null>(editing && editing.currency === currency ? editing.rate : null)
  const [rateError, setRateError] = useState(false)
  const [manualRate, setManualRate] = useState('')

  // Tipo de cambio del día del gasto.
  useEffect(() => {
    if (currency === tripCurrency) {
      setRate(1)
      return
    }
    let alive = true
    setRate(null)
    setRateError(false)
    exchangeRate(currency, tripCurrency, date)
      .then((r) => alive && setRate(r))
      .catch(() => alive && setRateError(true))
    return () => {
      alive = false
    }
  }, [currency, tripCurrency, date])

  const value = parseAmount(amount)
  const effectiveRate = rate ?? (manualRate ? parseAmount(manualRate) : null)

  // Reparto: personas marcadas y el valor de cada una según el modo.
  const chosen = people.filter((p) => included.has(p.key))
  const num = (k: string) => parseNum(values[k] ?? '') ?? 0
  const sum = chosen.reduce((a, p) => a + num(p.key), 0)
  const splitError =
    people.length < 2
      ? null
      : !chosen.length
        ? 'Marca al menos a una persona'
        : mode === 'percent' && Math.abs(sum - 100) > 0.01
          ? `Los porcentajes suman ${fmtNum(sum)} % (${sum < 100 ? 'faltan' : 'sobran'} ${fmtNum(Math.abs(100 - sum))} %)`
          : mode === 'amount' && value && Math.abs(sum - value) > 0.009
            ? `Los importes suman ${formatMoney(sum, currency)} de ${formatMoney(value, currency)}`
            : mode === 'shares' && sum <= 0
              ? 'Pon al menos una parte'
              : null
  // Se guarda siempre quién entra, para que añadir a alguien más tarde no cambie los gastos ya repartidos.
  const split =
    people.length < 2
      ? null
      : chosen.map((p) => ({ k: p.key, v: mode === 'equal' ? 1 : Math.round(num(p.key) * 100) / 100 })).filter((x) => x.v > 0)
  const preview = value && !splitError ? sharesOf({ amount: value, rate: 1, split_mode: split ? mode : 'equal', split }, people.map((p) => p.key)) : null

  /** Reparte `total` en `n` trozos de céntimo, con el resto en el último. */
  const even = (total: number, n: number) => {
    const part = Math.floor((total * 100) / n) / 100
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((total - part * (n - 1)) * 100) / 100 : part))
  }
  /** Al cambiar de modo se rellenan valores a partes iguales para los marcados. */
  const switchMode = (m: SplitMode) => {
    setMode(m)
    const parts = m === 'percent' ? even(100, chosen.length || 1) : m === 'amount' && value ? even(value, chosen.length || 1) : null
    setAutoFill(true)
    if (parts) setValues(Object.fromEntries(chosen.map((p, i) => [p.key, fmtNum(parts[i])])))
    else if (m === 'shares') setValues(Object.fromEntries(chosen.map((p) => [p.key, '1'])))
  }
  const toggle = (k: string) => {
    const next = new Set(included)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setIncluded(next)
    // Se vuelve a repartir a partes iguales entre los marcados (lo más habitual al quitar o poner a alguien).
    const list = people.filter((p) => next.has(p.key))
    if (mode === 'percent' && list.length) setValues(Object.fromEntries(list.map((p, i) => [p.key, fmtNum(even(100, list.length)[i])])))
    else if (mode === 'amount' && value && list.length) setValues(Object.fromEntries(list.map((p, i) => [p.key, fmtNum(even(value, list.length)[i])])))
    else if (mode === 'shares' && !values[k]) setValues({ ...values, [k]: '1' })
  }
  const save = useMutation({
    mutationFn: async () => {
      // La moneda del viaje se fija con el primer gasto: los cambios guardados se refieren a ella.
      if (!hasBudget) await api.setBudget(trip.id, { currency: tripCurrency, amount: null })
      const body: NewExpense = {
        category,
        amount: value!,
        currency,
        rate: effectiveRate ?? 1,
        stop_id: stopId,
        paid_by: payer?.startsWith('u:') ? payer.slice(2) : null,
        payer_key: payer,
        split_mode: split ? mode : 'equal',
        split,
        description: description.trim() || null,
        spent_on: date,
      }
      return editing ? api.updateExpense(editing.id, body) : api.addExpense(trip.id, body)
    },
    onSuccess: onDone,
  })
  const remove = useMutation({ mutationFn: () => api.deleteExpense(editing!.id), onSuccess: onDone })

  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  return (
    <form
      ref={formRef}
      className={`${editing ? 'my-2 ring-2 ring-accent' : 'mt-4'} rounded-sm bg-surface-low p-3`}
      onSubmit={(e) => {
        e.preventDefault()
        if (value && effectiveRate && !splitError) save.mutate()
      }}
    >
      <div className="mb-2 font-display font-semibold">{editing ? 'Editar gasto' : 'Nuevo gasto'}</div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Categoría">
        {CATEGORY_ORDER.map((c) => {
          const cat = EXPENSE_CATEGORIES[c]
          const on = c === category
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCategory(c)}
              className={`flex flex-col items-center gap-1 rounded-sm px-1 py-2 text-[11px] leading-tight transition ${on ? 'text-white' : 'bg-card hover:bg-surface-container'}`}
              style={on ? { background: cat.color } : undefined}
            >
              <Icon name={cat.icon} size={20} />
              {cat.label}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          aria-label="Importe"
          className="field min-w-0 flex-1 py-2.5! font-display text-lg"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            // En «Importe», si aún no se ha repartido nada, se propone a partes iguales.
            const v = parseAmount(e.target.value)
            if (mode === 'amount' && v && chosen.length && (autoFill || chosen.every((p) => !num(p.key)))) {
              setAutoFill(true)
              setValues(Object.fromEntries(chosen.map((p, i) => [p.key, fmtNum(even(v, chosen.length)[i])])))
            }
          }}
          autoFocus
        />
        <CurrencySelect
          value={currency}
          onChange={(c) => {
            setCurrency(c)
            setTouchedCurrency(true)
          }}
          label="Moneda del gasto"
        />
      </div>
      {currency !== tripCurrency && (
        <div className="mt-1 text-sm text-ink-soft">
          {rateError ? (
            <span className="flex flex-wrap items-center gap-2">
              Sin conexión con el cambio. 1 {currency} =
              <input aria-label="Tipo de cambio" className="w-24 rounded-xs bg-card px-2 py-1 ring-1 ring-outline-soft" inputMode="decimal" value={manualRate} onChange={(e) => setManualRate(e.target.value)} placeholder="0,0062" />
              {tripCurrency}
            </span>
          ) : rate === null ? (
            'Consultando el cambio…'
          ) : value ? (
            <>
              ≈ <b className="text-ink">{formatMoney(value * rate, tripCurrency)}</b> · 1 {currency} = {rate.toLocaleString('es-ES', { maximumSignificantDigits: 4 })} {tripCurrency}
            </>
          ) : (
            <>
              1 {currency} = {rate.toLocaleString('es-ES', { maximumSignificantDigits: 4 })} {tripCurrency}
            </>
          )}
        </div>
      )}

      <input
        aria-label="Descripción"
        className="field mt-3 py-2.5!"
        maxLength={160}
        placeholder={category === 'lodging' ? 'Hotel, 3 noches' : category === 'transport' ? 'Tren a Kioto' : category === 'food' ? 'Cena en…' : 'Descripción (opcional)'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <DateField value={date} min={trip.start_date} max={trip.end_date} onChange={setDate} placeholder="Fecha" label="Fecha del gasto" />
        {trip.stops.length > 0 && (
          <select
            aria-label="Parada"
            className="h-8 rounded-full bg-card px-3 text-xs font-semibold ring-1 ring-outline-soft"
            value={stopId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null
              setStopId(id)
              // La moneda sigue a la parada mientras no se haya elegido a mano.
              const cur = currencyForCountry(trip.stops.find((s) => s.id === id)?.country_code)
              if (!touchedCurrency && cur) setCurrency(cur)
            }}
          >
            <option value="">Sin parada</option>
            {trip.stops.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {people.length > 1 && (
        <div className="mt-4 rounded-sm bg-card p-3 ring-1 ring-outline-soft">
          <label className="flex items-center gap-2 text-sm">
            <span className="label-stamp w-20 shrink-0 text-ink-soft">Pagó</span>
            <select aria-label="Pagó" className="field min-w-0 flex-1 py-2!" value={payer ?? ''} onChange={(e) => setPayer(e.target.value || null)}>
              {people.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.me ? 'Yo' : p.name}
                  {p.guest ? ' (sin cuenta)' : ''}
                </option>
              ))}
              <option value="">No lo sé / no cuenta</option>
            </select>
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="label-stamp text-ink-soft">Para quién</span>
            <div className="flex rounded-full bg-surface-low p-0.5" role="radiogroup" aria-label="Cómo se reparte">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  title={m.hint}
                  onClick={() => switchMode(m.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${mode === m.id ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-soft">{MODES.find((m) => m.id === mode)!.hint}</p>
          <ul className="mt-2 space-y-0.5">
            {people.map((p) => {
              const on = included.has(p.key)
              const share = on ? preview?.get(p.key) : undefined
              return (
                <li key={p.key} className={`flex min-h-9 items-center gap-2 rounded-sm px-1 ${on ? '' : 'opacity-55'}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Incluir a ${p.me ? 'mí' : p.name}`}
                    onClick={() => toggle(p.key)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm"
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-xs ring-1 ${on ? 'bg-accent text-white ring-accent' : 'bg-card ring-outline-soft'}`}>
                      {on && <Icon name="check" size={14} />}
                    </span>
                    <Avatar profile={p.avatar} className="h-6 w-6 shrink-0" />
                    <span className="min-w-0 truncate">
                      {p.me ? 'Yo' : p.name}
                      {p.guest && <span className="ml-1 text-xs text-ink-soft">(sin cuenta)</span>}
                    </span>
                  </button>
                  {mode !== 'equal' && on && (
                    <span className="flex shrink-0 items-center gap-1">
                      <input
                        aria-label={`${mode === 'percent' ? 'Porcentaje' : mode === 'amount' ? 'Importe' : 'Partes'} de ${p.me ? 'mí' : p.name}`}
                        className="w-16 rounded-xs bg-surface-low px-2 py-1 text-right text-sm ring-1 ring-outline-soft outline-none focus:ring-accent"
                        inputMode="decimal"
                        value={values[p.key] ?? ''}
                        placeholder="0"
                        onChange={(e) => {
                          setAutoFill(false)
                          setValues({ ...values, [p.key]: e.target.value })
                        }}
                      />
                      <span className="w-7 text-xs text-ink-soft">{mode === 'percent' ? '%' : mode === 'amount' ? currency : '×'}</span>
                    </span>
                  )}
                  {/* En «Importe» el valor ya es el importe: no se repite. */}
                  {mode !== 'amount' && <span className="w-16 shrink-0 text-right text-xs font-semibold">{share !== undefined ? formatMoney(share, currency) : ''}</span>}
                </li>
              )
            })}
          </ul>
          {splitError && value ? <p className="mt-2 text-xs font-semibold text-red-700">{splitError}</p> : null}
        </div>
      )}

      <ErrorNote error={save.error ?? remove.error} />
      <div className="mt-4 flex items-center justify-between gap-2">
        {editing ? (
          <button type="button" className="btn text-red-700 hover:bg-red-50" disabled={remove.isPending} onClick={async () => (await ask({ title: '¿Borrar este gasto?', body: description.trim() || EXPENSE_CATEGORIES[category].label, confirm: 'Borrar', danger: true })) && remove.mutate()}>
            <Icon name="delete" size={18} />
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-accent" disabled={!value || !effectiveRate || !!splitError || save.isPending}>
            {save.isPending ? 'Guardando…' : editing ? 'Guardar' : 'Añadir'}
          </button>
        </span>
      </div>
    </form>
  )
}
