import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** Bandera SVG (los emojis de bandera no se ven en Windows). */
export function Flag({ code, className = '' }: { code: string; className?: string }) {
  if (!/^[A-Za-z]{2}$/.test(code)) return null
  // Cada bandera es un SVG suelto en /flags (copiados de flag-icons): solo se descarga la que se ve.
  return (
    <img
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      title={code}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-[2px] align-[-0.125em] ${className}`}
      style={{ width: '1.333em', height: '1em', objectFit: 'cover' }}
    />
  )
}

/** Etiqueta técnica con punto de color: ● TELEMETRY PROTOCOL // 01-EXP */
export function Eyebrow({ children, className = '', dot = true }: { children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <div className={`label-code flex items-center gap-2 text-accent-deep ${className}`}>
      {dot && <span className="h-2 w-2 rounded-full bg-accent" />}
      {children}
    </div>
  )
}

export function SectionHead({ eyebrow, title, action }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="label-stamp mb-1.5 text-accent-deep">{eyebrow}</div>}
        <h2 className="headline-lg">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/** Recuadro de dato: TERRITORIO 18.4% */
export function StatTile({
  label,
  value,
  unit,
  hint,
  icon,
  dark,
  className = '',
}: {
  label: string
  value: ReactNode
  unit?: ReactNode
  hint?: ReactNode
  icon?: string
  dark?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-sm p-4 ${dark ? 'bg-ink text-white' : 'bg-surface-low'} ${className}`}>
      <div className={`label-stamp flex items-center justify-between gap-2 ${dark ? 'text-white/70' : 'text-ink-soft'}`}>
        {label}
        {icon && <Icon name={icon} size={18} className={dark ? 'text-white/80' : 'text-accent'} />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-[32px] font-semibold leading-none tracking-tight">{value}</span>
        {unit && <span className={`text-sm ${dark ? 'text-white/70' : 'text-ink-soft'}`}>{unit}</span>}
      </div>
      {hint && <div className={`label-stamp mt-2 ${dark ? 'text-white/60' : 'text-ink-soft'}`}>{hint}</div>}
    </div>
  )
}

export function Empty({ icon = 'explore', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <Icon name={icon} size={32} className="text-accent" />
      <div className="headline-sm mt-3">{title}</div>
      {children && <div className="mt-2 max-w-md text-ink-soft">{children}</div>}
    </div>
  )
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="label-code flex items-center justify-center gap-2 py-16 text-ink-soft">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      {label}…
    </div>
  )
}

export function Stars({ value }: { value: number | null }) {
  if (!value) return null
  return (
    <span className="label-code inline-flex items-center gap-1 rounded-xs bg-card px-1.5 py-0.5 text-ink">
      <Icon name="star" filled size={13} className="text-accent" /> {value.toFixed(1)}
    </span>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {error instanceof Error ? error.message : String(error)}
    </div>
  )
}

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
export const monthShort = (i: number) => MONTHS[i]

export function formatDate(d?: string | null, style: 'short' | 'long' | 'month' = 'short') {
  if (!d) return ''
  const date = new Date(`${d.slice(0, 10)}T00:00:00`)
  if (style === 'month') return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  return date.toLocaleDateString('es-ES', style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatRange(a?: string | null, b?: string | null) {
  if (!a) return 'Sin fechas'
  const da = new Date(`${a}T00:00:00`)
  if (!b || a === b) return formatDate(a)
  const db = new Date(`${b}T00:00:00`)
  const sameYear = da.getFullYear() === db.getFullYear()
  const left = da.toLocaleDateString('es-ES', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${left} – ${formatDate(b)}`
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`

/** Coordenadas con el estilo del diseño: 35.0116° N, 135.7681° E */
export function coords(lat: number, lon: number, digits = 4) {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? 'E' : 'W'}`
}
