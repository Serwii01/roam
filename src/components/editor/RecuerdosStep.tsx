import { Icon } from '../Icon'
import { PhotoImg } from '../PhotoImg'
import { SpotifyField } from '../Spotify'
import type { Stop, TripWithStops } from '../../lib/db'
import { IMAGE_ACCEPT } from '../../lib/images'
import { PhotoStrip } from './ResumenStep'

export function RecuerdosStep({
  trip,
  planned,
  soundtrack,
  onSoundtrack,
  onChange,
  onUpload,
  onDeletePhoto,
  onGoRoute,
}: {
  trip: TripWithStops | undefined | null
  planned: boolean
  soundtrack: string | null
  onSoundtrack: (url: string | null) => void
  onChange: (id: string, patch: Partial<Stop>) => void
  onUpload: (files: FileList, stopId?: string | null) => void
  onDeletePhoto: (p: TripWithStops['photos'][number]) => void
  onGoRoute: () => void
}) {
  if (!trip?.stops.length)
    return (
      <div className="rounded-md bg-surface-low p-8 text-center">
        <Icon name="route" size={32} className="text-ink-soft" />
        <p className="mt-2 text-ink-soft">Primero añade las paradas de la ruta.</p>
        <button type="button" className="btn btn-dark mt-4" onClick={onGoRoute}>
          Ir a la ruta
        </button>
      </div>
    )
  return (
    <div className="space-y-4">
      <div>
        <h2 className="headline-md">{planned ? 'Ideas y notas' : 'Recuerdos'}</h2>
        <p className="mt-1 text-ink-soft">
          {planned ? 'Apunta qué quieres ver en cada parada. Las fotos podrás subirlas a la vuelta.' : 'Notas, fotos, música y valoración de cada parada. Todo es opcional.'}
        </p>
      </div>
      <div className="lg:hidden">
        <PhotoStrip trip={trip} onUpload={(f) => onUpload(f)} />
      </div>
      <div className="rounded-md bg-surface-low p-4">
        <div className="font-display font-semibold">Banda sonora del viaje</div>
        <p className="mb-3 text-sm text-ink-soft">La música que te recuerda a este viaje. En Spotify: ··· → Compartir → Copiar enlace.</p>
        <SpotifyField value={soundtrack} onChange={onSoundtrack} />
      </div>
      {trip.stops.map((s, i) => (
        <div key={s.id} className="rounded-md bg-surface-low p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="headline-sm flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs text-paper">{i + 1}</span> {s.name}
            </span>
            {!planned && (
              <span className="flex items-center" role="group" aria-label="Valoración">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="grid h-9 w-9 place-items-center" onClick={() => onChange(s.id, { rating: s.rating === n ? null : n })} aria-label={`${n} estrellas`}>
                    <Icon name="star" filled={(s.rating ?? 0) >= n} size={22} className={(s.rating ?? 0) >= n ? 'text-accent' : 'text-outline-soft'} />
                  </button>
                ))}
              </span>
            )}
          </div>
          <textarea
            className="field mt-3 min-h-20 bg-card!"
            defaultValue={s.notes ?? ''}
            placeholder={planned ? 'Qué quieres ver o hacer aquí…' : 'Qué pasó aquí: lugares, sensaciones, recomendaciones…'}
            onBlur={(e) => (e.target.value || null) !== s.notes && onChange(s.id, { notes: e.target.value || null })}
          />
          <div className="mt-3">
            <SpotifyField compact value={s.song_url ?? null} placeholder="Canción de este día (enlace de Spotify, opcional)" onChange={(url) => onChange(s.id, { song_url: url })} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="min-w-0 flex-1 rounded-sm bg-card px-3 py-2.5 text-sm outline-none ring-1 ring-outline-soft focus:ring-ink"
              defaultValue={s.tags.join(', ')}
              placeholder="Etiquetas separadas por comas (Museo, Playa…)"
              onBlur={(e) => {
                const tags = e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)
                if (tags.join() !== s.tags.join()) onChange(s.id, { tags })
              }}
            />
            {!planned && (
              <label className="btn btn-ghost cursor-pointer">
                <Icon name="add_photo_alternate" size={18} /> Fotos
                <input type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files, s.id)} />
              </label>
            )}
          </div>
          {trip.photos.some((p) => p.stop_id === s.id) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trip.photos
                .filter((p) => p.stop_id === s.id)
                .map((p) => (
                  <div key={p.id} className="relative h-20 w-28 overflow-hidden rounded-sm">
                    <PhotoImg path={p.path} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => onDeletePhoto(p)} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Eliminar foto">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
