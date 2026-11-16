import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { formatDay } from './DatePicker'
import { Flag, plural } from './ui'
import type { TripWithStops } from '../lib/db'
import type { PassportWarning } from '../lib/passportCheck'
import { KIND_LABEL, kindsLabel, segmentWeather, summarize, weatherFor, weatherSegments, type DayWeather, type WeatherSegment, type WeatherSummary } from '../lib/weather'

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

const wetText = (s: WeatherSummary) => {
  const n = Math.round(s.wetDays)
  const habitual = s.kinds.length === 1 && s.kinds[0] === 'normal'
  if (!n) return habitual ? 'Casi nunca llueve' : 'Sin lluvia'
  return `${habitual ? '~' : ''}${plural(n, 'día de lluvia', 'días de lluvia')} de ${s.days}`
}
const temps = (s: WeatherSummary) => `${Math.round(s.tmin)}° – ${Math.round(s.tmax)}°`

/**
 * El tiempo de todo el viaje: temperaturas mínima y máxima, días de lluvia y el tiempo más repetido, en total y
 * por parada. Lo que hizo en un viaje pasado, el pronóstico o el clima habitual, según las fechas.
 */
export function TripWeatherSummary({ trip }: { trip: TripWithStops }) {
  const segments = useMemo(() => weatherSegments(trip), [trip])
  const q = useQuery({
    queryKey: ['trip-weather', segments.map((s) => `${s.stop.lat.toFixed(2)},${s.stop.lon.toFixed(2)}@${s.from}~${s.to}`).join('|')],
    queryFn: () => Promise.all(segments.map(async (s) => ({ s, days: await segmentWeather(s.stop.lat, s.stop.lon, s.from, s.to) }))),
    enabled: segments.length > 0,
    staleTime: 3 * 3_600_000,
    retry: 1,
  })
  if (!segments.length || q.isError) return null
  if (!q.data) return <div className="card h-28 animate-pulse bg-surface-container" />
  const all = summarize(q.data.flatMap((x) => x.days))
  if (!all) return null
  const perStop = q.data.map(({ s, days }) => ({ s, sum: summarize(days) })).filter((x): x is { s: WeatherSegment; sum: WeatherSummary } => !!x.sum)

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <Icon name={all.icon} size={44} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-bold">{temps(all)}</div>
          <div className="text-sm">
            {all.label} · {wetText(all)}
          </div>
        </div>
        <span className="label-stamp text-ink-soft">{kindsLabel(all.kinds)}</span>
      </div>
      {perStop.length > 1 && (
        <ul className="mt-4 divide-y divide-surface-container border-t border-surface-container text-sm">
          {perStop.map(({ s, sum }) => (
            <li key={`${s.stop.id}${s.from}`} className="flex items-center gap-2 py-2">
              <Flag code={s.stop.country_code} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{s.stop.name}</span>{' '}
                <span className="text-xs text-ink-soft">{s.from === s.to ? formatDay(s.from) : `${formatDay(s.from)} – ${formatDay(s.to)}`}</span>
              </span>
              <Icon name={sum.icon} size={18} className="shrink-0 text-accent" />
              <span className="w-20 shrink-0 text-right tabular-nums">{temps(sum)}</span>
              <span className="hidden w-36 shrink-0 text-right text-xs text-ink-soft sm:block">{wetText(sum)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-ink-soft">
        Datos de{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noreferrer" className="underline">
          Open-Meteo
        </a>{' '}
        (CC BY 4.0). Sin contar los días de salida y vuelta a casa.
      </p>
    </div>
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
