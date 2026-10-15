import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Eyebrow, Flag, Spinner, plural } from '../components/ui'
import { WorldMap } from '../components/WorldMap'
import { api } from '../lib/api'
import { UN_COUNTRY_COUNT } from '../lib/countries'
import { matchCountries } from '../lib/exonyms'
import { CONTINENT_NAMES, INHABITED_CONTINENTS } from '../lib/db'
import { useInvalidateTravel, useTravelData } from '../lib/hooks'

export function CountriesPage() {
  const { loading, visited, stats, countries, airports } = useTravelData()
  const invalidate = useInvalidateTravel()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [markMode, setMarkMode] = useState(false)

  const source = useMemo(() => new Map(visited?.countries.map((c) => [c.code, c.source]) ?? []), [visited])
  const subsByCountry = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stats.subdivisions) m.set(s.slice(0, 2), (m.get(s.slice(0, 2)) ?? 0) + 1)
    return m
  }, [stats.subdivisions])

  if (loading || countries.isLoading) return <Spinner label="Cargando territorios" />

  const toggle = async (code: string) => {
    if (source.get(code) === 'trip') return navigate(`/app/paises/${code}`)
    await api.setCountryMarked(code, !source.has(code))
    invalidate()
  }

  // Nombres en español, inglés y alias (Holanda, Chequia, EE. UU.…), sin tildes.
  const matches = q ? matchCountries(q, 10).flatMap((m) => countries.byCode.get(m.code) ?? []) : []

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Registro territorial // ISO 3166</Eyebrow>
          <h1 className="display-hero mt-3">
            {stats.countries.length} <span className="text-outline">/ {UN_COUNTRY_COUNT} países</span>
          </h1>
          <p className="mt-3 text-lg text-ink-soft">
            {stats.subdivisions.length} regiones y provincias · {stats.continents.length} de 6 continentes
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <div className="flex items-center gap-2 rounded-sm bg-card px-3 shadow-[var(--shadow-card)]">
              <Icon name="search" size={20} className="text-outline" />
              <input className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Buscar país…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {matches.length > 0 && (
              <ul className="card absolute z-30 mt-1 w-full p-1">
                {matches.map((c) => (
                  <li key={c.code}>
                    <Link to={`/app/paises/${c.code}`} className="flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm hover:bg-surface-low">
                      <span className="flex items-center gap-2">
                        <Flag code={c.code} /> {c.name}
                      </span>
                      {source.has(c.code) && <Icon name="check" size={16} className="text-accent" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className={`btn ${markMode ? 'btn-accent' : 'btn-ghost'}`} onClick={() => setMarkMode(!markMode)}>
            <Icon name="ads_click" size={18} /> {markMode ? 'Marcando: toca países' : 'Marcar en el mapa'}
          </button>
        </div>
      </div>

      <WorldMap
        className="mt-6 h-[58vh] min-h-96"
        trips={[]}
        airports={airports}
        countries={stats.countries}
        onCountryClick={(code) => (markMode ? toggle(code) : navigate(`/app/paises/${code}`))}
        legend={false}
      />
      <p className="label-code mt-2 text-ink-soft">
        {markMode ? 'Toca un país para marcarlo o desmarcarlo como visitado.' : 'Toca un país para ver y marcar sus regiones y provincias.'}
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {INHABITED_CONTINENTS.map((cont) => {
          const list = stats.countries
            .map((c) => countries.byCode.get(c))
            .filter((c) => c?.continent === cont)
            .sort((a, b) => a!.name.localeCompare(b!.name, 'es'))
          const total = countries.list.filter((c) => c.continent === cont).length
          return (
            <section key={cont}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="headline-md uppercase">{CONTINENT_NAMES[cont]}</h2>
                <span className="label-code text-ink-soft">
                  {list.length} / {total}
                </span>
              </div>
              <div className="mb-3 h-1 rounded-full bg-surface-container">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(list.length / Math.max(1, total)) * 100}%` }} />
              </div>
              {list.length ? (
                <ul className="card divide-y divide-surface-highest">
                  {list.map((c) => (
                    <li key={c!.code}>
                      <Link to={`/app/paises/${c!.code}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-low">
                        <Flag code={c!.code} />
                        <span className="flex-1">{c!.name}</span>
                        {subsByCountry.get(c!.code) ? <span className="label-stamp text-ink-soft">{plural(subsByCountry.get(c!.code)!, 'región', 'regiones')}</span> : null}
                        <span className={`label-stamp px-1.5 py-0.5 ${source.get(c!.code) === 'trip' ? 'bg-ink text-white' : 'bg-surface-container'}`}>
                          {source.get(c!.code) === 'trip' ? 'Viaje' : 'Manual'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">Ningún país todavía.</p>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
