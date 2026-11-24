import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from './Avatar'
import { BudgetForm } from './BudgetForm'
import { ask } from './ConfirmDialog'
import { daysBetween, formatDay } from './DatePicker'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseHistory } from './ExpenseHistory'
import { ExpenseReport } from './ExpenseReport'
import { Icon } from './Icon'
import { ReceiptButton } from './ReceiptButton'
import { TripBalances, type Payment, type Transfer } from './TripBalances'
import { ErrorNote } from './ui'
import { today } from '../lib/amount'
import { api } from '../lib/api'
import { useUser } from '../lib/auth'
import type { Expense, ExpenseCategory, TripWithStops } from '../lib/db'
import { fold } from '../lib/exonyms'
import { expenseRows, expensesCsv, saveCsv } from '../lib/expenseExport'
import { localeCountry } from '../lib/geocode'
import { useProfile } from '../lib/hooks'
import { useTripLive } from '../lib/live'
import { CATEGORY_ORDER, EXPENSE_CATEGORIES, balancesOf, currencyForCountry, formatMoney, isSettlement, netBalances, settleBalances, sharesOf, totalSpent } from '../lib/money'
import { payerOf, tripPeople } from '../lib/tripPeople'

/** Por dónde se abre: un formulario o los saldos. */
export type BudgetStart = 'budget' | 'expense' | 'balances'
type BudgetTab = 'gastos' | 'saldos' | 'resumen'

/**
 * Presupuesto y gastos del viaje, al estilo Tricount. Solo para participantes (la base de datos tampoco los
 * enseña a nadie más). Arriba, tu saldo; debajo, tres pestañas: la lista de gastos, quién debe a quién (con
 * «Marcar como pagado») y el resumen del presupuesto y las categorías.
 */
export function TripBudget({ trip, start }: { trip: TripWithStops; /** Abrir directamente el formulario. */ start?: BudgetStart }) {
  const user = useUser()
  const qc = useQueryClient()
  useTripLive(trip.id)
  const budget = useQuery({ queryKey: ['budget', trip.id], queryFn: () => api.getBudget(trip.id) })
  const expenses = useQuery({ queryKey: ['expenses', trip.id], queryFn: () => api.listExpenses(trip.id) })
  const members = useQuery({ queryKey: ['members', trip.id], queryFn: () => api.listTripMembers(trip.id) })
  const [form, setForm] = useState<Expense | 'new' | null>(start === 'expense' ? 'new' : null)
  const [editBudget, setEditBudget] = useState(start === 'budget')
  const [tab, setTab] = useState<BudgetTab>(start === 'budget' ? 'resumen' : start === 'balances' ? 'saldos' : 'gastos')
  const [report, setReport] = useState(false)
  const closeReport = useCallback(() => setReport(false), [])
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState<'all' | 'mine' | 'paid'>('all')
  const [tipHidden, hideTip] = useDismissed(`roam-tip-deudas-${trip.id}`)
  const [copied, setCopied] = useState(false)
  const editingId = form && form !== 'new' ? form.id : null

  const profile = useProfile()
  // Moneda del viaje: la guardada o, si aún no hay, la de tu país (perfil o navegador).
  const homeCurrency = currencyForCountry(profile.data?.home_country) ?? currencyForCountry(localeCountry()) ?? 'EUR'
  const currency = budget.data?.currency ?? homeCurrency
  const list = useMemo(() => expenses.data ?? [], [expenses.data])
  const spending = useMemo(() => list.filter((e) => !isSettlement(e)), [list])
  const people = useMemo(() => tripPeople(members.data ?? [], trip.companions ?? [], user.id), [members.data, trip.companions, user.id])
  const keys = people.map((p) => p.key)
  const meKey = `u:${user.id}`
  const group = people.length > 1
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['expenses', trip.id] }), qc.invalidateQueries({ queryKey: ['expense-history', trip.id] }), qc.invalidateQueries({ queryKey: ['budget', trip.id] })])

  const total = totalSpent(list)
  const byCat = CATEGORY_ORDER.map((c) => ({ c, v: spending.filter((e) => e.category === c).reduce((a, e) => a + e.amount * e.rate, 0) })).filter((x) => x.v > 0)
  const perPerson = people.map((p) => ({ p, v: spending.reduce((a, e) => a + (sharesOf(e, keys).get(p.key) ?? 0), 0) })).sort((a, b) => b.v - a.v)
  const days = trip.start_date && trip.end_date ? daysBetween(trip.start_date, trip.end_date) : null
  const limit = budget.data?.amount ?? null
  const pct = limit ? total / limit : null
  const planned = trip.status === 'planned'

  // Cuentas claras: lo que pagó cada uno frente a lo que le toca según el reparto de cada gasto (y los pagos para saldar).
  const { paid, owed } = balancesOf(list, keys)
  const transfers = settleBalances(paid, owed)
  const who = (k: string | null) => people.find((p) => p.key === k)
  const net = netBalances(paid, owed)
  const payers = new Map(list.map((e) => [e.id, payerOf(e)]))
  // Nombre de verdad (no «Tú»): el informe y el CSV los lee cualquiera.
  const fullName = (k: string) => {
    const p = who(k)
    return p ? p.avatar.display_name || p.avatar.username || p.name : k.startsWith('g:') ? k.slice(2) : 'Antiguo participante'
  }
  const rows = expenseRows(list, keys, fullName)
  const finished = trip.end_date ? today() >= trip.end_date : trip.status === 'done'
  const myBalance = net.get(meKey) ?? 0
  const myShare = spending.reduce((a, e) => a + (sharesOf(e, keys).get(meKey) ?? 0), 0)
  const hasAccounts = group && list.some((e) => payerOf(e))
  const nameOf = (k: string | null, as: 'subject' | 'object' = 'subject') => {
    const p = who(k)
    return p?.me ? (as === 'subject' ? 'Tú' : 'ti') : (p?.name ?? '¿?')
  }

  const settle = useMutation({
    mutationFn: (t: Transfer & Partial<Payment>) =>
      api.addExpense(trip.id, {
        category: 'settlement',
        amount: Math.round(t.amount * 100) / 100,
        currency,
        rate: 1,
        spent_on: t.date === undefined ? today() : t.date,
        description: t.note ?? null,
        payer_key: t.from,
        paid_by: t.from.startsWith('u:') ? t.from.slice(2) : null,
        transfer_kind: t.kind ?? 'payment',
        split_mode: 'amount',
        split: [{ k: t.to, v: Math.round(t.amount * 100) / 100 }],
      }),
    onSuccess: refresh,
  })
  const closed = !!budget.data?.closed_at
  const closing = useMutation({ mutationFn: (on: boolean) => api.setAccountsClosed(trip.id, on), onSuccess: refresh })
  const answer = useMutation({ mutationFn: (x: { id: string; status: 'confirmed' | 'rejected' }) => api.updateExpense(x.id, { payment_status: x.status }), onSuccess: refresh })
  async function askClose() {
    const pending = list.filter((e) => e.payment_status === 'pending').length
    const ok = await ask({
      title: '¿Cerrar las cuentas del viaje?',
      body: [
        transfers.length ? `Aún ${transfers.length === 1 ? 'queda 1 pago' : `quedan ${transfers.length} pagos`} por hacer.` : null,
        pending ? `Hay ${pending === 1 ? '1 pago' : `${pending} pagos`} sin confirmar.` : null,
        'Nadie podrá añadir, cambiar ni borrar gastos hasta que alguien las reabra.',
      ]
        .filter(Boolean)
        .join(' '),
      confirm: 'Cerrar cuentas',
      icon: 'lock',
    })
    if (ok) closing.mutate(true)
  }
  async function askReopen() {
    if (await ask({ title: '¿Reabrir las cuentas?', body: 'Todos podrán volver a cambiar los gastos. Se avisará al grupo.', confirm: 'Reabrir', icon: 'lock_open' })) closing.mutate(false)
  }
  async function askReject(e: Expense) {
    const ok = await ask({ title: '¿No has recibido este pago?', body: 'Deja de contar en los saldos y se avisa a quien lo apuntó.', confirm: 'No lo he recibido', danger: true, icon: 'close' })
    if (ok) answer.mutate({ id: e.id, status: 'rejected' })
  }
  const toConfirm = list.filter((e) => isSettlement(e) && e.payment_status === 'pending' && e.split?.[0]?.k === meKey)
  const undo = useMutation({ mutationFn: (id: string) => api.deleteExpense(id), onSuccess: refresh })

  async function askSettle(t: Transfer) {
    const ok = await ask({
      title: `¿${fullName(t.from)} ya ha pagado ${formatMoney(t.amount, currency)} a ${fullName(t.to)}?`,
      body: finished
        ? 'Se apunta como pagado para todos. Se puede deshacer en «Pagos hechos».'
        : 'El viaje no ha terminado: es mejor zanjar todo al final. Si ya se ha hecho el pago, apúntalo para que las cuentas no se descuadren.',
      confirm: 'Sí, está pagado',
      icon: 'handshake',
    })
    if (ok) settle.mutate(t)
  }
  async function askUndo(e: Expense) {
    if (await ask({ title: '¿Deshacer este pago?', body: 'La deuda volverá a aparecer en los saldos de todos.', confirm: 'Deshacer', danger: true, icon: 'undo' })) undo.mutate(e.id)
  }
  const exportCsv = () => saveCsv(trip.title, expensesCsv(list, keys, fullName, currency))

  async function shareAccounts() {
    const lines = [
      `Cuentas de «${trip.title}» (${formatMoney(total, currency)} en total)`,
      ...(transfers.length ? transfers.map((t) => `• ${fullName(t.from)} → ${fullName(t.to)}: ${formatMoney(t.amount, currency)}`) : ['Estamos en paz.']),
    ]
    await shareText(lines.join('\n'))
  }
  const askFor = (t: Transfer) => shareText(`¡Hola, ${fullName(t.from)}! Según las cuentas de «${trip.title}», me debes ${formatMoney(t.amount, currency)}. Cuando lo pagues, márcalo en ROAM («Gastos» → «Saldos»).`)
  async function shareText(text: string) {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text }).catch(() => {})
    else {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const groups = useMemo(() => {
    const g = new Map<string, Expense[]>()
    const q = fold(query.trim())
    const shown = list.filter(
      (e) =>
        (!q || fold(`${e.description ?? ''} ${isSettlement(e) ? 'pago' : EXPENSE_CATEGORIES[e.category as ExpenseCategory].label}`).includes(q)) &&
        (only === 'all' || (only === 'paid' ? payerOf(e) === meKey : payerOf(e) === meKey || (e.split?.length ? e.split.some((x) => x.k === meKey && x.v > 0) : true))),
    )
    for (const e of shown) g.set(e.spent_on ?? '', [...(g.get(e.spent_on ?? '') ?? []), e])
    return [...g]
  }, [list, query, only, meKey])

  if (budget.isLoading || expenses.isLoading) return <div className="card h-40 animate-pulse p-4" />

  const newExpense = closed ? null : (
    <button type="button" className="btn btn-accent min-h-11 flex-1 px-2! sm:px-4! sm:flex-none" onClick={() => (setTab('gastos'), setForm('new'))}>
      <Icon name="add" size={18} /> Apuntar gasto
    </button>
  )
  const TABS: { id: BudgetTab; label: string; n?: number }[] = [
    { id: 'gastos', label: 'Gastos', n: spending.length },
    ...(group ? [{ id: 'saldos' as const, label: 'Saldos', n: transfers.length || undefined }] : []),
    { id: 'resumen', label: group ? 'Resumen' : 'Presupuesto' },
  ]

  return (
    <div className="card p-4" id="gastos">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="headline-sm uppercase">{planned ? 'Presupuesto' : 'Gastos'}</h3>
        <span className="flex items-center gap-2">
          <span className="label-code hidden items-center gap-1 text-ink-soft sm:flex" title="Solo lo ven los participantes del viaje">
            <Icon name="lock" size={14} /> Privado
          </span>
          {list.length > 0 && (
            <button type="button" className="btn btn-ghost px-3! py-1.5! text-sm" onClick={() => setReport(true)}>
              <Icon name="download" size={18} /> Exportar
            </button>
          )}
        </span>
      </div>
      <ErrorNote error={budget.error ?? expenses.error ?? settle.error ?? undo.error ?? closing.error ?? answer.error} />

      {closed && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-surface-low p-3 text-sm" role="note">
          <Icon name="lock" size={20} className="shrink-0 text-accent" />
          <p className="min-w-0 flex-1">
            <b>Cuentas cerradas</b>
            {budget.data?.closed_by && who(`u:${budget.data.closed_by}`) ? (who(`u:${budget.data.closed_by}`)!.me ? ' por ti' : ` por ${who(`u:${budget.data.closed_by}`)!.name}`) : ''}
            {budget.data?.closed_at ? ` el ${formatDay(budget.data.closed_at.slice(0, 10))}` : ''}. Los gastos no se pueden cambiar.
          </p>
          <button type="button" className="btn btn-ghost min-h-11" disabled={closing.isPending} onClick={askReopen}>
            <Icon name="lock_open" size={18} /> Reabrir
          </button>
        </div>
      )}
      {toConfirm.map((e) => (
        <div key={e.id} className="mb-3 rounded-md bg-accent-soft p-3 text-sm text-accent-ink" role="note">
          <p>
            <b>{who(payerOf(e))?.name ?? 'Alguien'}</b> {e.transfer_kind === 'cash' ? 'te dio' : 'te ha pagado'} <b>{formatMoney(e.amount * e.rate, currency)}</b>
            {e.description ? ` (${e.description})` : ''}. ¿Lo has recibido?
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-dark min-h-11 flex-1" disabled={answer.isPending} onClick={() => answer.mutate({ id: e.id, status: 'confirmed' })}>
              <Icon name="check" size={18} /> Sí, recibido
            </button>
            <button type="button" className="btn btn-ghost min-h-11" disabled={answer.isPending} onClick={() => askReject(e)}>
              No
            </button>
          </div>
        </div>
      ))}

      {!list.length && !limit && !editBudget && form === null ? (
        <div className="rounded-sm bg-surface-low p-4 text-sm">
          <p className="text-ink-soft">
            {planned ? 'Fija cuánto quieres gastar y apunta lo que ya hayas reservado.' : 'Apunta lo que gastasteis: transporte, alojamiento, comida…'}
            {group && ' Cada gasto dice quién pagó y entre quiénes se reparte, y la app calcula quién debe a quién.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => (setTab('resumen'), setEditBudget(true))}>
              <Icon name="savings" size={18} /> Fijar presupuesto
            </button>
            {newExpense}
          </div>
        </div>
      ) : (
        <>
          {/* Tu saldo y el total, siempre a la vista. */}
          <div className="rounded-md bg-surface-low p-4">
            {hasAccounts ? (
              <>
                <div className="label-stamp text-ink-soft">Tu saldo</div>
                <div className={`font-display text-3xl font-bold tracking-tight ${myBalance > 0 ? 'text-emerald-700' : myBalance < 0 ? 'text-red-700' : ''}`}>
                  {myBalance > 0 ? `Te deben ${formatMoney(myBalance, currency)}` : myBalance < 0 ? `Debes ${formatMoney(-myBalance, currency)}` : 'Estás en paz'}
                </div>
                <div className="mt-1 text-sm text-ink-soft">
                  {formatMoney(total, currency)} gastado entre todos · tu parte {formatMoney(myShare, currency)}
                </div>
              </>
            ) : (
              <>
                <div className="label-stamp text-ink-soft">{planned ? 'Previsto / reservado' : 'Gastado'}</div>
                <div className="font-display text-3xl font-bold tracking-tight">{formatMoney(total, currency)}</div>
                {limit ? <div className="mt-1 text-sm text-ink-soft">de {formatMoney(limit, currency)} de presupuesto</div> : null}
              </>
            )}
            <div className={`mt-3 gap-2 sm:flex ${!closed && hasAccounts && transfers.length ? 'grid grid-cols-2' : 'flex'}`}>
              {newExpense}
              {hasAccounts && transfers.length > 0 && (
                <button type="button" className="btn btn-ghost min-h-11 flex-1 px-2! sm:px-4! sm:flex-none" onClick={() => setTab('saldos')}>
                  <Icon name="handshake" size={18} /> Saldar<span className="hidden sm:inline"> cuentas</span>
                </button>
              )}
            </div>
          </div>

          {/* Consejo: zanjar al final y, si se paga antes, apuntarlo. */}
          {group && !closed && !planned && hasAccounts && transfers.length > 0 && (finished || !tipHidden) && (
            <div className="mt-3 flex items-start gap-3 rounded-md bg-accent-soft p-3 text-sm text-accent-ink" role="note">
              <Icon name={finished ? 'handshake' : 'lightbulb'} size={20} className="mt-0.5 shrink-0" />
              <p className="min-w-0 flex-1">
                {finished ? (
                  <>
                    <b>El viaje ha terminado: toca zanjar las deudas.</b> {transfers.length === 1 ? 'Queda 1 pago' : `Quedan ${transfers.length} pagos`}. Marca cada uno como pagado cuando se haga.
                  </>
                ) : (
                  <>
                    <b>Mejor zanjad todo al final del viaje.</b> Si alguien tiene que pagar antes, que lo apunte en «Saldos» como pagado: si no, las cuentas se descuadran.
                  </>
                )}
              </p>
              {!finished && (
                <button type="button" className="-m-1 grid h-9 w-9 shrink-0 place-items-center rounded-full" aria-label="Ocultar el consejo" onClick={hideTip}>
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex gap-1 rounded-md bg-surface-low p-1" role="tablist" aria-label="Gastos">
            {TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => setTab(x.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-sm font-semibold transition ${tab === x.id ? 'bg-card text-ink shadow-card ring-1 ring-outline-soft' : 'text-ink-soft hover:text-ink'}`}
              >
                {x.label}
                {!!x.n && <span className="rounded-full bg-surface-container px-1.5 text-[11px] text-ink-soft">{x.n}</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'gastos' && (
        <>
          {form === 'new' && !closed && (
            <div className="mt-4">
              <ExpenseForm trip={trip} currency={currency} hasBudget={!!budget.data} people={people} list={list} me={user.id} editing={null} onDone={() => (setForm(null), refresh())} onCancel={() => setForm(null)} />
            </div>
          )}
          {list.length > 5 && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-sm bg-surface-low px-3 ring-1 ring-outline-soft focus-within:ring-2 focus-within:ring-ink">
                <Icon name="search" size={18} className="text-ink-soft" />
                <input aria-label="Buscar gasto" className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Buscar gasto" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {group && (
                <div className="flex rounded-md bg-surface-low p-1" role="radiogroup" aria-label="Qué gastos">
                  {(
                    [
                      ['all', 'Todos'],
                      ['mine', 'Me tocan'],
                      ['paid', 'Pagué yo'],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={only === id} onClick={() => setOnly(id)} className={`min-h-9 flex-1 whitespace-nowrap rounded-sm px-3 text-xs font-semibold ${only === id ? 'bg-ink text-paper' : 'text-ink-soft'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {groups.length > 0 ? (
            <div className="mt-4 space-y-4">
              {groups.map(([day, items]) => (
                <div key={day}>
                  <div className="label-stamp mb-1.5 flex justify-between text-ink-soft">
                    <span>{day ? formatDay(day) : 'Sin fecha'}</span>
                    <span>{formatMoney(totalSpent(items), currency)}</span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((e) => {
                      if (isSettlement(e)) {
                        const to = e.split?.[0]?.k ?? null
                        return (
                          <li key={e.id} className="flex items-center gap-3 rounded-sm border border-dashed border-outline-soft px-3 py-2 text-sm">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-container text-emerald-700">
                              <Icon name="handshake" size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">
                                {nameOf(payerOf(e))} {who(payerOf(e))?.me ? 'has pagado' : 'ha pagado'} a {nameOf(to, 'object')}
                              </span>
                              <span className="block text-xs text-ink-soft">
                                {e.payment_status === 'rejected' ? 'Rechazado: no cuenta en los saldos' : e.payment_status === 'pending' ? 'Sin confirmar · no es un gasto' : e.transfer_kind === 'cash' ? 'Cambio de efectivo · no es un gasto' : 'Para saldar cuentas · no es un gasto'}
                              </span>
                            </span>
                            <span className="shrink-0 font-display font-semibold">{formatMoney(e.amount * e.rate, currency)}</span>
                            <button type="button" hidden={closed} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-container hover:text-ink" aria-label="Deshacer el pago" title="Deshacer" disabled={undo.isPending} onClick={() => askUndo(e)}>
                              <Icon name="undo" size={16} />
                            </button>
                          </li>
                        )
                      }
                      const cat = EXPENSE_CATEGORIES[e.category as ExpenseCategory]
                      const stop = trip.stops.find((s) => s.id === e.stop_id)
                      const payer = who(payerOf(e))
                      const mine = sharesOf(e, keys).get(meKey) ?? 0
                      const amount = e.amount * e.rate
                      // Lo que este gasto mueve en tu saldo, como en Tricount: + lo que te deben si pagaste tú, − tu parte si pagó otro.
                      const delta = !group || !payer ? null : payer.me ? amount - mine : -mine
                      const deltaLabel = delta === null ? null : Math.abs(delta) < 0.005 ? 'no te toca' : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta), currency)}`
                      if (editingId === e.id && !closed)
                        return (
                          <li key={e.id}>
                            <ExpenseForm trip={trip} currency={currency} hasBudget={!!budget.data} people={people} list={list} me={user.id} editing={e} history={<ExpenseHistory tripId={trip.id} expenseId={e.id} list={list} nameOf={fullName} locked={closed} onRestored={refresh} />} onDone={() => (setForm(null), refresh())} onCancel={() => setForm(null)} />
                          </li>
                        )
                      return (
                        <li key={e.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => (closed ? askReopen() : setForm(e))}
                            aria-label={`Editar ${e.description || cat.label}`}
                            className="group flex min-w-0 flex-1 items-center gap-3 rounded-sm bg-surface-low px-3 py-2 text-left text-sm transition hover:bg-surface-container"
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: cat.color }}>
                              <Icon name={cat.icon} size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{e.description || cat.label}</span>
                              <span className="block truncate text-xs text-ink-soft">
                                {[group && payer ? (payer.me ? 'pagaste tú' : `pagó ${payer.name}`) : null, stop?.name, !group ? cat.label : null].filter(Boolean).join(' · ') || cat.label}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-display font-semibold">{formatMoney(amount, currency)}</span>
                              {deltaLabel ? (
                                <span
                                  className={`block text-xs font-semibold ${delta! > 0.005 ? 'text-emerald-700' : delta! < -0.005 ? 'text-red-700' : 'font-normal text-ink-soft'}`}
                                  title={delta! > 0.005 ? 'Lo que te deben de este gasto' : delta! < -0.005 ? 'Tu parte de este gasto' : undefined}
                                >
                                  {deltaLabel}
                                </span>
                              ) : e.currency !== currency ? (
                                <span className="block text-xs text-ink-soft">{formatMoney(e.amount, e.currency)}</span>
                              ) : null}
                            </span>
                            <Icon name="edit" size={16} className="shrink-0 text-ink-soft opacity-50 transition group-hover:opacity-100" />
                          </button>
                          {e.receipt_path && <ReceiptButton path={e.receipt_path} label={`Ver el ticket de ${e.description || cat.label}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent hover:bg-surface-container" />}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            form === null && (list.length > 0 || limit) && <p className="mt-4 text-sm text-ink-soft">{list.length ? 'Ningún gasto coincide.' : 'Aún no hay gastos apuntados.'}</p>
          )}
        </>
      )}

      {tab === 'saldos' && group && (
        <TripBalances
          people={people}
          currency={currency}
          rows={rows}
          payers={payers}
          paid={paid}
          owed={owed}
          net={net}
          transfers={transfers}
          payments={list.filter(isSettlement)}
          finished={finished}
          closed={closed}
          onClose={askClose}
          busy={settle.isPending || undo.isPending}
          error={null}
          onSettle={askSettle}
          onPayment={async (p) => {
            await settle.mutateAsync(p)
            // Efectivo ya devuelto: se apuntan las dos partes y el saldo queda igual.
            if (p.returned) await settle.mutateAsync({ ...p, from: p.to, to: p.from, note: p.note ? `Devolución: ${p.note}` : 'Devolución' })
          }}
          onUndo={askUndo}
          onShare={shareAccounts}
          onAsk={askFor}
        />
      )}

      {tab === 'resumen' && (
        <div className="mt-4">
          {editBudget ? (
            <BudgetForm trip={trip} current={budget.data ?? null} fallbackCurrency={homeCurrency} expenses={list} onDone={() => (setEditBudget(false), refresh())} onCancel={() => setEditBudget(false)} />
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="label-stamp text-ink-soft">{planned ? 'Previsto / reservado' : 'Gastado'}</div>
                  <div className="font-display text-2xl font-bold tracking-tight">{formatMoney(total, currency)}</div>
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
                    <div className={`h-full rounded-full transition-all ${pct > 1 ? 'bg-red-600' : pct > 0.85 ? 'bg-accent' : 'bg-ink'}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
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
                {group && total > 0 && (
                  <div className="rounded-sm bg-surface-low px-3 py-2">
                    <div className="label-stamp text-ink-soft">Media por persona</div>
                    <div className="font-display font-semibold">{formatMoney(total / people.length, currency)}</div>
                  </div>
                )}
              </div>
              {group && perPerson.some((x) => x.v > 0) && (
                <div className="mt-4">
                  <h4 className="label-stamp mb-2 text-ink-soft">Lo que ha gastado cada uno</h4>
                  <ul className="space-y-2 text-sm">
                    {perPerson.map(({ p, v }) => (
                      <li key={p.key} className="flex items-center gap-2">
                        <Avatar profile={p.avatar} className="h-6 w-6 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="flex justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            <b className="shrink-0 font-display tabular-nums">{formatMoney(v, currency)}</b>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-container" aria-hidden>
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${(v / perPerson[0].v) * 100}%` }} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-soft">Su parte de los gastos, la haya pagado quien la haya pagado.</p>
                </div>
              )}
              {byCat.length > 0 && (
                <h4 className="label-stamp mt-4 text-ink-soft">Por categoría</h4>
              )}
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
            </>
          )}
        </div>
      )}
      {tab === 'resumen' && (
        <details className="mt-5 border-t border-surface-highest pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            <Icon name="history" size={20} className="text-accent" /> Historial de cambios
          </summary>
          <ExpenseHistory tripId={trip.id} list={list} nameOf={fullName} locked={closed} onRestored={refresh} />
        </details>
      )}
      {copied && (
        <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">
          Texto copiado: pégalo donde quieras.
        </p>
      )}
      {report && (
        <ExpenseReport
          title={trip.title}
          start={trip.start_date}
          end={trip.end_date}
          currency={currency}
          total={total}
          rows={rows}
          people={keys}
          nameOf={fullName}
          paid={paid}
          owed={owed}
          net={net}
          transfers={transfers}
          onCsv={exportCsv}
          onClose={closeReport}
        />
      )}
    </div>
  )
}

/** Aviso que se oculta en este dispositivo (si no hay almacenamiento, vuelve a salir). */
function useDismissed(key: string): [boolean, () => void] {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  return [
    hidden,
    () => {
      setHidden(true)
      try {
        localStorage.setItem(key, '1')
      } catch {
        /* sin almacenamiento */
      }
    },
  ]
}
