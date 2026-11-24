import { useState } from 'react'
import { Avatar } from './Avatar'
import { DateField, formatDay } from './DatePicker'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import type { Expense } from '../lib/db'
import type { ExpenseRow } from '../lib/expenseExport'
import { formatMoney } from '../lib/money'
import { localDate } from '../lib/today'
import type { Person } from '../lib/tripPeople'

export interface Transfer {
  from: string
  to: string
  amount: number
}
export type Payment = Transfer & {
  date: string | null
  note: string | null
  kind?: 'payment' | 'cash'
  /** Cambio de efectivo que ya se devolvió: se apuntan las dos partes. */
  returned?: boolean
}

interface Props {
  people: Person[]
  currency: string
  rows: ExpenseRow[]
  /** Claves de quien pagó cada gasto, por id de gasto. */
  payers: Map<string, string | null>
  paid: Map<string, number>
  owed: Map<string, number>
  net: Map<string, number>
  transfers: Transfer[]
  payments: Expense[]
  finished: boolean
  closed: boolean
  onClose: () => void
  busy: boolean
  error: unknown
  /** Marca como pagada una deuda propuesta (pregunta antes). */
  onSettle: (t: Transfer) => void
  /** Apunta un pago cualquiera. Se resuelve cuando está guardado. */
  onPayment: (p: Payment) => Promise<unknown>
  onUndo: (e: Expense) => void
  onShare: () => void
  /** Mensaje para pedir un pago que te deben. */
  onAsk: (t: Transfer) => void
}

const payerKey = (e: Expense) => e.payer_key ?? (e.paid_by ? `u:${e.paid_by}` : null)

/** Pestaña «Saldos»: quién paga a quién, el saldo de cada uno con su detalle y los pagos ya hechos. */
export function TripBalances({ people, currency, rows, payers, paid, owed, net, transfers, payments, finished, closed, onClose, busy, error, onSettle, onPayment, onUndo, onShare, onAsk }: Props) {
  const [form, setForm] = useState<Partial<Transfer> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const person = (k: string | null) => people.find((p) => p.key === k)
  const money = (n: number) => formatMoney(n, currency)
  const max = Math.max(0.01, ...people.map((p) => Math.abs(net.get(p.key) ?? 0)))
  const sorted = [...people].sort((a, b) => (net.get(b.key) ?? 0) - (net.get(a.key) ?? 0))
  const noPayer = rows.filter((r) => !r.payer).length

  return (
    <div className="mt-4 space-y-6" id="cuentas">
      <ErrorNote error={error} />
      <section>
        <h4 className="label-stamp mb-2 text-ink-soft">Para quedar en paz</h4>
        {transfers.length ? (
          <ul className="space-y-2">
            {transfers.map((t) => {
              const from = person(t.from)
              const to = person(t.to)
              const mine = from?.me || to?.me
              return (
                <li key={`${t.from}${t.to}`} className={`rounded-md bg-surface-low p-3 ${mine ? 'ring-1 ring-accent/60' : ''}`}>
                  <div className="flex items-center gap-2">
                    <Who person={from} />
                    <span className="flex shrink-0 flex-col items-center px-1">
                      <span className="font-display text-lg font-bold leading-tight tabular-nums">{money(t.amount)}</span>
                      <Icon name="arrow_forward" size={18} className="text-accent" />
                      <span className="sr-only">{from?.me ? 'pagas' : 'paga'} a</span>
                    </span>
                    <Who person={to} end />
                  </div>
                  <div className={`mt-3 flex gap-2 ${closed ? 'hidden' : ''}`}>
                    <button type="button" className="btn btn-dark min-h-11 min-w-0 flex-1 px-2!" disabled={busy} onClick={() => onSettle(t)}>
                      <Icon name="check" size={18} /> Pagado
                    </button>
                    <button type="button" className="btn btn-ghost min-h-11 px-3!" onClick={() => setForm(t)}>
                      Otro importe
                    </button>
                    {to?.me && (
                      <button type="button" className="btn btn-ghost min-h-11 px-3!" aria-label={`Pedir el pago a ${from?.name ?? ''}`} title="Pedir el pago" onClick={() => onAsk(t)}>
                        <Icon name="send" size={18} />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-md bg-surface-low p-4 font-semibold">
            <Icon name="check_circle" className="text-emerald-700" /> Estáis en paz: nadie debe nada a nadie.
          </p>
        )}
        {transfers.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            La app junta todas las deudas para hacer los mínimos pagos, así que puedes deber a alguien que no pagó tus gastos.
            {!finished && ' Con cada gasto nuevo, la propuesta puede cambiar.'}
          </p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex">
          {!closed && (
            <button type="button" className="btn btn-ghost min-h-11" onClick={() => setForm({})}>
              <Icon name="payments" size={18} /> Registrar un pago o efectivo
            </button>
          )}
          <button type="button" className="btn btn-ghost min-h-11" onClick={onShare}>
            <Icon name="ios_share" size={18} /> Compartir cuentas
          </button>
          {!closed && finished && (
            <button type="button" className="btn btn-ghost min-h-11" onClick={onClose}>
              <Icon name="lock" size={18} /> Cerrar cuentas
            </button>
          )}
        </div>
        {form && !closed && (
          <PaymentForm
            key={`${form.from}${form.to}`}
            people={people}
            currency={currency}
            initial={form}
            onCancel={() => setForm(null)}
            onSave={async (p) => {
              await onPayment(p)
              setForm(null)
            }}
          />
        )}
      </section>

      <section>
        <h4 className="label-stamp mb-2 text-ink-soft">Saldo de cada uno</h4>
        <ul className="space-y-2">
          {sorted.map((p) => {
            const bal = net.get(p.key) ?? 0
            const shown = open === p.key
            const width = `${(Math.abs(bal) / max) * 50}%`
            return (
              <li key={p.key} className="rounded-md bg-surface-low">
                <button type="button" className="w-full p-3 text-left" aria-expanded={shown} onClick={() => setOpen(shown ? null : p.key)}>
                  <span className="flex items-center gap-2.5">
                    <Avatar profile={p.avatar} className="h-9 w-9 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {p.name}
                        {p.guest && <span className="ml-1 text-xs font-normal text-ink-soft">(sin cuenta)</span>}
                      </span>
                      <span className="block text-xs text-ink-soft">{bal > 0 ? (p.me ? 'te deben' : 'le deben') : bal < 0 ? (p.me ? 'debes' : 'debe') : 'en paz'}</span>
                    </span>
                    <span className={`shrink-0 font-display text-lg font-bold tabular-nums ${bal > 0 ? 'text-emerald-700' : bal < 0 ? 'text-red-700' : 'text-ink-soft'}`}>
                      {bal > 0 ? '+' : bal < 0 ? '−' : ''}
                      {money(Math.abs(bal))}
                    </span>
                    <Icon name={shown ? 'expand_less' : 'expand_more'} size={20} className="shrink-0 text-ink-soft" />
                  </span>
                  {/* Barra desde el centro: a la derecha le deben, a la izquierda debe. */}
                  <span className="relative mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-highest" aria-hidden>
                    <span className={`absolute inset-y-0 ${bal >= 0 ? 'left-1/2 bg-emerald-700' : 'right-1/2 bg-red-700'}`} style={{ width }} />
                    <span className="absolute inset-y-0 left-1/2 w-px bg-ink/40" />
                  </span>
                </button>
                {shown && <PersonDetail person={p} rows={rows} payers={payers} paid={paid.get(p.key) ?? 0} owed={owed.get(p.key) ?? 0} bal={bal} money={money} />}
              </li>
            )
          })}
        </ul>
        {noPayer > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft">
            <Icon name="info" size={16} className="shrink-0" />
            {noPayer === 1 ? 'Hay 1 gasto que no dice quién pagó: no cuenta en los saldos.' : `Hay ${noPayer} gastos que no dicen quién pagó: no cuentan en los saldos.`}
          </p>
        )}
      </section>

      {payments.length > 0 && (
        <section>
          <h4 className="label-stamp mb-2 text-ink-soft">Pagos hechos</h4>
          <ul className="space-y-1.5">
            {payments.map((e) => {
              const from = person(payerKey(e))
              const to = person(e.split?.[0]?.k ?? null)
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-md border border-dashed border-outline-soft px-3 py-2 text-sm">
                  <Icon name="handshake" size={18} className="shrink-0 text-emerald-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {from?.name ?? '¿?'} → {to?.me ? 'ti' : (to?.name ?? '¿?')}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">{[e.transfer_kind === 'cash' ? 'Efectivo' : null, e.spent_on && formatDay(e.spent_on), e.description].filter(Boolean).join(' · ')}</span>
                    {e.payment_status === 'pending' && <span className="block text-xs font-semibold text-accent-deep">Falta que lo confirme {to?.me ? 'tú' : (to?.name ?? 'quien lo recibe')}</span>}
                    {e.payment_status === 'rejected' && <span className="block text-xs font-semibold text-red-700">Rechazado: no cuenta</span>}
                  </span>
                  <span className="shrink-0 font-display font-semibold tabular-nums">{money(e.amount * e.rate)}</span>
                  <button type="button" hidden={closed} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-container hover:text-ink" aria-label="Deshacer el pago" title="Deshacer" disabled={busy} onClick={() => onUndo(e)}>
                    <Icon name="undo" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Who({ person: p, end = false }: { person?: Person; end?: boolean }) {
  return (
    <span className={`flex min-w-0 flex-1 flex-col gap-1.5 ${end ? 'items-end text-right' : 'items-start'}`}>
      {p && <Avatar profile={p.avatar} className="h-9 w-9 shrink-0" />}
      <span className="max-w-full break-words text-sm font-semibold leading-tight">{p?.name ?? '¿?'}</span>
    </span>
  )
}

/** De dónde sale un saldo: lo que pagó, lo que le toca y cada gasto que lo mueve. */
function PersonDetail({
  person,
  rows,
  payers,
  paid,
  owed,
  bal,
  money,
}: {
  person: Person
  rows: ExpenseRow[]
  payers: Map<string, string | null>
  paid: number
  owed: number
  bal: number
  money: (n: number) => string
}) {
  const moves = rows.flatMap((r) => {
    const payer = payers.get(r.id)
    if (!payer || r.rejected) return []
    const put = payer === person.key ? r.total : 0
    const share = r.shares.find((s) => s.key === person.key)?.amount ?? 0
    return put || share ? [{ r, put, share }] : []
  })
  return (
    <div className="border-t border-surface-highest px-3 pb-3 pt-2 text-sm">
      <p className="text-xs text-ink-soft">
        {person.me ? 'Has puesto' : 'Ha puesto'} <b className="text-ink">{money(paid)}</b> y {person.me ? 'te' : 'le'} corresponden <b className="text-ink">{money(owed)}</b>: {bal > 0 ? '+' : bal < 0 ? '−' : ''}
        {money(Math.abs(bal))}. Incluye los pagos entre vosotros.
      </p>
      <ul className="mt-2 divide-y divide-surface-highest">
        {moves.map(({ r, put, share }) => {
          const delta = put - share
          return (
            <li key={r.id} className="flex items-baseline gap-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.settlement ? (put ? `Pago a ${r.shares[0]?.name ?? '¿?'}` : `Pago de ${r.payer ?? '¿?'}`) : r.concept}</span>
                <span className="block text-xs text-ink-soft">
                  {r.settlement ? (put ? 'pagó' : 'recibió') : [put ? `pagó ${money(put)}` : null, share ? `su parte ${money(share)}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`shrink-0 font-display font-semibold tabular-nums ${delta > 0.004 ? 'text-emerald-700' : delta < -0.004 ? 'text-red-700' : 'text-ink-soft'}`}>
                {delta > 0.004 ? '+' : delta < -0.004 ? '−' : ''}
                {money(Math.abs(delta))}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Apuntar un pago que ya se ha hecho (Bizum, efectivo…), aunque no sea de los que propone la app: sin esto, un pago
 * real entre dos personas que la app no emparejaba no se podía guardar y las cuentas se descuadraban.
 */
function PaymentForm({ people, currency, initial, onSave, onCancel }: { people: Person[]; currency: string; initial: Partial<Transfer>; onSave: (p: Payment) => Promise<void>; onCancel: () => void }) {
  const me = people.find((p) => p.me)?.key ?? people[0].key
  const [from, setFrom] = useState(initial.from ?? me)
  const [to, setTo] = useState(initial.to ?? people.find((p) => p.key !== (initial.from ?? me))!.key)
  const [amount, setAmount] = useState(initial.amount ? initial.amount.toFixed(2).replace('.', ',') : '')
  const [date, setDate] = useState<string | null>(localDate())
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'payment' | 'cash'>('payment')
  const [returned, setReturned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const parsed = Number(amount.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  const value = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null
  const same = from === to
  const select = (label: string, v: string, set: (k: string) => void) => (
    <label className="min-w-0 flex-1 text-sm">
      <span className="label-stamp mb-1 block text-ink-soft">{label}</span>
      <select className="field py-2.5!" value={v} onChange={(e) => set(e.target.value)}>
        {people.map((p) => (
          <option key={p.key} value={p.key}>
            {p.me ? 'Yo' : p.name}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <form
      className="mt-3 rounded-md bg-surface-low p-3 ring-2 ring-accent"
      ref={(el) => {
        if (el && !el.dataset.seen) {
          el.dataset.seen = '1'
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!value || same || saving) return
        setSaving(true)
        setError(null)
        try {
          await onSave({ from, to, amount: value, date, note: note.trim() || null, kind, returned: kind === 'cash' && returned })
        } catch (err) {
          setError(err)
          setSaving(false)
        }
      }}
    >
      <div className="mb-3 font-display font-semibold">{kind === 'cash' ? 'Cambio de efectivo' : 'Registrar un pago'}</div>
      <div className="mb-3 flex rounded-md bg-card p-1" role="radiogroup" aria-label="Qué es">
        {(
          [
            ['payment', 'Pago de una deuda'],
            ['cash', 'Cambio de efectivo'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`min-h-10 flex-1 rounded-sm px-2 text-xs font-semibold ${kind === id ? 'bg-ink text-paper' : 'text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {kind === 'cash' && <p className="mb-3 text-xs text-ink-soft">Dinero que una persona da a otra (por ejemplo, para cambiarlo). Quien lo recibe lo debe hasta que lo devuelve.</p>}
      <div className="flex gap-2">
        {select(kind === 'cash' ? 'Quién lo dio' : 'Quién pagó', from, setFrom)}
        {select('A quién', to, setTo)}
      </div>
      <label className="mt-3 block text-sm">
        <span className="label-stamp mb-1 block text-ink-soft">Importe ({currency})</span>
        <input className="field py-2.5! font-display text-lg" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <input aria-label="Nota" className="field mt-3 py-2.5!" maxLength={160} placeholder="Nota (opcional): Bizum, efectivo…" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-3">
        <DateField value={date} onChange={setDate} placeholder="Fecha" label="Fecha del pago" />
      </div>
      {kind === 'cash' && (
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={returned} onChange={(e) => setReturned(e.target.checked)} />
          Ya se ha devuelto (por Bizum, en liras…)
        </label>
      )}
      {same && <p className="mt-2 text-xs font-semibold text-red-700">Elige a dos personas distintas</p>}
      <ErrorNote error={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost min-h-11" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-accent min-h-11" disabled={!value || same || saving}>
          {saving ? 'Guardando…' : 'Guardar pago'}
        </button>
      </div>
    </form>
  )
}
