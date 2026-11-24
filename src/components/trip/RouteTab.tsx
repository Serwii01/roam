import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { PhotoImg } from '../PhotoImg'
import { SpotifyPlayer } from '../Spotify'
import { StopSights } from '../StopSights'
import { WeatherChip } from '../Weather'
import { Empty, ErrorNote, Flag, Stars, formatDate } from '../ui'
import { api } from '../../lib/api'
import type { Stop, TripWithStops } from '../../lib/db'
import { useTravelMutation } from '../../lib/hooks'
import { formatKm } from '../../lib/stats'
import { TRANSPORT } from '../../lib/transport'

export function RouteTab({
  trip: t,
  legs,
  participant,
  onPhoto,
}: {
  trip: TripWithStops
  legs: { stop: Stop; km: number }[]
  participant: boolean
  onPhoto: (id: string) => void
}) {
  const dayOf = (d: string | null) => (d && t.start_date ? Math.round((Date.parse(d) - Date.parse(t.start_date)) / 86_400_000) + 1 : null)
  const kmAt = legs.reduce<number[]>((acc, l) => [...acc, acc.at(-1)! + l.km], [0])
  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="headline-sm flex items-center gap-2 uppercase">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Paradas
        </h2>
        {participant && (
          <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-dark py-1.5!">
            <Icon name="edit_road" size={18} /> Añadir o mover paradas
          </Link>
        )}
      </div>
      {!t.stops.length && (
        <Empty icon="add_location_alt" title="Sin paradas todavía">
          {participant && (
            <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-accent mt-4">
              Añadir la ruta
            </Link>
          )}
        </Empty>
      )}
      <ol className="space-y-4">
        {t.stops.map((s, i) => {
          const d = dayOf(s.arrived_on)
          const photos = t.photos.filter((p) => p.stop_id === s.id)
          return (
            <li key={s.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="headline-sm flex flex-wrap items-center gap-2">
                  <span className={`label-code px-1.5 py-0.5 text-paper ${i % 2 ? 'bg-accent' : 'bg-ink'}`}>{d ? `Día ${String(d).padStart(2, '0')}` : `Parada ${i + 1}`}</span>
                  {s.name}
                  <Flag code={s.country_code} />
                </h3>
                <span className="flex items-center gap-2">
                  <WeatherChip lat={s.lat} lon={s.lon} date={s.arrived_on} />
                  <span className="label-code text-ink-soft">{s.arrived_on ? formatDate(s.arrived_on).toUpperCase() : '—'}</span>
                </span>
              </div>
              {i > 0 && s.transport_in && (
                <div className="label-code mt-2 flex items-center gap-1.5 text-ink-soft">
                  <Icon name={TRANSPORT[s.transport_in].icon} size={16} className="text-accent" />
                  {TRANSPORT[s.transport_in].label}
                  {s.transport_in === 'plane' && s.from_airport && s.to_airport && ` · ${s.flight_no ? `${s.flight_no} · ` : ''}${s.from_airport} → ${s.to_airport}`}
                  {` · ${formatKm(legs[i - 1].km)} km`}
                </div>
              )}
              <StopNotes stop={s} editable={participant} />
              {t.status === 'done' && t.sights.some((x) => x.stop_id === s.id) && (
                <div className="mt-4 rounded-sm bg-surface-low p-3">
                  <StopSights stop={s} sights={t.sights.filter((x) => x.stop_id === s.id)} planned={false} readOnly onAdd={() => {}} onToggle={() => {}} onRemove={() => {}} />
                </div>
              )}
              {s.song_url && <SpotifyPlayer url={s.song_url} compact className="mt-4" />}
              {photos.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {photos.slice(0, 6).map((p) => (
                    <button key={p.id} onClick={() => onPhoto(p.id)} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-surface-container" aria-label={`Ver foto de ${s.name}`}>
                      <PhotoImg path={p.path} alt="" loading="lazy" className="h-full w-full object-cover" />
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
                <span className="text-accent-deep">Km {formatKm(kmAt[i])}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Notas de una parada, editables en el sitio. */
function StopNotes({ stop: s, editable }: { stop: Stop; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(s.notes ?? '')
  const save = useTravelMutation((notes: string | null) => api.updateStop(s.id, { notes }))
  useEffect(() => setValue(s.notes ?? ''), [s.notes])
  if (editing)
    return (
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(value.trim() || null, { onSuccess: () => setEditing(false) })
        }}
      >
        <textarea aria-label={`Notas de ${s.name}`} className="field min-h-24 resize-y" autoFocus value={value} maxLength={4000} onChange={(e) => setValue(e.target.value)} />
        <ErrorNote error={save.error} />
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost py-1.5!" onClick={() => (setValue(s.notes ?? ''), setEditing(false))}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-dark py-1.5!" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    )
  return (
    <div className="mt-3">
      {s.notes ? <p className="whitespace-pre-line leading-relaxed">{s.notes}</p> : !editable && <p className="text-ink-soft">Sin notas.</p>}
      {editable && (
        <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-accent-deep hover:underline">
          <Icon name={s.notes ? 'edit' : 'edit_note'} size={16} /> {s.notes ? 'Editar notas' : 'Añadir notas'}
        </button>
      )}
    </div>
  )
}
