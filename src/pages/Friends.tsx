import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { TripCard } from '../components/TripCard'
import { ErrorNote, Eyebrow, Flag, plural } from '../components/ui'
import { api } from '../lib/api'
import { useUser } from '../lib/auth'
import type { PublicProfile } from '../lib/db'
import { useAirportMap, useProfile, useVisited } from '../lib/hooks'

/** /app/amigos — buscar viajeros, seguirlos, comparar países y ver sus últimos viajes. */
export function FriendsPage() {
  const user = useUser()
  const qc = useQueryClient()
  const profile = useProfile()
  const myVisited = useVisited()
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.listFollowing() })
  const ids = useMemo(() => following.data ?? [], [following.data])
  const people = useQuery({ queryKey: ['profiles', ids], queryFn: () => api.getProfiles(ids), enabled: ids.length > 0 })
  const feed = useQuery({ queryKey: ['friends-trips', ids], queryFn: () => api.listFriendsTrips(ids), enabled: ids.length > 0 })
  const visited = useQueries({ queries: ids.map((id) => ({ queryKey: ['visited', id], queryFn: () => api.getVisited(id) })) })
  const airports = useAirportMap((feed.data ?? []).flatMap((t) => t.stops.flatMap((s) => [s.from_airport, s.to_airport])))
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  const results = useQuery({ queryKey: ['search-people', debounced], queryFn: () => api.searchProfiles(debounced), enabled: debounced.length >= 2 })

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['following'] }), qc.invalidateQueries({ queryKey: ['follow-counts'] })])
  const toggle = useMutation({ mutationFn: (p: { id: string; on: boolean }) => (p.on ? api.unfollow(p.id) : api.follow(p.id)), onSuccess: refresh })
  const makePublic = useMutation({
    mutationFn: () => api.updateProfile(user.id, { is_public: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', user.id] }),
  })
  const [copied, setCopied] = useState(false)

  const me = profile.data
  const mine = new Set(myVisited.data?.countries.map((c) => c.code) ?? [])
  const byId = new Map((people.data ?? []).map((p) => [p.id, p]))
  const myUrl = me ? `${location.origin}/u/${me.username}` : ''

  const FollowButton = ({ p }: { p: PublicProfile }) => {
    const on = ids.includes(p.id)
    return (
      <button className={`btn shrink-0 ${on ? 'btn-ghost' : 'btn-dark'}`} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: p.id, on })}>
        <Icon name={on ? 'how_to_reg' : 'person_add'} size={18} /> {on ? 'Siguiendo' : 'Seguir'}
      </button>
    )
  }

  return (
    <div>
      <Eyebrow>Comunidad // viajeros</Eyebrow>
      <h1 className="display-hero mt-3">Amigos</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">Sigue a otros viajeros para ver sus viajes y comparar vuestros mapas.</p>
      <ErrorNote error={toggle.error ?? makePublic.error} />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          {/* Buscar */}
          <section className="card p-5">
            <label className="flex items-center gap-2 rounded-sm bg-surface-low px-3 ring-1 ring-outline-soft focus-within:ring-2 focus-within:ring-ink">
              <Icon name="search" className="text-accent" />
              <input className="w-full bg-transparent py-3 outline-none" placeholder="Busca por nombre o usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {debounced.length >= 2 && (
              <ul className="mt-3 space-y-2">
                {results.isLoading && <li className="text-sm text-ink-soft">Buscando…</li>}
                {results.data?.length === 0 && <li className="text-sm text-ink-soft">Nadie con perfil público se llama así.</li>}
                {results.data
                  ?.filter((p) => p.id !== user.id)
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-sm bg-surface-low p-3">
                      <Avatar profile={p} className="h-10 w-10 shrink-0" />
                      <Link to={`/u/${p.username}`} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate font-display font-semibold">{p.display_name || p.username}</span>
                        <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                          @{p.username} {p.home_country && <Flag code={p.home_country} />}
                        </span>
                      </Link>
                      <FollowButton p={p} />
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* Actividad */}
          <section>
            <h2 className="headline-md mb-4">Últimos viajes de quienes sigues</h2>
            {!ids.length ? (
              <p className="rounded-md bg-surface-low p-5 text-ink-soft">Cuando sigas a alguien, aquí verás sus viajes.</p>
            ) : feed.isLoading ? (
              <p className="text-ink-soft">Cargando…</p>
            ) : feed.data?.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {feed.data.map((t) => {
                  const who = byId.get(t.user_id)
                  return (
                    <div key={t.id}>
                      {who && (
                        <Link to={`/u/${who.username}`} className="mb-2 flex items-center gap-2 text-sm hover:underline">
                          <Avatar profile={who} className="h-6 w-6" /> <b>{who.display_name || who.username}</b>
                        </Link>
                      )}
                      <TripCard trip={t} airports={airports} to={who ? `/u/${who.username}/${t.id}` : undefined} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-ink-soft">Todavía no han registrado viajes.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {/* Mi perfil público */}
          <div className="card p-5">
            <div className="label-code mb-2 text-ink-soft">Tu perfil</div>
            {me && !me.is_public ? (
              <>
                <p className="text-sm">
                  Es <b>privado</b>: nadie puede encontrarte ni seguirte.
                </p>
                <button className="btn btn-accent mt-3 w-full" disabled={makePublic.isPending} onClick={() => makePublic.mutate()}>
                  <Icon name="public" size={18} /> Hacer público mi perfil
                </button>
                <p className="mt-2 text-xs text-ink-soft">Se verán tu nombre, avatar, mapa y viajes hechos. Nunca tus pasaportes ni tus gastos. Puedes volver a hacerlo privado en Ajustes.</p>
              </>
            ) : me ? (
              <>
                <div className="flex gap-2">
                  <input className="field min-w-0 flex-1 py-2! text-sm" readOnly value={myUrl} onFocus={(e) => e.currentTarget.select()} />
                  <button
                    className="btn btn-dark shrink-0"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(myUrl)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1800)
                    }}
                  >
                    <Icon name={copied ? 'check' : 'content_copy'} size={18} />
                  </button>
                </div>
                <Link to={`/u/${me.username}`} className="mt-2 inline-block text-sm font-semibold text-accent-deep hover:underline">
                  Ver mi perfil público
                </Link>
              </>
            ) : null}
          </div>

          {/* Siguiendo */}
          <div className="card p-5">
            <div className="mb-3 flex justify-between">
              <span className="font-display font-semibold">Sigues a</span>
              <span className="label-code text-ink-soft">{ids.length}</span>
            </div>
            {ids.length ? (
              <ul className="space-y-2">
                {ids.map((id, i) => {
                  const p = byId.get(id)
                  if (!p) return null
                  const theirs = visited[i]?.data?.countries.map((c) => c.code) ?? []
                  const common = theirs.filter((c) => mine.has(c)).length
                  return (
                    <li key={id} className="flex items-center gap-3">
                      <Avatar profile={p} className="h-10 w-10 shrink-0" />
                      <Link to={`/u/${p.username}`} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate font-semibold">{p.display_name || p.username}</span>
                        <span className="text-xs text-ink-soft">
                          {plural(theirs.length, 'país', 'países')} · {common} en común
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">Busca a alguien arriba para seguirle.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
