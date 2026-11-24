import { Link } from 'react-router-dom'
import { DayPlan } from '../DayPlan'
import { Icon } from '../Icon'
import { Empty, ErrorNote } from '../ui'
import { api } from '../../lib/api'
import type { NewSight } from '../../lib/api/types'
import type { Sight, TripWithStops } from '../../lib/db'
import { useTravelMutation } from '../../lib/hooks'

export function DaysTab({ trip: t, onDates }: { trip: TripWithStops; onDates: () => void }) {
  const add = useTravelMutation(({ stopId, sight }: { stopId: string; sight: NewSight }) => api.addSight(stopId, sight))
  const update = useTravelMutation(({ id, patch }: { id: string; patch: Parameters<typeof api.updateSight>[1] }) => api.updateSight(id, patch))
  const remove = useTravelMutation((x: Pick<Sight, 'id'>) => api.deleteSight(x.id))
  if (!t.stops.length)
    return (
      <Empty icon="add_location_alt" title="Primero, la ruta">
        <p className="mt-1 text-ink-soft">El día a día se organiza por las paradas del viaje.</p>
        <Link to={`/app/viajes/${t.id}/editar?paso=ruta`} className="btn btn-accent mt-4">
          Añadir paradas
        </Link>
      </Empty>
    )
  return (
    <div>
      <ErrorNote error={add.error ?? update.error ?? remove.error} />
      {!t.start_date && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-sm bg-surface-low px-4 py-3 text-sm">
          <Icon name="date_range" className="text-accent" />
          <span className="flex-1">Pon las fechas del viaje para verlo organizado por días.</span>
          <button type="button" className="btn btn-dark py-1.5!" onClick={onDates}>
            Poner fechas
          </button>
        </div>
      )}
      <DayPlan
        trip={t}
        ops={{
          add: (stopId, sight) => add.mutate({ stopId, sight }),
          update: (id, patch) => update.mutate({ id, patch }),
          remove: (id) => remove.mutate({ id }),
        }}
      />
    </div>
  )
}
