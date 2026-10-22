import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

// Fechas como texto 'AAAA-MM-DD' (igual que en la base de datos), sin zonas horarias de por medio.
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m: m - 1, d }
}
const todayStr = () => {
  const t = new Date()
  return ymd(t.getFullYear(), t.getMonth(), t.getDate())
}
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** «12 oct 2024» */
export function formatDay(s: string | null | undefined, withYear = true) {
  if (!s) return ''
  const { y, m, d } = parse(s)
  return `${d} ${MONTHS[m].slice(0, 3)}${withYear ? ` ${y}` : ''}`
}

/** Días entre dos fechas, contando ambas (12 → 14 = 3 días). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1
}

function useIsMobile() {
  const [m, setM] = useState(() => matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    const q = matchMedia('(max-width: 639px)')
    const on = () => setM(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return m
}

// ───────────────────────────── Calendario ─────────────────────────────

interface CalendarProps {
  /** Mes visible (el primero si hay dos). */
  view: { y: number; m: number }
  onView: (v: { y: number; m: number }) => void
  months: 1 | 2
  start: string | null
  end: string | null
  /** Rango de referencia (las fechas del viaje, al elegir el día de una parada). */
  highlight?: [string | null, string | null]
  hover?: string | null
  onHover?: (d: string | null) => void
  min?: string | null
  max?: string | null
  onPick: (d: string) => void
}

function Calendar({ view, onView, months, start, end, highlight, hover, onHover, min, max, onPick }: CalendarProps) {
  const [years, setYears] = useState(false)
  const today = todayStr()
  const shift = (n: number) => {
    const d = new Date(view.y, view.m + n, 1)
    onView({ y: d.getFullYear(), m: d.getMonth() })
  }
  // Mientras se elige la vuelta, el rango se previsualiza hasta el día bajo el ratón.
  const rangeEnd = end ?? (start && hover && hover > start ? hover : null)

  if (years) {
    const base = view.y - (view.y % 12)
    return (
      <div className="p-1">
        <div className="mb-3 flex items-center justify-between">
          <NavButton icon="chevron_left" label="Años anteriores" onClick={() => onView({ ...view, y: view.y - 12 })} />
          <span className="font-display font-semibold">
            {base} – {base + 11}
          </span>
          <NavButton icon="chevron_right" label="Años siguientes" onClick={() => onView({ ...view, y: view.y + 12 })} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => base + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                onView({ y, m: view.m })
                setYears(false)
              }}
              className={`rounded-sm py-3 font-display font-semibold transition ${y === view.y ? 'bg-ink text-paper' : 'hover:bg-surface-container'} ${y === Number(today.slice(0, 4)) && y !== view.y ? 'text-accent-deep' : ''}`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`grid gap-6 ${months === 2 ? 'sm:grid-cols-2' : ''}`}>
      {Array.from({ length: months }, (_, k) => {
        const first = new Date(view.y, view.m + k, 1)
        const y = first.getFullYear()
        const m = first.getMonth()
        const lead = (first.getDay() + 6) % 7 // lunes = 0
        const count = new Date(y, m + 1, 0).getDate()
        return (
          <div key={k} className="min-w-0">
            <div className="mb-2 flex h-10 items-center justify-between">
              {k === 0 ? <NavButton icon="chevron_left" label="Mes anterior" onClick={() => shift(-1)} /> : <span className="w-10" />}
              <button type="button" onClick={() => setYears(true)} className="rounded-sm px-2 py-1 font-display font-semibold capitalize hover:bg-surface-container" title="Elegir año">
                {MONTHS[m]} {y}
              </button>
              {k === months - 1 ? <NavButton icon="chevron_right" label="Mes siguiente" onClick={() => shift(1)} /> : <span className="w-10" />}
            </div>
            <div className="grid grid-cols-7 text-center">
              {WEEK.map((w) => (
                <span key={w} className="label-stamp py-1.5 text-ink-soft">
                  {w}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`e${i}`} />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const day = ymd(y, m, i + 1)
                const disabled = (!!min && day < min) || (!!max && day > max)
                const isStart = day === start
                const isEnd = day === (end ?? rangeEnd)
                const inRange = !!start && !!rangeEnd && day > start && day < rangeEnd
                const inHighlight = !!highlight?.[0] && !!highlight[1] && day >= highlight[0] && day <= highlight[1]
                const edge = isStart || isEnd
                return (
                  <div
                    key={day}
                    className={`relative h-10 ${inRange || (isStart && rangeEnd && rangeEnd !== start) || (isEnd && start && start !== rangeEnd) ? 'bg-accent-soft/70' : ''} ${isStart && rangeEnd && rangeEnd !== start ? 'rounded-l-full' : ''} ${isEnd && start && start !== rangeEnd ? 'rounded-r-full' : ''}`}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(day)}
                      onMouseEnter={() => onHover?.(day)}
                      aria-label={`${i + 1} de ${MONTHS[m]} de ${y}`}
                      aria-pressed={edge}
                      className={`absolute inset-0 m-auto grid h-10 w-10 place-items-center rounded-full text-sm transition ${
                        edge
                          ? 'bg-accent font-semibold text-white shadow-[var(--shadow-accent)]'
                          : disabled
                            ? 'cursor-default text-outline-soft'
                            : inHighlight
                              ? 'bg-surface-container font-semibold hover:bg-surface-high'
                              : 'hover:bg-surface-container'
                      } ${day === today && !edge ? 'ring-1 ring-ink' : ''}`}
                    >
                      {i + 1}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NavButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-container">
      <Icon name={icon} />
    </button>
  )
}

// ───────────────────────────── Ventana flotante / hoja inferior ─────────────────────────────

function Popover({ anchor, open, onClose, title, children, width }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; title: string; children: ReactNode; width: number }) {
  const mobile = useIsMobile()
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || mobile) return
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const h = box.current?.offsetHeight ?? 380
      const below = r.bottom + 8 + h <= innerHeight || r.top < h + 16
      setPos({ top: below ? r.bottom + 8 : r.top - h - 8, left: Math.max(16, Math.min(r.left, innerWidth - width - 16)) })
    }
    place()
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => {
      removeEventListener('resize', place)
      removeEventListener('scroll', place, true)
    }
  }, [open, mobile, anchor, width])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose()
    }
    addEventListener('keydown', onKey)
    addEventListener('pointerdown', onDown)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('pointerdown', onDown)
    }
  }, [open, onClose, anchor])

  useEffect(() => {
    if (!open || !mobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, mobile])

  if (!open) return null
  return createPortal(
    mobile ? (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
        <div ref={box} className="max-h-[92vh] w-full overflow-y-auto rounded-t-md bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-soft" />
          <div className="mb-3 flex items-center justify-between">
            <span className="headline-sm">{title}</span>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-container" aria-label="Cerrar">
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      </div>
    ) : (
      <div
        ref={box}
        role="dialog"
        aria-label={title}
        className="fixed z-[70] rounded-md bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width }}
      >
        {children}
      </div>
    ),
    document.body,
  )
}

const initialView = (s: string | null | undefined) => {
  const base = s ? parse(s) : parse(todayStr())
  return { y: base.y, m: base.m }
}

// ───────────────────────────── Ida y vuelta ─────────────────────────────

/** Fechas de un viaje: un clic para la ida y otro para la vuelta, con el rango marcado. */
export function DateRangeField({
  start,
  end,
  onChange,
}: {
  start: string | null
  end: string | null
  onChange: (start: string | null, end: string | null) => void
}) {
  const mobile = useIsMobile()
  const anchor = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => initialView(start))
  const [hover, setHover] = useState<string | null>(null)
  // Mientras está abierto se trabaja sobre una copia; al elegir la vuelta se guarda.
  const [a, setA] = useState(start)
  const [b, setB] = useState(end)

  // Pulsar «Ida» empieza de cero; pulsar «Vuelta» conserva la ida y pide solo la vuelta.
  const openPicker = (phase: 'start' | 'end') => {
    setA(phase === 'end' ? start : null)
    setB(null)
    setView(initialView(phase === 'end' ? (end ?? start) : start))
    setOpen(true)
  }

  const pick = (d: string) => {
    if (!a || (a && b)) {
      setA(d)
      setB(null)
      return
    }
    if (d < a) {
      setA(d)
      return
    }
    setB(d)
    onChange(a, d)
    setTimeout(() => setOpen(false), 180)
  }

  const days = start && end ? daysBetween(start, end) : null
  const hint = !a ? 'Elige el día de ida' : !b ? 'Ahora el día de vuelta' : `${daysBetween(a, b)} días`

  return (
    <div ref={anchor}>
      <div className="grid grid-cols-2 overflow-hidden rounded-sm ring-1 ring-outline-soft">
        {(
          [
            ['start', 'Ida', start],
            ['end', 'Vuelta', end],
          ] as const
        ).map(([phase, label, value], i) => (
          <button
            key={phase}
            type="button"
            onClick={() => openPicker(phase)}
            className={`flex items-center gap-3 bg-surface-low px-4 py-3 text-left transition hover:bg-surface-container ${i ? 'border-l border-outline-soft' : ''}`}
          >
            <Icon name={i ? 'event_available' : 'calendar_today'} size={20} className="text-accent" />
            <span className="min-w-0">
              <span className="label-stamp block text-ink-soft">{label}</span>
              <span className={`block truncate font-display font-semibold ${value ? '' : 'text-ink-soft'}`}>{value ? formatDay(value) : 'Sin fecha'}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-sm text-ink-soft">
        <span>{days ? `${days} ${days === 1 ? 'día' : 'días'}` : 'Las fechas son opcionales'}</span>
        {(start || end) && (
          <button type="button" className="hover:text-ink" onClick={() => onChange(null, null)}>
            Quitar fechas
          </button>
        )}
      </div>

      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} title="Fechas del viaje" width={640}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="label-code text-accent-deep">{hint}</span>
          <button type="button" className="text-sm text-ink-soft hover:text-ink" onClick={() => setView(initialView(todayStr()))}>
            Hoy
          </button>
        </div>
        <div onMouseLeave={() => setHover(null)}>
          <Calendar view={view} onView={setView} months={mobile ? 1 : 2} start={a} end={b} hover={hover} onHover={setHover} onPick={pick} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-surface-highest pt-3">
          <span className="text-sm">
            {a ? formatDay(a) : '—'} → {b ? formatDay(b) : '…'}
          </span>
          <span className="flex gap-2">
            {a && !b && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onChange(a, a)
                  setOpen(false)
                }}
              >
                Solo ese día
              </button>
            )}
            <button type="button" className="btn btn-dark" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </span>
        </div>
      </Popover>
    </div>
  )

}

// ───────────────────────────── Un día (paradas) ─────────────────────────────

/** Día de llegada a una parada: un botón compacto que abre el calendario con las fechas del viaje marcadas. */
export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder = 'Añadir fecha',
  label = 'Fecha de llegada',
  variant = 'chip',
}: {
  value: string | null
  onChange: (d: string | null) => void
  min?: string | null
  max?: string | null
  placeholder?: string
  label?: string
  /** 'chip': pastilla pequeña; 'field': campo de formulario a todo el ancho, con su etiqueta. */
  variant?: 'chip' | 'field'
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => initialView(value ?? min))
  const inTrip = !!min && !!max

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => {
          setView(initialView(value ?? min))
          setOpen(true)
        }}
        aria-label={variant === 'field' ? `${label}: ${value ? formatDay(value) : 'sin fecha'}` : undefined}
        className={
          variant === 'field'
            ? 'field flex w-full items-center gap-2 py-2! text-left'
            : `inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${value ? 'bg-card text-ink ring-1 ring-outline-soft hover:ring-ink' : 'border border-dashed border-outline text-ink-soft hover:border-ink hover:text-ink'}`
        }
      >
        <Icon name="calendar_today" size={variant === 'field' ? 18 : 14} className={value ? 'text-accent' : 'text-ink-soft'} />
        {variant === 'field' ? (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="label-stamp block text-ink-soft">{label}</span>
            <span className={value ? 'font-semibold' : 'text-ink-soft'}>{value ? formatDay(value) : placeholder}</span>
          </span>
        ) : value ? (
          formatDay(value)
        ) : (
          placeholder
        )}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} title={label} width={340}>
        {inTrip && <p className="mb-2 text-sm text-ink-soft">En gris, los días del viaje.</p>}
        <Calendar
          view={view}
          onView={setView}
          months={1}
          start={value}
          end={value}
          highlight={[min ?? null, max ?? null]}
          onPick={(d) => {
            onChange(d)
            setOpen(false)
          }}
        />
        {value && (
          <button
            type="button"
            className="mt-3 w-full rounded-sm py-2 text-sm text-ink-soft hover:bg-surface-container hover:text-ink"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            Quitar fecha
          </button>
        )}
      </Popover>
    </>
  )
}

const TIME_PRESETS = [
  { label: 'Mañana', icon: 'wb_twilight', t: '09:00' },
  { label: 'Mediodía', icon: 'light_mode', t: '13:00' },
  { label: 'Tarde', icon: 'wb_sunny', t: '17:00' },
  { label: 'Noche', icon: 'dark_mode', t: '21:00' },
]

/** Hora 'HH:MM' con el diseño de la web: atajos (mañana, tarde…), hora y minutos. */
export function TimeField({ value, onChange, label = 'Hora' }: { value: string | null; onChange: (t: string | null) => void; label?: string }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = value ? value.slice(0, 5) : null
  const [hour, setHour] = useState<number | null>(current ? Number(current.slice(0, 2)) : null)
  const pick = (t: string | null) => {
    onChange(t)
    setOpen(false)
  }
  const cell = (on: boolean) =>
    `h-9 rounded-sm text-sm tabular-nums transition ${on ? 'bg-accent font-semibold text-white' : 'bg-surface-low hover:bg-surface-container'}`

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        onClick={() => {
          setHour(current ? Number(current.slice(0, 2)) : null)
          setOpen(true)
        }}
        className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums transition ${current ? 'bg-card text-ink ring-1 ring-outline-soft hover:ring-ink' : 'border border-dashed border-outline text-ink-soft hover:border-ink hover:text-ink'}`}
      >
        <Icon name="schedule" size={14} className={current ? 'text-accent' : ''} />
        {current ?? 'Hora'}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} title={label} width={300}>
        <div className="grid grid-cols-4 gap-1.5">
          {TIME_PRESETS.map((p) => (
            <button key={p.t} type="button" onClick={() => pick(p.t)} className={`flex flex-col items-center gap-0.5 rounded-sm py-2 text-[11px] transition ${current === p.t ? 'bg-accent text-white' : 'bg-surface-low hover:bg-surface-container'}`}>
              <Icon name={p.icon} size={18} />
              {p.label}
            </button>
          ))}
        </div>
        <div className="label-stamp mt-3 mb-1.5 text-ink-soft">Hora</div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 24 }, (_, h) => (
            <button key={h} type="button" aria-label={`${pad(h)} h`} aria-pressed={hour === h} onClick={() => setHour(h)} className={cell(hour === h)}>
              {pad(h)}
            </button>
          ))}
        </div>
        <div className="label-stamp mt-3 mb-1.5 text-ink-soft">Minutos</div>
        <div className="grid grid-cols-4 gap-1">
          {[0, 15, 30, 45].map((m) => {
            const t = hour === null ? null : `${pad(hour)}:${pad(m)}`
            return (
              <button key={m} type="button" disabled={hour === null} onClick={() => t && pick(t)} className={`${cell(!!t && current === t)} disabled:opacity-40`}>
                :{pad(m)}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex justify-between gap-2">
          <button type="button" className="btn btn-ghost px-3!" onClick={() => pick(null)} disabled={!current}>
            Sin hora
          </button>
          <button type="button" className="btn btn-dark px-3!" disabled={hour === null} onClick={() => hour !== null && pick(`${pad(hour)}:${current && Number(current.slice(0, 2)) === hour ? current.slice(3) : '00'}`)}>
            Listo
          </button>
        </div>
      </Popover>
    </>
  )
}
