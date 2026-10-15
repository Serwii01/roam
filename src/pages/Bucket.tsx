import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { TripCard } from '../components/TripCard'
import { Empty, Eyebrow, Flag, Spinner, plural } from '../components/ui'
import { WorldMap } from '../components/WorldMap'
import { api } from '../lib/api'
import { CONTINENT_NAMES } from '../lib/db'
import { useTravelData, useWishlist } from '../lib/hooks'
import { isDone } from '../lib/stats'

export function BucketPage() {
  const { loading, trips, stats, countries, airports } = useTravelData()
  const wishlist = useWishlist()
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')

  if (loading || wishlist.isLoading) return <Spinner label="Cargando destinos pendientes" />

  const planned = trips.filter((t) => !isDone(t))
  const wishes = wishlist.data ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['wishlist'] })

  return (
    <div>
      <Eyebrow>Próximas coordenadas // wishlist</Eyebrow>
      <h1 className="display-hero mt-3">Bucket list</h1>
      <p className="mt-3 text-lg text-ink-soft">
        {plural(wishes.length, 'país pendiente', 'países pendientes')} · {plural(planned.length, 'expedición planificada', 'expediciones planificadas')} · te quedan {195 - stats.countries.length} países por descubrir
      </p>

      <WorldMap className="mt-6 h-[50vh] min-h-80" trips={planned} airports={airports} countries={wishes.map((w) => w.country_code)} legend={false} telemetry={false} />

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section>
          <h2 className="headline-md mb-3 uppercase">Países soñados</h2>
          <form
            className="card mb-4 flex flex-col gap-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!code) return
              await api.setWish(code, true, note || undefined)
              setCode('')
              setNote('')
              refresh()
            }}
          >
            <select className="field py-2!" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">Elige un país…</option>
              {countries.list
                .filter((c) => !stats.countries.includes(c.code) && !wishes.some((w) => w.country_code === c.code))
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
            </select>
            <input className="field py-2!" placeholder="Qué quieres ver (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-dark" type="submit" disabled={!code}>
              <Icon name="bookmark_add" size={18} /> Añadir deseo
            </button>
          </form>
          <ul className="space-y-2">
            {wishes.map((w) => {
              const c = countries.byCode.get(w.country_code)
              return (
                <li key={w.country_code} className="card flex items-center gap-3 p-3">
                  <Flag code={w.country_code} className="text-xl" />
                  <Link to={`/app/paises/${w.country_code}`} className="min-w-0 flex-1">
                    <div className="font-display font-semibold">{c?.name ?? w.country_code}</div>
                    <div className="truncate text-xs text-ink-soft">
                      {c && CONTINENT_NAMES[c.continent]}
                      {w.note && ` · ${w.note}`}
                    </div>
                  </Link>
                  <button
                    className="text-ink-soft hover:text-red-700"
                    aria-label="Quitar"
                    onClick={async () => {
                      await api.setWish(w.country_code, false)
                      refresh()
                    }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="headline-md uppercase">Expediciones planificadas</h2>
            <Link to="/app/viajes/nuevo?plan=1" className="label-code text-accent-deep">
              + Planificar viaje
            </Link>
          </div>
          {planned.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {planned.map((t) => (
                <TripCard key={t.id} trip={t} airports={airports} />
              ))}
            </div>
          ) : (
            <Empty icon="event_upcoming" title="Ningún viaje planificado">
              Crea un viaje y márcalo como «Planificado»: no contará como visitado hasta que lo completes.
            </Empty>
          )}
        </section>
      </div>
    </div>
  )
}
