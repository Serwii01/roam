import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { api } from '../lib/api'
import { openCalendarFile, tripCalendar } from '../lib/calendar'
import type { TripWithStops } from '../lib/db'

/** Añade el viaje al calendario del móvil: fechas, trayectos con hora, alojamientos y plan de cada día. */
export function TripCalendar({ trip: t }: { trip: TripWithStops }) {
  // Las mismas consultas que «Alojamiento y transporte»: normalmente ya están en caché.
  const lodgings = useQuery({ queryKey: ['lodgings', t.id], queryFn: () => api.listLodgings(t.id) })
  const legs = useQuery({ queryKey: ['legs', t.id], queryFn: () => api.listLegDetails(t.id) })
  const ready = !lodgings.isLoading && !legs.isLoading
  const { ics, count } = tripCalendar(t, lodgings.data ?? [], legs.data ?? [])
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

  return (
    <div className="card p-4" id="calendario">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="headline-sm uppercase">Calendario</h3>
        <span className="label-code text-ink-soft">{count === 1 ? '1 evento' : `${count} eventos`}</span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-ink-soft">Pon las fechas del viaje, los horarios de los trayectos o el plan de cada día para llevarlos a tu calendario.</p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            Las fechas del viaje, los vuelos y trenes con su hora (con aviso antes de salir), los alojamientos y el plan de cada día, en tu calendario.
          </p>
          <button type="button" className="btn btn-dark mt-3 w-full" disabled={!ready} onClick={() => openCalendarFile(ics, t.title)}>
            <Icon name="calendar_add_on" size={18} /> Añadir al calendario
          </button>
          <p className="mt-2 text-xs text-ink-soft">
            {ios
              ? 'Se abre Calendario: pulsa «Añadir todo».'
              : 'Se descarga un archivo .ics: ábrelo con tu app de calendario. En Google Calendar, impórtalo desde calendar.google.com → Configuración → Importar.'}{' '}
            Si después cambias el viaje, vuelve a añadirlo (según el calendario, quizá tengas que borrar antes los eventos anteriores).
          </p>
          <Link to="/app/ajustes#calendario" className="label-code mt-3 flex items-center gap-1 text-accent-deep hover:underline">
            <Icon name="autorenew" size={14} /> O suscríbete: todos tus viajes, siempre al día →
          </Link>
        </>
      )}
    </div>
  )
}
