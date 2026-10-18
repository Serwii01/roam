import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { Logo } from './AppShell'
import { Icon } from './Icon'
import { PhotoViewer, type ViewerPhoto } from './PhotoViewer'
import { SpotifyPlayer } from './Spotify'
import { StopSights } from './StopSights'
import { Flag, StatTile, formatDate, formatRange, plural } from './ui'
import { WorldMap } from './WorldMap'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { TripWithStops } from '../lib/db'
import { useAirportMap, useCountries } from '../lib/hooks'
import { formatKm, legKm, tripCountries, tripDays, tripKm } from '../lib/stats'
import { TRANSPORT } from '../lib/transport'

/** Cabecera y pie de las páginas públicas (se ven sin cuenta). */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
          <Logo to={user ? '/app' : '/'} />
          {user ? (
            <Link to="/app" className="btn btn-dark">
              Mi mapa
            </Link>
          ) : (
            <span className="flex gap-2">
              <Link to="/entrar" className="btn btn-ghost hidden sm:inline-flex">
                Entrar
              </Link>
              <Link to="/registro" className="btn btn-accent">
                Crear mi mapa
              </Link>
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 pt-6 md:px-8">{children}</main>
      <footer className="border-t border-surface-highest px-4 py-6 text-center text-xs text-ink-soft">
        ROAM · Datos de mapas © colaboradores de OpenStreetMap ·{' '}
        <Link to="/privacidad" className="underline">
          Privacidad
        </Link>{' '}
        ·{' '}
        <Link to="/aviso-legal" className="underline">
          Aviso legal
        </Link>
      </footer>
    </div>
  )
}

/** Invitación a crear cuenta al final de las páginas públicas. */
export function JoinCta() {
  const { user } = useAuth()
  if (user) return null
  return (
    <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-md bg-ink p-6 text-white md:p-8">
      <div>
        <div className="font-display text-2xl font-bold">Crea tu propio mapa de viajes</div>
        <p className="mt-1 text-white/70">Países, rutas, sellos y fotos de cada viaje. Gratis.</p>
      </div>
      <Link to="/registro" className="btn btn-accent">
        Empezar gratis
      </Link>
    </div>
  )
}

/** Un viaje en solo lectura: lo que ve alguien con el enlace público o en un perfil público. */
export function PublicTripView({ trip: t, owner }: { trip: TripWithStops; owner: { id: string; display_name: string; avatar_url: string | null; username: string | null } }) {
  const { name } = useCountries()
  const airports = useAirportMap(t.stops.flatMap((s) => [s.from_airport, s.to_airport]))
  const [viewer, setViewer] = useState<number | null>(null)
  const km = tripKm(t, airports)
  const days = tripDays(t)
  const countries = tripCountries(t)
  const home = t.stops[0]?.country_code
  const visited = countries.length > 1 ? countries.filter((c) => c !== home) : countries
  const gallery = useMemo<ViewerPhoto[]>(() => {
    const order = new Map(t.stops.map((s, i) => [s.id, i]))
    return [...t.photos]
      .sort((a, b) => (order.get(a.stop_id ?? '') ?? Infinity) - (order.get(b.stop_id ?? '') ?? Infinity))
      .map((p) => ({ id: p.id, url: api.photoUrl(p.path), caption: t.stops.find((s) => s.id === p.stop_id)?.name ?? t.title }))
  }, [t])
  const open = (photoId: string) => setViewer(Math.max(0, gallery.findIndex((g) => g.id === photoId)))
  const ownerName = (
    <span className="flex items-center gap-2">
      <Avatar profile={{ id: owner.id, avatar_url: owner.avatar_url, display_name: owner.display_name }} className="h-8 w-8" />
      <span>
        Un viaje de <b className="text-ink">{owner.display_name}</b>
      </span>
    </span>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-ink-soft">
        {owner.username ? (
          <Link to={`/u/${owner.username}`} className="hover:underline">
            {ownerName}
          </Link>
        ) : (
          ownerName
        )}
        {t.status === 'planned' && <span className="label-code rounded-sm bg-accent-soft px-2 py-1 text-accent-ink">Planificado</span>}
      </div>
      <h1 className="display-hero mt-4">{t.title}</h1>
      <p className="mt-3 text-lg text-ink-soft">
        {[visited.map(name).join(', '), t.start_date ? formatRange(t.start_date, t.end_date) : null].filter(Boolean).join(' · ')}
      </p>
      {t.description && <p className="mt-3 max-w-3xl leading-relaxed">{t.description}</p>}

      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Distancia" icon="route" value={formatKm(km)} unit="km" />
        <StatTile label="Días" icon="calendar_month" value={days ?? '—'} />
        <StatTile label={visited.length === 1 ? 'País' : 'Países'} icon="public" value={visited.length} />
        <StatTile label="Paradas" icon="pin_drop" value={t.stops.length} hint={plural(t.photos.length, 'foto', 'fotos')} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ol className="order-2 space-y-4 lg:order-1">
          {t.stops.map((s, i) => {
            const photos = t.photos.filter((p) => p.stop_id === s.id)
            const sights = t.sights.filter((x) => x.stop_id === s.id)
            return (
              <li key={s.id} className="card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="headline-sm flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-full text-xs text-white ${i === 0 ? 'bg-accent' : 'bg-ink'}`}>{i + 1}</span>
                    {s.name} <Flag code={s.country_code} />
                  </h2>
                  {s.arrived_on && <span className="label-code text-ink-soft">{formatDate(s.arrived_on).toUpperCase()}</span>}
                </div>
                {i > 0 && s.transport_in && (
                  <div className="label-code mt-2 flex items-center gap-1.5 text-ink-soft">
                    <Icon name={TRANSPORT[s.transport_in].icon} size={16} className="text-accent" /> {TRANSPORT[s.transport_in].label}
                    {s.transport_in === 'plane' && s.from_airport && s.to_airport && ` · ${s.flight_no ? `${s.flight_no} · ` : ''}${s.from_airport} → ${s.to_airport}`}
                    {` · ${formatKm(legKm(t.stops, i, airports))} km`}
                  </div>
                )}
                {s.notes && <p className="mt-3 leading-relaxed">{s.notes}</p>}
                {s.song_url && <SpotifyPlayer url={s.song_url} compact className="mt-3" />}
                {sights.length > 0 && (
                  <div className="mt-4 rounded-sm bg-surface-low p-3">
                    <StopSights stop={s} sights={sights} planned={t.status === 'planned'} readOnly onAdd={() => {}} onToggle={() => {}} onRemove={() => {}} />
                  </div>
                )}
                {photos.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                      <button key={p.id} onClick={() => open(p.id)} aria-label={`Ver foto de ${s.name}`} className="aspect-square overflow-hidden rounded-sm bg-surface-container">
                        <img src={api.photoUrl(p.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <aside className="order-1 space-y-6 lg:order-2">
          <div className="card p-3 lg:sticky lg:top-24">
            <WorldMap className="h-80 shadow-none!" trips={[t]} airports={airports} countries={countries} numbered base="modern" telemetry={false} legend={false} routeLink={false} />
          </div>
          {t.soundtrack_url && (
            <div className="card p-4">
              <div className="label-code mb-2 text-ink-soft">Banda sonora</div>
              <SpotifyPlayer url={t.soundtrack_url} />
            </div>
          )}
        </aside>
      </div>
      <JoinCta />
      {viewer !== null && gallery.length > 0 && <PhotoViewer photos={gallery} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
