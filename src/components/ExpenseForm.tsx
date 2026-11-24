import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Avatar } from './Avatar'
import { ask } from './ConfirmDialog'
import { CurrencySelect } from './CurrencySelect'
import { DateField, formatDay } from './DatePicker'
import { Icon } from './Icon'
import { ReceiptButton } from './ReceiptButton'
import { ErrorNote } from './ui'
import { fmtNum, parseAmount, parseNum, today } from '../lib/amount'
import { api } from '../lib/api'
import type { NewExpense } from '../lib/api/types'
import type { Expense, ExpenseCategory, SplitMode, TripWithStops } from '../lib/db'
import { findDuplicate, guessCategory } from '../lib/expenseGuess'
import { uid } from '../lib/id'
import { IMAGE_ACCEPT, looksLikeImage } from '../lib/images'
import { CATEGORY_ORDER, EXPENSE_CATEGORIES, currencyForCountry, exchangeRate, formatMoney, sharesOf } from '../lib/money'
import { payerOf, type Person } from '../lib/tripPeople'

const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'equal', label: 'Igual', hint: 'A partes iguales entre los marcados' },
  { id: 'percent', label: '%', hint: 'Cada uno un porcentaje (tiene que sumar 100 %)' },
  { id: 'amount', label: 'Importe', hint: 'Cuánto le toca exactamente a cada uno' },
  { id: 'shares', label: 'Partes', hint: 'Por partes: quien tiene 2 paga el doble que quien tiene 1' },
]

/** Deja a la vista la categoría elegida en su fila (en el móvil se desliza) sin mover la página. */
const centerInRow = (el: HTMLElement | null) => {
  const row = el?.parentElement
  if (el && row) row.scrollLeft = el.offsetLeft - row.offsetLeft - (row.clientWidth - el.clientWidth) / 2
}

export function ExpenseForm({
  trip,
  currency: tripCurrency,
  hasBudget,
  people,
  list,
  me,
  editing,
  history,
  onDone,
  onCancel,
}: {
  trip: TripWithStops
  currency: string
  hasBudget: boolean
  people: Person[]
  /** Los gastos del viaje, para avisar si parece repetido. */
  list: Expense[]
  me: string
  editing: Expense | null
  /** Cambios de este gasto (al editar). */
  history?: React.ReactNode
  onDone: () => void
  onCancel: () => void
}) {
  const inTrip = !trip.start_date || (today() >= trip.start_date && today() <= (trip.end_date ?? trip.start_date))
  // Parada por defecto: la del día de hoy si se está de viaje.
  const todayStop = [...trip.stops].reverse().find((s) => s.arrived_on && s.arrived_on <= today())
  const [category, setCategory] = useState<ExpenseCategory>(editing && editing.category !== 'settlement' ? editing.category : 'food')
  // La categoría sigue a la descripción mientras no se elija a mano.
  const [touchedCategory, setTouchedCategory] = useState(!!editing)
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace('.', ',') : '')
  const [stopId, setStopId] = useState<string | null>(editing ? editing.stop_id : inTrip ? (todayStop?.id ?? null) : null)
  const [currency, setCurrency] = useState(editing?.currency ?? currencyForCountry(trip.stops.find((s) => s.id === stopId)?.country_code) ?? tripCurrency)
  const [touchedCurrency, setTouchedCurrency] = useState(!!editing)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [dropReceipt, setDropReceipt] = useState(false)
  const oldReceipt = editing?.receipt_path ?? null
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

  const duplicate = value && !editing ? findDuplicate(list, { amount: value, currency, spent_on: date }) : undefined
  const notedBy = (id: string | null) => {
    const p = people.find((x) => x.key === `u:${id}`)
    return p ? (p.me ? 'apuntaste tú' : `apuntó ${p.name}`) : null
  }

  // Al apuntar, lo justo: importe y concepto. El resto va resumido en una línea que se despliega.
  const [more, setMore] = useState(!!editing)

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

  const payerName = people.find((p) => p.key === payer)
  const summary = [
    people.length > 1 ? (payerName ? (payerName.me ? 'Pagas tú' : `Paga ${payerName.name}`) : 'Sin decir quién paga') : null,
    people.length > 1 ? (chosen.length === people.length ? 'entre todos' : `entre ${chosen.length}`) : null,
    date ? (date === today() ? 'hoy' : formatDay(date, false)) : 'sin fecha',
  ]
    .filter(Boolean)
    .join(' · ')

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
      // Solo se toca la columna si cambia el ticket. El archivo va antes: el gasto no debe apuntar a algo que no existe.
      if (receipt) {
        body.receipt_path = `${trip.id}/${uid()}.jpg`
        await api.uploadReceipt(trip.id, receipt, body.receipt_path)
      } else if (dropReceipt) body.receipt_path = null
      const result = await (editing ? api.updateExpense(editing.id, body) : api.addExpense(trip.id, body))
      if (oldReceipt && (receipt || dropReceipt)) await api.deleteReceipt(oldReceipt)
      return result
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
        if (splitError) setMore(true)
        if (value && effectiveRate && !splitError) save.mutate()
      }}
    >
      <div className="font-display font-semibold">{editing ? 'Editar gasto' : 'Nuevo gasto'}</div>
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
        onChange={(e) => {
          setDescription(e.target.value)
          if (!touchedCategory) setCategory(guessCategory(e.target.value) ?? 'food')
        }}
      />

      {!more && (
        <button type="button" className="mt-3 flex min-h-11 w-full items-center gap-2.5 rounded-sm bg-card px-3 py-2 text-left text-sm ring-1 ring-outline-soft" aria-expanded={false} onClick={() => setMore(true)}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: EXPENSE_CATEGORIES[category].color }}>
            <Icon name={EXPENSE_CATEGORIES[category].icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{EXPENSE_CATEGORIES[category].label}</span>
            <span className="block text-xs text-ink-soft">{summary}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-accent-deep">Cambiar</span>
        </button>
      )}
      {more && (
        <>
      <div className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0" role="radiogroup" aria-label="Categoría">
        {CATEGORY_ORDER.map((c) => {
          const cat = EXPENSE_CATEGORIES[c]
          const on = c === category
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setCategory(c)
                setTouchedCategory(true)
              }}
              ref={on ? centerInRow : undefined}
              className={`flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-sm px-1 py-2 text-center text-[11px] sm:w-auto leading-tight transition ${on ? 'text-white' : 'bg-card hover:bg-surface-container'}`}
              style={on ? { background: cat.color } : undefined}
            >
              <Icon name={cat.icon} size={20} />
              {cat.label}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {oldReceipt && !dropReceipt && !receipt ? (
          <>
            <ReceiptButton path={oldReceipt} label="Ver el ticket" className="grid h-8 w-8 place-items-center rounded-full bg-card text-accent ring-1 ring-outline-soft" />
            <span className="text-ink-soft">Ticket guardado</span>
          </>
        ) : receipt ? (
          <span className="flex min-w-0 items-center gap-1 text-ink-soft">
            <Icon name="receipt_long" size={18} className="text-accent" /> <span className="truncate">{receipt.name}</span>
          </span>
        ) : null}
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-card px-3 text-xs font-semibold ring-1 ring-outline-soft">
          <Icon name="add_a_photo" size={16} /> {receipt || (oldReceipt && !dropReceipt) ? 'Cambiar ticket' : 'Foto del ticket'}
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file && looksLikeImage(file)) setReceipt(file)
            }}
          />
        </label>
        {(receipt || (oldReceipt && !dropReceipt)) && (
          <button
            type="button"
            className="text-xs font-semibold text-ink-soft underline"
            onClick={() => {
              setReceipt(null)
              setDropReceipt(!!oldReceipt)
            }}
          >
            Quitar
          </button>
        )}
      </div>

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

        </>
      )}
      {duplicate && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-sm bg-accent-soft p-2.5 text-sm text-accent-ink">
          <Icon name="content_copy" size={18} className="mt-0.5 shrink-0" />
          <span>
            Ya hay un gasto de {formatMoney(duplicate.amount, duplicate.currency)} ese día: <b>{duplicate.description || EXPENSE_CATEGORIES[duplicate.category as ExpenseCategory].label}</b>
            {notedBy(duplicate.user_id) ? `, lo ${notedBy(duplicate.user_id)}` : ''}. ¿Seguro que no es el mismo?
          </span>
        </p>
      )}
      {editing && notedBy(editing.user_id) && <p className="mt-3 text-xs text-ink-soft">Lo {notedBy(editing.user_id)}.</p>}
      {editing && history && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer py-1 font-semibold text-ink-soft">Ver cambios</summary>
          {history}
        </details>
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
          <button type="submit" className="btn btn-accent min-h-11" disabled={!value || !effectiveRate || !!splitError || save.isPending}>
            {save.isPending ? 'Guardando…' : editing ? 'Guardar' : 'Añadir'}
          </button>
        </span>
      </div>
    </form>
  )
}
