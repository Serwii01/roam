import { useEffect, useState } from 'react'
import { searchPlaces, type Place } from '../lib/geocode'
import { Icon } from './Icon'
import { Flag } from './ui'

export function PlaceSearch({
  onPick,
  placeholder = 'Ciudad, lugar o monumento…',
  autoFocus,
}: {
  onPick: (p: Place) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      setError(false)
      searchPlaces(q, ctrl.signal)
        .then(setResults)
        .catch((e) => e.name !== 'AbortError' && setError(true))
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-sm bg-surface-low px-3">
        <Icon name="add_location_alt" size={20} className="text-accent" />
        <input
          className="w-full bg-transparent py-2.5 text-sm outline-none"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
        {loading && <span className="label-stamp text-ink-soft">Buscando…</span>}
      </div>
      {(results.length > 0 || error) && (
        <ul className="card absolute z-30 mt-1 max-h-72 w-full overflow-auto p-1">
          {error && <li className="px-3 py-2 text-sm text-red-700">No se pudo buscar. Revisa tu conexión.</li>}
          {results.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-low"
                onClick={() => {
                  onPick(p)
                  setQ('')
                  setResults([])
                }}
              >
                <Flag code={p.countryCode} className="mt-1" />
                <span>{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
