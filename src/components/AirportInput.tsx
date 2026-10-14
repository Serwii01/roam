import { useEffect, useState } from 'react'
import { preloadAirports, searchAirportsLocal } from '../lib/airportIndex'
import type { Airport } from '../lib/db'
import { Flag } from './ui'

/** Selector de aeropuerto con búsqueda instantánea en memoria (IATA, ciudad o nombre) y teclado. */
export function AirportInput({
  value,
  airport,
  onChange,
  placeholder,
}: {
  value: string | null
  airport?: Airport
  onChange: (iata: string | null) => void
  placeholder: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Airport[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    preloadAirports().catch(() => {})
  }, [])

  useEffect(() => {
    if (!open || !q.trim()) {
      setResults([])
      return
    }
    let alive = true
    searchAirportsLocal(q).then((r) => {
      if (!alive) return
      setResults(r)
      setActive(0)
    })
    return () => {
      alive = false
    }
  }, [q, open])

  const pick = (a: Airport) => {
    onChange(a.iata)
    setOpen(false)
  }
  const shown = airport ? `${airport.iata} · ${airport.city ?? airport.name}` : (value ?? '')

  return (
    <div className="relative min-w-0 flex-1">
      <input
        className="w-full rounded-sm bg-card px-2.5 py-1.5 font-display text-xs font-semibold tracking-wide outline-none ring-1 ring-outline-soft focus:ring-ink"
        value={open ? q : shown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && results.length > 0}
        onFocus={() => {
          setOpen(true)
          setQ('')
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (!results.length) return
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(i + 1, results.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)))
          else if (e.key === 'Enter') (e.preventDefault(), pick(results[active]), (e.target as HTMLInputElement).blur())
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && results.length > 0 && (
        <ul className="card absolute z-30 mt-1 max-h-64 w-72 overflow-auto p-1" role="listbox">
          {results.map((a, i) => (
            <li key={a.iata} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs ${i === active ? 'bg-surface-container' : 'hover:bg-surface-low'}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={() => pick(a)}
              >
                <Flag code={a.country_code} className="mt-0.5" />
                <span>
                  <b className="font-display">{a.iata}</b> · {a.name}
                  {a.city && <span className="text-ink-soft"> · {a.city}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
