import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadWorldShapes } from '../lib/countries'
import type { Stop, TripWithStops } from '../lib/db'
import { useProfile, useTravelData } from '../lib/hooks'
import { useUser } from '../lib/auth'
import { tripCardData } from '../lib/shareData'
import { activeTrip, localDate } from '../lib/today'
import { ARRIVAL_ENABLED_EVENT, arrivalCountry, arrivalSeen, arrivalStampsEnabled, arrivalStop, currentPosition, markArrivalSeen } from '../lib/welcome'
import { Icon } from './Icon'
import { Stamp } from './Stamp'

const ShareSheet = lazy(() => import('./ShareSheet').then((m) => ({ default: m.ShareSheet })))

/**
 * Durante un viaje, al abrir la app en un país de destino por primera vez: un sello a pantalla completa. Solo si se
 * ha activado en Hoy. Para probarlo sin moverse: ?sello=TR (con ?fecha=AAAA-MM-DD, otro día).
 */
export function ArrivalStamp() {
  const user = useUser()
  const { trips, stats, airports, countries } = useTravelData()
  const home = useProfile().data?.home_country
  const [params, setParams] = useSearchParams()
  const [arrival, setArrival] = useState<{ trip: TripWithStops; stop: Stop; number: number | null } | null>(null)
  const [sharing, setSharing] = useState(false)
  const forced = params.get('sello')?.toUpperCase()
  const fixedDay = params.get('fecha')
  const active = useMemo(() => activeTrip(trips, fixedDay && /^\d{4}-\d{2}-\d{2}$/.test(fixedDay) ? fixedDay : localDate()), [trips, fixedDay])
  const trip = active?.trip
  const visited = stats.countries

  const celebrate = useCallback(
    (country: string, again: boolean) => {
      const stop = trip && arrivalStop(trip, country, home)
      if (!trip || !stop || (!again && arrivalSeen(user.id, trip.id, country))) return
      markArrivalSeen(user.id, trip.id, country)
      setArrival({ trip, stop, number: visited.includes(country) ? null : visited.length + 1 })
      navigator.vibrate?.([30, 50, 140])
    },
    [trip, home, user.id, visited],
  )

  useEffect(() => {
    if (!trip || !forced) return
    celebrate(forced, true)
    setParams(
      (p) => {
        p.delete('sello')
        return p
      },
      { replace: true },
    )
  }, [trip, forced, celebrate, setParams])

  // Al abrir la app, al volver a ella (lo normal al aterrizar) y al activar el sello.
  useEffect(() => {
    if (!trip || !('geolocation' in navigator)) return
    const check = async () => {
      if (document.visibilityState !== 'visible' || !arrivalStampsEnabled()) return
      try {
        const [{ coords }, shapes] = await Promise.all([currentPosition(), loadWorldShapes()])
        const country = arrivalCountry(shapes, trip, coords.longitude, coords.latitude)
        if (country) celebrate(country, false)
      } catch {
        // Sin permiso o sin señal: se vuelve a mirar la próxima vez.
      }
    }
    void check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener(ARRIVAL_ENABLED_EVENT, check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener(ARRIVAL_ENABLED_EVENT, check)
    }
  }, [trip, celebrate])

  if (sharing && arrival)
    return (
      <Suspense fallback={null}>
        <ShareSheet data={tripCardData(arrival.trip, airports, countries.name)} onClose={() => (setSharing(false), setArrival(null))} />
      </Suspense>
    )
  if (!arrival) return null
  const { stop, number } = arrival
  const country = countries.name(stop.country_code)

  return (
    <div role="dialog" aria-modal="true" aria-label={`Bienvenido a ${country}`} className="fixed inset-0 z-[70] grid place-items-center bg-night/95 p-6 text-center text-white">
      <div className="flex max-w-md flex-col items-center">
        <div className="label-stamp text-white/70">{number ? `País nº ${number}` : 'Has vuelto'}</div>
        <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight md:text-5xl">Bienvenido a {country}</h2>
        <div className="stamp-drop my-10 scale-125 text-ink [animation-delay:250ms]">
          <Stamp stampKey={`${arrival.trip.id}-${stop.country_code}`} countryCode={stop.country_code} countryName={country} place={stop.name} date={localDate()} airport={stop.transport_in === 'plane' ? stop.to_airport : null} />
        </div>
        <p className="text-white/75">Se quedará en tu pasaporte cuando el viaje esté marcado como realizado.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-accent" onClick={() => setSharing(true)}>
            <Icon name="ios_share" size={18} /> Compartir
          </button>
          <button type="button" className="btn bg-white/15 text-white hover:bg-white/25" onClick={() => setArrival(null)} autoFocus>
            Seguir viajando
          </button>
        </div>
      </div>
    </div>
  )
}
