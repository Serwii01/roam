import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { RegionMap } from '../components/RegionMap'
import { Eyebrow, Flag, Spinner, formatDate, plural } from '../components/ui'
import { api } from '../lib/api'
import { CONTINENT_NAMES, type Subdivision } from '../lib/db'
import { useInvalidateTravel, useSubdivisions, useTravelData, useWishlist } from '../lib/hooks'
import { isDone } from '../lib/stats'
import { useQueryClient } from '@tanstack/react-query'

export function CountryPage() {
  const code = (useParams().code ?? '').toUpperCase()
  const { loading, trips, visited, countries } = useTravelData()
  const subs = useSubdivisions(code)
  const wishlist = useWishlist()
  const invalidate = useInvalidateTravel()
  const qc = useQueryClient()

  const country = countries.byCode.get(code)
  const visitedSubs = useMemo(() => new Map(visited?.subdivisions.map((s) => [s.code, s.source]) ?? []), [visited])
  const countrySource = visited?.countries.find((c) => c.code === code)?.source
  const wished = wishlist.data?.some((w) => w.country_code === code)
  const visits = trips.filter((t) => isDone(t) && t.stops.some((s) => s.country_code === code))

  const tree = useMemo(() => {
    const all = subs.data ?? []
    const top = all.filter((s) => !s.parent_code || !all.some((p) => p.code === s.parent_code))
    const children = new Map<string, Subdivision[]>()
    for (const s of all) if (s.parent_code) children.set(s.parent_code, [...(children.get(s.parent_code) ?? []), s])
    return top.sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ s, children: (children.get(s.code) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
  }, [subs.data])

  if (loading || countries.isLoading) return <Spinner label="Cargando territorio" />
  if (!country) return <p>País desconocido.</p>

  const regionVisited = new Set([...visitedSubs.keys()].filter((c) => c.startsWith(`${code}-`)))
  // Una región cuenta como visitada en el mapa si lo está ella o alguna de sus provincias.
  for (const { s, children } of tree) if (children.some((c) => regionVisited.has(c.code))) regionVisited.add(s.code)

  const toggleSub = async (subCode: string) => {
    if (visitedSubs.get(subCode) === 'trip') return
    await api.setSubdivisionMarked(subCode, !visitedSubs.has(subCode))
    if (!countrySource) await api.setCountryMarked(code, true)
    invalidate()
  }
  const toggleCountry = async () => {
    if (countrySource === 'trip') return
    await api.setCountryMarked(code, !countrySource)
    invalidate()
  }
  const toggleWish = async () => {
    await api.setWish(code, !wished)
    qc.invalidateQueries({ queryKey: ['wishlist'] })
  }

  const subsTotal = subs.data?.length ?? 0
  const subsVisited = (subs.data ?? []).filter((s) => visitedSubs.has(s.code)).length

  return (
    <div>
      <Link to="/app/paises" className="label-code flex items-center gap-1 text-ink-soft hover:text-ink">
        <Icon name="arrow_back" size={16} /> Países & regiones
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>
            {CONTINENT_NAMES[country.continent]} // ISO {country.code}
          </Eyebrow>
          <h1 className="display-hero mt-3 flex items-center gap-4">
            <Flag code={code} className="text-[0.7em]" /> {country.name}
          </h1>
          <p className="mt-3 text-lg text-ink-soft">
            {subsVisited} de {subsTotal} regiones y provincias · {plural(visits.length, 'expedición', 'expediciones')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`btn ${countrySource ? 'btn-dark' : 'btn-ghost'}`} onClick={toggleCountry} disabled={countrySource === 'trip'}>
            <Icon name={countrySource ? 'check_circle' : 'add_circle'} size={18} />
            {countrySource === 'trip' ? 'Visitado en un viaje' : countrySource ? 'Visitado' : 'Marcar como visitado'}
          </button>
          <button className={`btn ${wished ? 'btn-accent' : 'btn-ghost'}`} onClick={toggleWish}>
            <Icon name="bookmark" filled={wished} size={18} /> {wished ? 'En mi Bucket List' : 'Añadir a Bucket List'}
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <RegionMap className="h-[60vh] min-h-96" countryCode={code} visited={regionVisited} onToggle={(c) => toggleSub(c)} />
          <p className="label-code mt-2 text-ink-soft">Toca una región para marcarla. Las que vienen de tus viajes se marcan solas.</p>

          {visits.length > 0 && (
            <section className="mt-8">
              <h2 className="headline-md mb-3 uppercase">Expediciones aquí</h2>
              <ul className="space-y-2">
                {visits.map((t) => (
                  <li key={t.id}>
                    <Link to={`/app/viajes/${t.id}`} className="card flex items-center justify-between gap-3 p-4 hover:bg-surface-low">
                      <span className="font-display font-semibold">{t.title}</span>
                      <span className="label-code text-ink-soft">{formatDate(t.start_date, 'month')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="card max-h-[75vh] overflow-auto p-2">
          <div className="label-code px-3 py-2 text-ink-soft">Subdivisiones ISO 3166-2</div>
          {subs.isLoading && <Spinner />}
          {!subs.isLoading && !tree.length && <p className="px-3 py-2 text-sm text-ink-soft">Este país no tiene subdivisiones registradas.</p>}
          <ul>
            {tree.map(({ s, children }) => (
              <li key={s.code} className="border-b border-surface-highest last:border-0">
                <SubRow sub={s} source={visitedSubs.get(s.code)} onToggle={toggleSub} />
                {children.length > 0 && (
                  <ul className="mb-2 ml-6 border-l border-surface-highest">
                    {children.map((c) => (
                      <li key={c.code}>
                        <SubRow sub={c} source={visitedSubs.get(c.code)} onToggle={toggleSub} small />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

const TYPE_ES: Record<string, string> = {
  Province: 'Provincia',
  'Autonomous community': 'Comunidad autónoma',
  'Autonomous city in North Africa': 'Ciudad autónoma',
  State: 'Estado',
  Region: 'Región',
  Prefecture: 'Prefectura',
  Department: 'Departamento',
  District: 'Distrito',
  County: 'Condado',
  Municipality: 'Municipio',
  'Metropolitan city': 'Ciudad metropolitana',
  'Autonomous region': 'Región autónoma',
  'Metropolitan department': 'Departamento',
  'Metropolitan region': 'Región',
  Country: 'País',
}

function SubRow({ sub, source, onToggle, small }: { sub: Subdivision; source?: 'trip' | 'manual'; onToggle: (c: string) => void; small?: boolean }) {
  return (
    <button
      onClick={() => onToggle(sub.code)}
      disabled={source === 'trip'}
      className={`flex w-full items-center gap-3 rounded-sm px-3 text-left hover:bg-surface-low ${small ? 'py-1.5 text-sm' : 'py-2.5'}`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-xs border-2 ${source ? 'border-accent bg-accent text-white' : 'border-outline-soft'}`}>
        {source && <Icon name="check" size={14} />}
      </span>
      <span className={`flex-1 ${small ? '' : 'font-medium'}`}>{sub.name}</span>
      <span className="label-stamp text-outline">{TYPE_ES[sub.type] ?? sub.type}</span>
      {source === 'trip' && <span className="label-stamp bg-ink px-1.5 py-0.5 text-paper">Viaje</span>}
    </button>
  )
}
