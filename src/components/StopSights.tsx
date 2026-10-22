import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { NewSight } from '../lib/api/types'
import type { Sight, Stop } from '../lib/db'
import { searchSights, suggestSights, type SightSuggestion } from '../lib/sights'

const fromSuggestion = (s: SightSuggestion, done: boolean): NewSight => ({ name: s.title, lat: s.lat, lon: s.lon, wiki_url: s.url ?? null, done })

/**
 * Sitios de una parada. En un viaje hecho: «Sitios que visitaste». En un plan: «¿Qué vamos a ver?», con
 * casillas para ir marcando lo visto. Sugerencias y búsqueda desde Wikipedia, o texto libre.
 */
export function StopSights({
  stop,
  sights,
  planned,
  onAdd,
  onToggle,
  onRemove,
  readOnly = false,
}: {
  stop: Stop
  sights: Sight[]
  planned: boolean
  onAdd: (s: NewSight) => void
  onToggle: (s: Sight) => void
  onRemove: (s: Sight) => void
  readOnly?: boolean
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SightSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggest, setSuggest] = useState<SightSuggestion[] | null>(null)
  const [suggestError, setSuggestError] = useState(false)
  const have = new Set(sights.map((s) => s.name.toLowerCase()))

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setSearching(true)
      searchSights(q, stop.lat, stop.lon, ctrl.signal)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, stop.lat, stop.lon])

  useEffect(() => {
    if (!showSuggest || suggest) return
    setSuggestError(false)
    suggestSights(stop.lat, stop.lon, stop.name)
      .then(setSuggest)
      .catch(() => setSuggestError(true))
  }, [showSuggest, suggest, stop.lat, stop.lon, stop.name])

  const add = (s: NewSight) => {
    if (have.has(s.name.toLowerCase())) return
    onAdd({ ...s, position: sights.length })
    setQ('')
    setResults([])
  }
  const doneCount = sights.filter((s) => s.done).length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display font-semibold">
          <Icon name={planned ? 'checklist' : 'museum'} size={18} className="text-accent" />
          {planned ? '¿Qué vamos a ver?' : 'Sitios que visitaste'}
        </span>
        {sights.length > 0 && <span className="label-stamp text-ink-soft">{planned ? `${doneCount} / ${sights.length} vistos` : `${sights.length} sitios`}</span>}
      </div>

      {sights.length > 0 && (
        <ul className="mb-3 space-y-1">
          {sights.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-sm bg-card px-2 py-1.5 text-sm">
              {planned ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={s.done}
                  disabled={readOnly}
                  onClick={() => onToggle(s)}
                  aria-label={s.done ? `Desmarcar ${s.name}` : `Marcar ${s.name} como visto`}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition ${s.done ? 'border-accent bg-accent text-white' : 'border-outline hover:border-ink'}`}
                >
                  {s.done && <Icon name="check" size={16} />}
                </button>
              ) : (
                <Icon name="location_on" size={18} className="shrink-0 text-accent" />
              )}
              <span className={`min-w-0 flex-1 truncate ${planned && s.done ? 'text-ink-soft line-through' : ''}`}>{s.name}</span>
              {s.wiki_url && (
                <a href={s.wiki_url} target="_blank" rel="noreferrer" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-container hover:text-ink" title="Ver en Wikipedia" aria-label={`${s.name} en Wikipedia`}>
                  <Icon name="open_in_new" size={16} />
                </a>
              )}
              {!readOnly && (
                <button type="button" onClick={() => onRemove(s)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-red-50 hover:text-red-700" aria-label={`Quitar ${s.name}`}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <>
          <div className="relative">
            <div className="flex items-center gap-2 rounded-sm bg-card px-3 ring-1 ring-outline-soft focus-within:ring-2 focus-within:ring-ink">
              <Icon name="add" size={18} className="text-accent" />
              <input
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                value={q}
                placeholder={planned ? `Añadir algo que ver en ${stop.name}…` : `Monumento, museo, plaza en ${stop.name}…`}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || !q.trim()) return
                  e.preventDefault()
                  // Enter: el primer resultado si coincide; si no, el texto tal cual («Cena en el Trastevere»).
                  const first = results[0]
                  add(first && first.title.toLowerCase().startsWith(q.trim().toLowerCase()) ? fromSuggestion(first, !planned) : { name: q.trim().slice(0, 160), done: !planned })
                }}
              />
              {searching && <Icon name="sync" size={16} className="animate-spin text-ink-soft" />}
            </div>
            {q.trim().length >= 2 && (results.length > 0 || !searching) && (
              <ul className="card absolute z-40 mt-1 max-h-72 w-full overflow-auto p-1">
                {results.map((r) => (
                  <li key={r.title}>
                    <button type="button" onClick={() => add(fromSuggestion(r, !planned))} className="flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-low">
                      <Icon name="location_on" size={16} className="mt-0.5 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{r.title}</span>
                        {r.description && <span className="block truncate text-xs text-ink-soft">{r.description}</span>}
                      </span>
                      <span className="label-stamp shrink-0 text-ink-soft">{r.km < 1 ? '<1 km' : `${Math.round(r.km).toLocaleString('es-ES')} km`}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={() => add({ name: q.trim().slice(0, 160), done: !planned })} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-low">
                    <Icon name="edit" size={16} /> Añadir «{q.trim()}» tal cual
                  </button>
                </li>
              </ul>
            )}
          </div>

          <div className="mt-2">
            {!showSuggest ? (
              <button type="button" onClick={() => setShowSuggest(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep hover:underline">
                <Icon name="auto_awesome" size={16} /> Ideas de sitios en {stop.name}
              </button>
            ) : suggestError ? (
              <p className="text-sm text-ink-soft">
                No se pudieron cargar las ideas.{' '}
                <button type="button" className="font-semibold underline" onClick={() => setSuggest(null)}>
                  Reintentar
                </button>
              </p>
            ) : !suggest ? (
              <p className="flex items-center gap-2 text-sm text-ink-soft">
                <Icon name="sync" size={16} className="animate-spin" /> Buscando sitios conocidos…
              </p>
            ) : (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {suggest
                    .filter((s) => !have.has(s.title.toLowerCase()))
                    .map((s) => (
                      <button
                        key={s.title}
                        type="button"
                        onClick={() => add(fromSuggestion(s, !planned))}
                        title={s.description}
                        className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-outline-soft transition hover:ring-ink"
                      >
                        <Icon name="add" size={14} className="text-accent" /> {s.title}
                      </button>
                    ))}
                  {suggest.length === 0 && <span className="text-sm text-ink-soft">No hay sitios conocidos cerca en Wikipedia. Escríbelos arriba.</span>}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  Ideas de{' '}
                  <a href="https://es.wikipedia.org" target="_blank" rel="noreferrer" className="underline">
                    Wikipedia
                  </a>{' '}
                  a menos de 10 km.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
