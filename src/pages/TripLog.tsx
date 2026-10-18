import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PhotoViewer, type ViewerPhoto } from '../components/PhotoViewer'
import { SpotifyLogo, SpotifyPlayer } from '../components/Spotify'
import { StopSights } from '../components/StopSights'
import { useAuth } from '../lib/auth'
import type { NewSight } from '../lib/api/types'
import type { Sight } from '../lib/db'
import { TripBudget } from '../components/TripBudget'
import { TripCrew } from '../components/TripCrew'
import { Empty, Flag, Spinner, StatTile, Stars, coords, formatDate, plural } from '../components/ui'
import { WorldMap } from '../components/WorldMap'
import { api } from '../lib/api'
import { useAirportMap, useCountries, useTravelMutation, useTrip } from '../lib/hooks'
import { formatKm, legKm, tripCountries, tripDays, tripKm, tripModes } from '../lib/stats'
import { tripCardData } from '../lib/shareData'
import { TRANSPORT, TRIP_STYLES } from '../lib/transport'

const ShareSheet = lazy(() => import('../components/ShareSheet').then((m) => ({ default: m.ShareSheet })))

export function TripLogPage() {
  const { id } = useParams()
  const trip = useTrip(id)
  const { name, byCode } = useCountries()
  const airports = useAirportMap(trip.data?.stops.flatMap((s) => [s.from_airport, s.to_airport]) ?? [])
  const [copied, setCopied] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [sharing, setSharing] = useState(false)
  const markDone = useTravelMutation(() => api.updateTrip(id!, { status: 'done' }))
  const me = useAuth().user?.id
  const addSight = useTravelMutation(({ stopId, sight }: { stopId: string; sight: NewSight }) => api.addSight(stopId, sight))
  const toggleSight = useTravelMutation((x: Sight) => api.updateSight(x.id, { done: !x.done }))
  const removeSight = useTravelMutation((x: Sight) => api.deleteSight(x.id))

  const t = trip.data
  // Todas las fotos en el orden de la ruta (las que no tienen parada, al final), para la galería y el visor.
  const gallery = useMemo<(ViewerPhoto & { stopName?: string })[]>(() => {
    if (!t) return []
    const order = new Map(t.stops.map((s, i) => [s.id, i]))
    return [...t.photos]
      .sort((a, b) => (order.get(a.stop_id ?? '') ?? Infinity) - (order.get(b.stop_id ?? '') ?? Infinity))
      .map((p) => {
        const stop = t.stops.find((s) => s.id === p.stop_id)
        const when = stop?.arrived_on ? formatDate(stop.arrived_on, 'long') : null
        return { id: p.id, url: api.photoUrl(p.path), stopName: stop?.name, caption: [p.caption, stop?.name, when].filter(Boolean).join(' · ') || t.title }
      })
  }, [t])
  // `name` cambia en cada render; lo que importa es `byCode`.
  const shareData = useMemo(() => t && tripCardData(t, airports, name), [t, airports, byCode])
  const sharePhotos = useMemo(() => [...new Set([...(t?.cover_url ? [t.cover_url] : []), ...gallery.map((g) => g.url)])], [t, gallery])
  const openPhoto = (id: string) => setViewer(Math.max(0, gallery.findIndex((g) => g.id === id)))
  const legs = useMemo(() => (t ? t.stops.slice(1).map((s, j) => ({ stop: s, km: legKm(t.stops, j + 1, airports) })) : []), [t, airports])

  if (trip.isLoading) return <Spinner label="Abriendo bitácora" />
  if (!t)
    return (
      <Empty icon="search_off" title="Esta expedición no existe">
        <Link to="/app/bitacora" className="btn btn-dark mt-4">
          Volver a la bitácora
        </Link>
      </Empty>
    )

  const km = tripKm(t, airports)
  const days = tripDays(t)
  const countries = tripCountries(t)
  const modes = tripModes(t)
  const mainMode = modes.sort((a, b) => legs.filter((l) => l.stop.transport_in === b).length - legs.filter((l) => l.stop.transport_in === a).length)[0]
  const first = t.stops[0]
  const destinations = countries.filter((c) => c !== first?.country_code)
  const dayOf = (d: string | null) => (d && t.start_date ? Math.round((Date.parse(d) - Date.parse(t.start_date)) / 86_400_000) + 1 : null)
  const photosOf = (stopId: string) => t.photos.filter((p) => p.stop_id === stopId)
  // Kilómetros acumulados al llegar a cada parada.
  const kmAt = legs.reduce<number[]>((acc, l) => [...acc, acc.at(-1)! + l.km], [0])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-code bg-accent px-2 py-1 text-white">EXP · {t.start_date?.slice(0, 4) ?? 'S/F'} archive</span>
        <span className={`label-code px-2 py-1 ${t.status === 'done' ? 'bg-surface-container' : 'bg-accent-soft text-accent-ink'}`}>{t.status === 'done' ? 'Realizado' : 'Planificado'}</span>
        {first && (
          <span className="label-code flex items-center gap-1.5 text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {coords(first.lat, first.lon)}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-4xl">
          <h1 className="display-hero">{t.title}</h1>
          <p className="mt-4 text-lg text-ink-soft">
            {[
              destinations.map(name).join(', ') || (first && name(first.country_code)),
              `${formatKm(km)} km registrados`,
              days && `${days} días${mainMode ? ` en ${TRANSPORT[mainMode].label.toLowerCase()}` : ''}`,
              t.start_date && formatDate(t.start_date, 'long'),
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => {
              navigator.clipboard?.writeText(location.href)
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            }}
          >
            <Icon name="link" size={18} /> {copied ? 'Enlace copiado' : 'Copiar enlace'}
          </button>
          <button className="btn btn-accent" onClick={() => setSharing(true)}>
            <Icon name="ios_share" size={18} /> Compartir imagen
          </button>
          <a href="#companeros" className="btn btn-ghost">
            <Icon name="group_add" size={18} /> {(t.member_count ?? 0) > 0 ? `${(t.member_count ?? 0) + 1} viajeros` : 'Invitar'}
          </a>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Icon name="picture_as_pdf" size={18} /> Exportar PDF
          </button>
          {t.status === 'planned' && (
            <button
              className="btn btn-accent"
              disabled={markDone.isPending}
              onClick={() => {
                const future = t.start_date && t.start_date > new Date().toISOString().slice(0, 10)
                if (!future || confirm('Las fechas de este viaje aún no han llegado. ¿Marcarlo igualmente como realizado?')) markDone.mutate()
              }}
            >
              <Icon name="task_alt" size={18} /> Ya lo hice
            </button>
          )}
          <Link to={`/app/viajes/${t.id}/editar`} className="btn btn-dark">
            <Icon name="edit_note" size={18} /> Editar bitácora
          </Link>
        </div>
      </div>

      <div className="card mt-8 grid grid-cols-2 gap-2 p-2 md:grid-cols-5">
        <StatTile label="Duración" icon="calendar_month" value={days ?? '—'} unit="días" hint={t.start_date ? `${formatDate(t.start_date)} — ${formatDate(t.end_date)}` : 'Sin fechas'} />
        <StatTile label="Distancia" icon="route" value={formatKm(km)} unit="km" hint={`${(km / 40075).toFixed(2)} vueltas a la Tierra`} />
        <StatTile label="Países" icon="public" value={countries.length} hint={countries.join(' · ')} />
        <StatTile label="Paradas" icon="pin_drop" value={t.stops.length} hint={plural(t.photos.length, 'captura', 'capturas')} />
        <StatTile
          label="Estilo"
          icon={t.style ? TRIP_STYLES[t.style].icon : 'explore'}
          value={<span className="text-2xl">{t.style ? TRIP_STYLES[t.style].label : '—'}</span>}
          hint={t.solo ? 'En solitario' : t.companions.length ? `Con ${t.companions.join(', ')}` : '—'}
        />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_460px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="headline-sm flex items-center gap-2 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Bitácora cronológica
            </h2>
            <span className="label-code text-ink-soft">{plural(t.stops.length, 'punto clave', 'puntos clave')} registrados</span>
          </div>
          {!t.stops.length && (
            <Empty icon="add_location_alt" title="Sin paradas todavía">
              <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-accent mt-4">
                Añadir la ruta
              </Link>
            </Empty>
          )}
          <ol className="space-y-4">
            {t.stops.map((s, i) => {
              const d = dayOf(s.arrived_on)
              const photos = photosOf(s.id)
              return (
                <li key={s.id} className="card p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="headline-sm flex flex-wrap items-center gap-2">
                      <span className={`label-code px-1.5 py-0.5 text-white ${i % 2 ? 'bg-accent' : 'bg-ink'}`}>
                        {d ? `Día ${String(d).padStart(2, '0')}` : `Parada ${i + 1}`}
                      </span>
                      {s.name}
                      <Flag code={s.country_code} />
                    </h3>
                    <span className="label-code text-ink-soft">{s.arrived_on ? formatDate(s.arrived_on).toUpperCase() : '—'}</span>
                  </div>
                  {i > 0 && s.transport_in && (
                    <div className="label-code mt-2 flex items-center gap-1.5 text-ink-soft">
                      <Icon name={TRANSPORT[s.transport_in].icon} size={16} className="text-accent" />
                      {TRANSPORT[s.transport_in].label}
                      {s.transport_in === 'plane' && s.from_airport && s.to_airport && ` · ${s.from_airport} → ${s.to_airport}`}
                      {` · ${formatKm(legs[i - 1].km)} km`}
                    </div>
                  )}
                  {s.notes ? <p className="mt-3 leading-relaxed">{s.notes}</p> : <p className="mt-3 text-ink-soft">Sin notas.</p>}
                  {(() => {
                    const list = t.sights.filter((x) => x.stop_id === s.id)
                    // Solo quien participa puede editar (quien ve un perfil público no ve los compañeros: member_count 0).
                    const canEdit = t.user_id === me || (t.member_count ?? 0) > 0
                    const planned = t.status === 'planned'
                    if (!list.length && !(planned && canEdit)) return null
                    return (
                      <div className="mt-4 rounded-sm bg-surface-low p-3">
                        <StopSights
                          stop={s}
                          sights={list}
                          planned={planned}
                          readOnly={!canEdit || !planned}
                          onAdd={(sight) => addSight.mutate({ stopId: s.id, sight })}
                          onToggle={(x) => toggleSight.mutate(x)}
                          onRemove={(x) => removeSight.mutate(x)}
                        />
                      </div>
                    )
                  })()}
                  {s.song_url && <SpotifyPlayer url={s.song_url} compact className="mt-4" />}
                  {photos.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {photos.map((p) => (
                        <button key={p.id} onClick={() => openPhoto(p.id)} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-surface-container">
                          <img src={api.photoUrl(p.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          <span className="label-code absolute bottom-2 left-2 bg-ink px-1.5 py-0.5 text-white">
                            {s.name} · {s.lat.toFixed(4)}° {s.lat >= 0 ? 'N' : 'S'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="label-code mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {s.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                      {s.rating && <Stars value={s.rating} />}
                    </div>
                    <span className="text-accent-deep">Km {formatKm(kmAt[i])} archivado</span>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <aside className="space-y-6">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="headline-sm uppercase">Ruta satelital</h3>
              <span className="label-code text-accent-deep">{formatKm(km)} km total</span>
            </div>
            <WorldMap
              className="h-80 shadow-none!"
              trips={[t]}
              airports={airports}
              countries={countries}
              numbered
              base="modern"
              telemetry={false}
              legend={false}
              routeLink={false}
            />
          </div>

          <TripCrew trip={t} />
          {(t.user_id === me || (t.member_count ?? 0) > 0) && <TripBudget trip={t} />}

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="headline-sm uppercase">Banda sonora del viaje</h3>
              <span className="label-code flex items-center gap-1.5 text-ink-soft">
                <SpotifyLogo className="h-4 w-4 text-[#1DB954]" /> Spotify
              </span>
            </div>
            {t.soundtrack_url ? (
              <SpotifyPlayer url={t.soundtrack_url} />
            ) : (
              <Link to={`/app/viajes/${t.id}/editar?paso=recuerdos`} className="flex items-center gap-3 rounded-sm bg-surface-low p-4 text-sm hover:bg-surface-container">
                <Icon name="music_note" className="text-accent" />
                <span>
                  <span className="block font-display font-semibold">Añade la música que te recuerda a este viaje</span>
                  <span className="text-ink-soft">Pega una playlist, un álbum o una canción de Spotify.</span>
                </span>
              </Link>
            )}
          </div>

          <div className="card p-4">
            <h3 className="headline-sm mb-3 uppercase">Tramos</h3>
            {legs.length ? (
              <ul className="space-y-2">
                {legs.map(({ stop, km: lk }, j) => (
                  <li key={stop.id} className="flex items-center gap-3 rounded-sm bg-surface-low px-3 py-2.5 text-sm">
                    <Icon name={TRANSPORT[stop.transport_in ?? 'car'].icon} size={20} className="text-accent" />
                    <span className="min-w-0 flex-1 truncate">
                      {t.stops[j].name} → {stop.name}
                      {stop.transport_in === 'plane' && stop.from_airport && (
                        <span className="label-code ml-2 text-ink-soft">
                          {stop.from_airport}–{stop.to_airport}
                        </span>
                      )}
                    </span>
                    <span className="label-code text-ink-soft">{formatKm(lk)} km</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">Añade al menos dos paradas para ver los tramos.</p>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="headline-sm uppercase">Galería editorial</h3>
              {gallery.length > 0 ? (
                <button className="label-code flex items-center gap-1 text-accent-deep hover:underline" onClick={() => setViewer(0)}>
                  <Icon name="photo_library" size={16} /> Ver {plural(gallery.length, 'foto', 'fotos')}
                </button>
              ) : (
                <span className="label-code text-ink-soft">0 fotos</span>
              )}
            </div>
            {gallery.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {gallery.map((g, i) => (
                  <button
                    key={g.id}
                    onClick={() => setViewer(i)}
                    aria-label={`Ver foto ${i + 1}${g.stopName ? ` (${g.stopName})` : ''}`}
                    className={`group relative overflow-hidden rounded-sm bg-surface-container aspect-square ${i === 0 && gallery.length > 2 ? 'col-span-2 row-span-2' : ''}`}
                  >
                    <img src={g.url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    {i === 0 && g.stopName && gallery.length > 2 && (
                      <span className="label-code absolute bottom-2 left-2 bg-ink px-1.5 py-0.5 text-white">{g.stopName}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <Link to={`/app/viajes/${t.id}/editar?paso=recuerdos`} className="btn btn-ghost w-full">
                <Icon name="add_photo_alternate" size={18} /> Añadir fotos
              </Link>
            )}
          </div>

          {t.description && (
            <div className="rounded-md bg-surface-container p-5">
              <h3 className="headline-sm flex items-center gap-2 uppercase">
                <Icon name="tips_and_updates" className="text-accent" /> Epígrafe de ruta
              </h3>
              <p className="mt-2 leading-relaxed">{t.description}</p>
            </div>
          )}
        </aside>
      </div>

      {sharing && shareData && (
        <Suspense fallback={null}>
          <ShareSheet data={shareData} photos={sharePhotos} onClose={() => setSharing(false)} />
        </Suspense>
      )}
      {viewer !== null && gallery.length > 0 && <PhotoViewer photos={gallery} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
