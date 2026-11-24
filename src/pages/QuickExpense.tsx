import { Navigate } from 'react-router-dom'
import { Spinner } from '../components/ui'
import { useTravelData } from '../lib/hooks'
import { activeTrip, localDate } from '../lib/today'

/** Acceso directo de la app instalada: apuntar un gasto en el viaje en marcha o, si no hay, en el último que empezó. */
export function QuickExpensePage() {
  const { loading, trips } = useTravelData()
  if (loading) return <Spinner />
  const day = localDate()
  const trip = activeTrip(trips, day)?.trip ?? trips.filter((t) => t.start_date && t.start_date <= day).sort((a, b) => b.start_date!.localeCompare(a.start_date!))[0]
  return <Navigate to={trip ? `/app/viajes/${trip.id}?tab=gastos&nuevo=1` : '/app/bitacora'} replace />
}
