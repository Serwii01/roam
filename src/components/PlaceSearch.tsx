import { useEffect, useRef, useState } from 'react'
import { mergePlaces, REMOTE_PROVIDER, searchLocal, searchRemote, type Place } from '../lib/geocode'
import { preloadPlaces } from '../lib/placesIndex'
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
  const wrap = useRef<HTMLDivElement>(null)
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // El catálogo de ciudades en español se descarga en cuanto aparece el buscador.
  useEffect(() => {
    preloadPlaces().catch(() => {})
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      setError(false)
      return
    }
    let alive = true
    const ctrl = new AbortController()
    let local: Place[] = []
    // Fase 1: países y ciudades del catálogo, al instante (sin red).
    searchLocal(q).then((r) => {
      if (!alive) return
      local = r
      setResults(r)
    })
    // Fase 2: Photon, con un pequeño retardo para no lanzar una petición por cada tecla.
    const t = setTimeout(() => {
      setLoading(true)
      setError(false)
      searchRemote(q, ctrl.signal)
        .then((remote) => alive && setResults(mergePlaces(local, remote, q)))
        // Si Photon falla pero ya hay resultados propios, no hace falta molestar con el error.
        .catch((e) => alive && e.name !== 'AbortError' && !local.length && setError(true))
        .finally(() => alive && setLoading(false))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, attempt])

  return (
    <div className="relative scroll-mt-28" ref={wrap}>
      <div className="flex items-center gap-2 rounded-sm bg-card px-3 ring-1 ring-outline-soft transition focus-within:ring-2 focus-within:ring-ink">
        <Icon name="add_location_alt" size={20} className="text-accent" />
        <input
          className="w-full bg-transparent py-3 text-base outline-none"
          value={q}
          // En el móvil no se abre el teclado solo al entrar en la página.
          autoFocus={autoFocus && !matchMedia('(pointer: coarse)').matches}
          onFocus={() => {
            // Si el buscador está en la mitad baja de la pantalla, se sube para que quepan los resultados.
            const r = wrap.current?.getBoundingClientRect()
            if (r && r.top > innerHeight * 0.45) wrap.current!.scrollIntoView({ block: 'start', behavior: 'smooth' })
          }}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
        {loading && <span className="label-stamp text-ink-soft">Buscando…</span>}
      </div>
      {(results.length > 0 || error) && (
        <ul className="card absolute z-40 mt-1 max-h-72 w-full overflow-auto p-1">
          {error && (
            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-red-700">
              El buscador de lugares no responde.
              <button type="button" className="font-semibold underline" onClick={() => setAttempt((n) => n + 1)}>
                Reintentar
              </button>
            </li>
          )}
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
                <span className="min-w-0 flex-1">{p.label}</span>
                {p.kind !== 'place' && (
                  <span className="label-stamp mt-0.5 shrink-0 text-ink-soft">{p.kind === 'country' ? 'País' : p.kind === 'city' ? 'Ciudad' : 'Región'}</span>
                )}
              </button>
            </li>
          ))}
          {REMOTE_PROVIDER === 'geoapify' && (
            <li className="px-3 pb-1 pt-2 text-right text-[10px] text-ink-soft">
              <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">
                Powered by Geoapify
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
