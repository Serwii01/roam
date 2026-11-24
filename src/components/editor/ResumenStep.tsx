import type { Draft } from './common'
import { useState } from 'react'
import { daysBetween } from '../DatePicker'
import { Icon } from '../Icon'
import { PhotoImg } from '../PhotoImg'
import { Stamp } from '../Stamp'
import { TripBudget } from '../TripBudget'
import { plural } from '../ui'
import { computeStamps } from '../../lib/badges'
import type { TripWithStops } from '../../lib/db'
import { IMAGE_ACCEPT } from '../../lib/images'
import { useAirportMap } from '../../lib/hooks'
import { formatKm, tripKm } from '../../lib/stats'

export function ResumenStep({
  trip,
  draft,
  airports,
  stamps,
  countryName,
  onStatus,
  canDelete,
  onDelete,
}: {
  trip: TripWithStops | undefined | null
  draft: Draft
  airports: ReturnType<typeof useAirportMap>
  stamps: ReturnType<typeof computeStamps>
  countryName: (c: string) => string
  /** Sin él (compañero de un viaje compartido), no se puede cambiar el estado. */
  onStatus?: (s: 'done' | 'planned') => void
  canDelete: boolean
  onDelete: () => void
}) {
  const planned = draft.status === 'planned'
  const stops = trip?.stops ?? []
  const countries = [...new Set(stops.map((s) => s.country_code))]
  const days = draft.start_date && draft.end_date ? daysBetween(draft.start_date, draft.end_date) : null
  return (
    <div className="space-y-6">
      <div>
        <h2 className="headline-md">Resumen</h2>
        <p className="mt-1 text-ink-soft">Revisa que todo esté bien y guarda.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Paradas', String(stops.length)],
          ['Países', String(countries.length)],
          ['Distancia', `${trip ? formatKm(tripKm(trip, airports)) : 0} km`],
          ['Días', days ? String(days) : '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-sm bg-surface-low p-3">
            <div className="label-stamp text-ink-soft">{l}</div>
            <div className="font-display text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      {planned ? (
        <div className="rounded-md border-2 border-accent/40 bg-accent-soft/30 p-5">
          <div className="flex items-start gap-3">
            <Icon name="event_upcoming" className="text-accent" />
            <div className="flex-1">
              <div className="font-display font-semibold">Es un viaje planificado</div>
              <p className="mt-1 text-sm text-ink-soft">
                Aparece en tus planes y en la Bucket List, pero no cuenta como visitado ni da sellos.{' '}
                {onStatus ? 'Cuando vuelvas, márcalo como realizado.' : 'Cuando quien lo creó lo marque como realizado, saldrá también en tu perfil.'}
              </p>
              {onStatus && (
                <button type="button" className="btn btn-dark mt-3" onClick={() => onStatus('done')}>
                  <Icon name="task_alt" size={18} /> Ya lo hice: marcar como realizado
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 font-display font-semibold">{stamps.length ? `${plural(stamps.length, 'sello', 'sellos')} para tu pasaporte` : 'Sellos'}</div>
          {stamps.length ? (
            <div className="grid gap-6 rounded-md bg-surface-low p-6 sm:grid-cols-2">
              {stamps.map((s) => (
                <div key={s.key} className="grid place-items-center py-4">
                  <Stamp stampKey={s.key} countryCode={s.countryCode} countryName={countryName(s.countryCode)} place={s.place} date={s.date} airport={s.airport} domestic={s.domestic} />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-surface-low p-5 text-sm text-ink-soft">Cada país distinto del de salida te da un sello, y cada aeropuerto nacional al que llegas en avión también.</p>
          )}
          {onStatus && (
            <button type="button" className="mt-3 text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline" onClick={() => onStatus('planned')}>
              ¿Aún no lo has hecho? Pásalo a planificado
            </button>
          )}
        </div>
      )}

      {trip && <TripBudget trip={{ ...trip, ...draft, start_date: draft.start_date ?? null, end_date: draft.end_date ?? null, status: draft.status ?? trip.status }} />}

      {canDelete && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-highest pt-6">
          <span className="text-sm text-ink-soft">Eliminar borra el viaje, sus paradas y sus fotos.</span>
          <button type="button" className="btn text-red-700 hover:bg-red-50" onClick={onDelete}>
            <Icon name="delete" size={18} /> Eliminar viaje
          </button>
        </div>
      )}
    </div>
  )
}

export function PhotoStrip({ trip, onUpload }: { trip: TripWithStops | undefined | null; onUpload: (f: FileList) => void }) {
  const [over, setOver] = useState(false)
  const photos = trip?.photos ?? []
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <span className="font-display font-semibold">Fotos del viaje</span>
        <span className="text-sm text-ink-soft">{photos.length ? plural(photos.length, 'foto', 'fotos') : 'Hasta 10 cada vez'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.slice(0, 2).map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-sm bg-surface-container">
            <PhotoImg path={p.path} alt="" loading="lazy" className="h-full w-full object-cover" />
          </div>
        ))}
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed p-2 text-center text-sm ${over ? 'border-accent bg-accent-soft/40' : 'border-outline-soft hover:border-ink'} ${photos.length >= 2 ? 'aspect-square' : photos.length === 1 ? 'col-span-2' : 'col-span-3 h-28'}`}
        >
          <Icon name="add_photo_alternate" />
          <span>{photos.length > 2 ? `+${photos.length - 2} · añadir` : 'Añadir fotos'}</span>
          <input type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files)} />
        </label>
      </div>
    </div>
  )
}


/** Campos del viaje listos para guardar: siempre cumplen las restricciones de la base de datos. */
