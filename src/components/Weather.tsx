import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { formatDay } from './DatePicker'
import type { PassportWarning } from '../lib/passportCheck'
import { KIND_LABEL, weatherFor, type DayWeather } from '../lib/weather'

export function useWeather(lat: number | undefined, lon: number | undefined, date: string | null | undefined) {
  return useQuery({
    queryKey: ['weather', lat?.toFixed(2), lon?.toFixed(2), date],
    queryFn: () => weatherFor(lat!, lon!, date!),
    enabled: lat !== undefined && lon !== undefined && !!date,
    staleTime: 3 * 3_600_000,
    retry: 1,
  })
}

/** «☀ 24° / 15°» con el detalle al pasar el ratón; se carga solo (Open-Meteo). */
export function WeatherChip({ lat, lon, date, className = '' }: { lat: number; lon: number; date: string | null; className?: string }) {
  const w = useWeather(lat, lon, date)
  if (!date || w.isError) return null
  if (!w.data) return <span className={`inline-flex h-7 w-20 animate-pulse rounded-full bg-surface-container ${className}`} />
  return <WeatherBadge w={w.data} className={className} />
}

export function WeatherBadge({ w, className = '' }: { w: DayWeather; className?: string }) {
  return (
    <span
      title={`${KIND_LABEL[w.kind]} · ${w.label} · ${w.rain}`}
      className={`inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-semibold ring-1 ring-outline-soft ${className}`}
    >
      <Icon name={w.icon} size={16} className="text-accent" />
      {Math.round(w.tmax)}° <span className="font-normal text-ink-soft">/ {Math.round(w.tmin)}°</span>
      {w.kind === 'normal' && <span className="font-normal text-ink-soft">· habitual</span>}
    </span>
  )
}

/** Avisos de pasaporte de los viajes planificados (caduca antes o menos de 6 meses después). */
export function PassportAlert({ warnings, showTrip = true }: { warnings: PassportWarning[]; showTrip?: boolean }) {
  if (!warnings.length) return null
  return (
    <div className="space-y-2">
      {warnings.map((w) => {
        const red = w.level === 'before'
        const trip = showTrip ? (
          <>
            {' '}
            para{' '}
            <Link to={`/app/viajes/${w.trip.id}`} className="font-semibold underline">
              {w.trip.title}
            </Link>
          </>
        ) : null
        return (
          <div key={w.trip.id} className={`flex items-start gap-3 rounded-sm px-4 py-3 text-sm ${red ? 'bg-red-50 text-red-800' : 'bg-accent-soft/50 text-accent-ink'}`} role="alert">
            <Icon name={red ? 'error' : 'warning'} size={20} className="mt-0.5 shrink-0" />
            <span>
              {w.level === 'missing' ? (
                <>
                  Necesitarás pasaporte{trip}.{' '}
                  <Link to="/app/pasaporte" className="font-semibold underline">
                    Añádelo
                  </Link>{' '}
                  para que te avisemos si caduca.
                </>
              ) : w.level === 'before' ? (
                <>
                  Tu pasaporte caduca el <b>{formatDay(w.passport!.expires_on)}</b>, antes de terminar el viaje{trip}. Renuévalo antes de salir.
                </>
              ) : (
                <>
                  Tu pasaporte caduca el <b>{formatDay(w.passport!.expires_on)}</b>, menos de 6 meses después de volver{trip}. Muchos países exigen esos 6
                  meses de validez: compruébalo o renuévalo.
                </>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
