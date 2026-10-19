import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { JoinCta, PublicLayout, PublicTripView } from '../components/PublicTripView'
import { TripCard } from '../components/TripCard'
import { ErrorNote, Flag, Spinner, StatTile, plural } from '../components/ui'
import { WorldMap } from '../components/LazyWorldMap'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { computeBadges } from '../lib/badges'
import { UN_COUNTRY_COUNT } from '../lib/countries'
import { useAirportMap, useCountries } from '../lib/hooks'
import { computeStats, formatKm, isDone } from '../lib/stats'

function Missing({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <Icon name="lock" size={40} className="text-ink-soft" />
      <h1 className="headline-md mt-3">{title}</h1>
      <p className="mt-2 text-ink-soft">{text}</p>
      <Link to="/" className="btn btn-dark mt-6">
        Ir a ROAM
      </Link>
    </div>
  )
}

/** /v/:token — viaje compartido por enlace, visible sin cuenta. */
export function SharedTripPage() {
  const { token = '' } = useParams()
  const shared = useQuery({ queryKey: ['shared', token], queryFn: () => api.getSharedTrip(token), retry: false })
  return (
    <PublicLayout>
      {shared.isLoading ? (
        <Spinner label="Abriendo el viaje" />
      ) : shared.data ? (
        <PublicTripView trip={shared.data.trip} owner={shared.data.owner} />
      ) : (
        <Missing title="Este enlace ya no funciona" text="Quien lo compartió puede haberlo quitado. Pídele uno nuevo." />
      )}
    </PublicLayout>
  )
}

/** /u/:username/:tripId — un viaje de un perfil público. */
export function PublicTripPage() {
  const { username = '', tripId = '' } = useParams()
  const profile = useQuery({ queryKey: ['public-profile', username], queryFn: () => api.getProfileByUsername(username) })
  const trip = useQuery({ queryKey: ['public-trip', tripId], queryFn: () => api.getTrip(tripId), enabled: !!profile.data })
  const p = profile.data
  return (
    <PublicLayout>
      {profile.isLoading || trip.isLoading ? (
        <Spinner label="Abriendo el viaje" />
      ) : p && trip.data && trip.data.user_id === p.id ? (
        <PublicTripView trip={trip.data} owner={{ id: p.id, display_name: p.display_name || p.username, avatar_url: p.avatar_url, username: p.is_public ? p.username : null }} />
      ) : (
        <Missing title="No podemos enseñar este viaje" text="El perfil es privado o el viaje ya no existe." />
      )}
    </PublicLayout>
  )
}

/** /u/:username — perfil público: mapa, cifras, viajes, seguir y comparar mapas. */
export function PublicProfilePage() {
  const { username = '' } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const countries = useCountries()
  const profile = useQuery({ queryKey: ['public-profile', username], queryFn: () => api.getProfileByUsername(username) })
  const p = profile.data
  const isMe = !!user && p?.id === user.id
  const visible = !!p && (p.is_public || isMe)
  const trips = useQuery({ queryKey: ['trips', p?.id], queryFn: () => api.listTrips(p!.id), enabled: visible })
  const visited = useQuery({ queryKey: ['visited', p?.id], queryFn: () => api.getVisited(p!.id), enabled: visible })
  const counts = useQuery({ queryKey: ['follow-counts', p?.id], queryFn: () => api.followCounts(p!.id), enabled: visible })
  const following = useQuery({ queryKey: ['following'], queryFn: () => api.listFollowing(), enabled: !!user })
  const mine = useQuery({ queryKey: ['visited', user?.id], queryFn: () => api.getVisited(user!.id), enabled: !!user && !isMe })
  const done = useMemo(() => (trips.data ?? []).filter(isDone), [trips.data])
  const airports = useAirportMap(done.flatMap((t) => t.stops.flatMap((s) => [s.from_airport, s.to_airport])))
  const stats = useMemo(() => computeStats(trips.data ?? [], visited.data, countries.byCode, airports), [trips.data, visited.data, countries.byCode, airports])
  const badges = useMemo(() => computeBadges(trips.data ?? [], stats, airports, countries.byCode).filter((b) => b.progress >= 1), [trips.data, stats, airports, countries.byCode])
  const isFollowing = !!p && (following.data ?? []).includes(p.id)
  const toggle = useMutation({
    mutationFn: () => (isFollowing ? api.unfollow(p!.id) : api.follow(p!.id)),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['following'] }), qc.invalidateQueries({ queryKey: ['follow-counts', p?.id] })]),
  })
  const [copied, setCopied] = useState(false)

  if (profile.isLoading) return <PublicLayout><Spinner label="Abriendo el perfil" /></PublicLayout>
  if (!p || !visible)
    return (
      <PublicLayout>
        <Missing title="Este perfil es privado" text="Solo su dueño puede verlo. Si es tuyo, actívalo como público en tus ajustes." />
      </PublicLayout>
    )

  const theirs = new Set(stats.countries)
  const myCountries = new Set(mine.data?.countries.map((c) => c.code) ?? [])
  const common = [...theirs].filter((c) => myCountries.has(c))
  const onlyThem = [...theirs].filter((c) => !myCountries.has(c))
  const onlyMe = [...myCountries].filter((c) => !theirs.has(c))
  const pct = Math.round((stats.countries.length / UN_COUNTRY_COUNT) * 100)
  const url = `${location.origin}/u/${p.username}`

  return (
    <PublicLayout>
      {!p.is_public && isMe && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-sm bg-accent-soft/50 px-4 py-3 text-sm text-accent-ink">
          <Icon name="visibility_off" size={18} /> Tu perfil es privado: solo tú ves esta página. Hazlo público en Ajustes para compartirla.
          <Link to="/app/ajustes" className="font-semibold underline">
            Ir a ajustes
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-5">
        <Avatar profile={p} className="h-24 w-24 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="headline-lg truncate">{p.display_name || p.username}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft">
            <span>@{p.username}</span>
            {p.home_country && (
              <span className="flex items-center gap-1.5">
                <Flag code={p.home_country} /> {[p.home_city, countries.name(p.home_country)].filter(Boolean).join(', ')}
              </span>
            )}
            {counts.data && (
              <span>
                {plural(counts.data.followers, 'seguidor', 'seguidores')} · sigue a {counts.data.following}
              </span>
            )}
          </div>
          {p.bio && <p className="mt-2 max-w-2xl">{p.bio}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {user && !isMe && (
            <button className={`btn ${isFollowing ? 'btn-ghost' : 'btn-accent'}`} disabled={toggle.isPending || following.isLoading} onClick={() => toggle.mutate()}>
              <Icon name={isFollowing ? 'how_to_reg' : 'person_add'} size={18} /> {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
          {!user && (
            <Link to="/registro" className="btn btn-accent">
              <Icon name="person_add" size={18} /> Seguir
            </Link>
          )}
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: p.display_name || p.username, url }).catch(() => {})
              else {
                await navigator.clipboard?.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              }
            }}
          >
            <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copiado' : 'Compartir perfil'}
          </button>
        </div>
      </div>
      <ErrorNote error={toggle.error} />

      <div className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile label="Países" icon="public" value={stats.countries.length} hint={`${pct}% del mundo`} />
        <StatTile label="Continentes" icon="language" value={stats.continents.length} />
        <StatTile label="Recorridos" icon="route" value={formatKm(stats.totalKm, true)} unit="km" />
        <StatTile label="Viajes" icon="luggage" value={stats.trips} />
        <StatTile label="Insignias" icon="military_tech" value={badges.length} className="col-span-2 md:col-span-1" />
      </div>

      <div className="card mt-6 p-3">
        <WorldMap className="h-[420px] shadow-none!" trips={done} airports={airports} countries={stats.countries} telemetry={false} routeLink={false} />
      </div>

      {user && !isMe && mine.data && (
        <section className="card mt-6 p-5">
          <h2 className="headline-sm flex items-center gap-2 uppercase">
            <Icon name="compare_arrows" className="text-accent" /> Tu mapa y el de {p.display_name || p.username}
          </h2>
          <p className="mt-1 text-ink-soft">{common.length ? `Tenéis ${plural(common.length, 'país', 'países')} en común.` : 'Aún no tenéis ningún país en común.'}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {(
              [
                ['En común', common],
                [`Solo ${p.display_name || p.username}`, onlyThem],
                ['Solo tú', onlyMe],
              ] as const
            ).map(([label, list]) => (
              <div key={label} className="rounded-sm bg-surface-low p-3">
                <div className="label-stamp mb-2 flex justify-between text-ink-soft">
                  <span>{label}</span>
                  <span>{list.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list
                    .map((c) => ({ c, n: countries.name(c) }))
                    .sort((a, b) => a.n.localeCompare(b.n, 'es'))
                    .map(({ c, n }) => (
                      <span key={c} className="flex items-center gap-1 rounded-xs bg-card px-2 py-1 text-xs">
                        <Flag code={c} /> {n}
                      </span>
                    ))}
                  {!list.length && <span className="text-sm text-ink-soft">—</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="headline-md mb-4">Viajes</h2>
        {done.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {done.map((t) => (
              <TripCard key={t.id} trip={t} airports={airports} to={`/u/${p.username}/${t.id}`} />
            ))}
          </div>
        ) : (
          <p className="text-ink-soft">Todavía no hay viajes.</p>
        )}
      </section>
      <JoinCta />
    </PublicLayout>
  )
}
