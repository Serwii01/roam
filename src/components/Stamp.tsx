import { alpha3 } from '../lib/countries'
import { formatDate } from './ui'

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

const HEADERS = ['Immigration inspection', 'Entry permit', 'Border control', 'Control fronterizo', 'Arrival', 'Admitted']

/** Sello de inmigración generado: forma, giro y color deterministas según la clave. */
export function Stamp({
  stampKey,
  countryCode,
  countryName,
  place,
  date,
  airport,
  size = 'md',
}: {
  stampKey: string
  countryCode: string
  countryName: string
  place: string
  date: string | null
  airport?: string | null
  size?: 'sm' | 'md'
}) {
  const h = hash(stampKey)
  const rotate = ((h % 13) - 6) * 1.1
  const red = h % 3 !== 0
  const round = h % 4 === 0
  const color = red ? 'text-accent-deep border-accent-deep' : 'text-ink border-ink'
  const dateText = date ? formatDate(date).toUpperCase().replace(/\./g, '') : '—'
  const pad = size === 'sm' ? 'px-3 py-2.5' : 'px-5 py-4'

  return (
    <div
      className={`inline-flex flex-col items-center gap-1 border-2 bg-card text-center ${color} ${round ? 'rounded-[28px]' : 'rounded-md'} ${pad}`}
      style={{ transform: `rotate(${rotate}deg)`, boxShadow: 'inset 0 0 0 3px #fff, inset 0 0 0 4px currentColor' }}
    >
      <span className="label-stamp text-[8px] opacity-80">{HEADERS[h % HEADERS.length]}</span>
      <span className={`font-display font-bold uppercase leading-none tracking-tight ${size === 'sm' ? 'text-base' : 'text-xl'}`}>
        {airport ?? place}
      </span>
      <span className="font-display text-xs font-bold tracking-wider">{dateText}</span>
      <span className="label-stamp text-[8px] opacity-70">
        {countryName} · {alpha3(countryCode)}
      </span>
      {size === 'md' && <span className="label-stamp text-[7px] opacity-50">ID: {alpha3(countryCode)}-{(h % 99999).toString().padStart(5, '0')}</span>}
    </div>
  )
}
