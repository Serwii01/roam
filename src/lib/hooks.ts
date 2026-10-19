import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useUser } from './auth'
import type { Country, TripWithStops } from './db'
import { computeStats, type AirportMap } from './stats'

const REF = { staleTime: Infinity, gcTime: Infinity }

export function useCountries() {
  const q = useQuery({ queryKey: ['countries'], queryFn: () => api.listCountries(), ...REF })
  const byCode = useMemo(() => new Map<string, Country>((q.data ?? []).map((c) => [c.code, c])), [q.data])
  const name = (code: string) => byCode.get(code)?.name ?? code
  return { ...q, list: q.data ?? [], byCode, name }
}

export function useSubdivisions(countryCode: string | undefined) {
  return useQuery({
    queryKey: ['subdivisions', countryCode],
    queryFn: () => api.listSubdivisions(countryCode!),
    enabled: !!countryCode,
    ...REF,
  })
}

export function useProfile() {
  const user = useUser()
  return useQuery({ queryKey: ['profile', user.id], queryFn: () => api.getProfile(user.id) })
}

export function useTrips() {
  const user = useUser()
  return useQuery({ queryKey: ['trips', user.id], queryFn: () => api.listTrips(user.id) })
}

export function useTrip(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['trip', id],
    queryFn: () => api.getTrip(id!),
    enabled: !!id,
    // Al venir de la bitácora el viaje ya está cargado: se enseña al momento y se actualiza por detrás.
    placeholderData: () => {
      for (const [, list] of qc.getQueriesData<TripWithStops[]>({ queryKey: ['trips'] })) {
        const t = list?.find((x) => x.id === id)
        if (t) return t
      }
      return undefined
    },
  })
}

export function useVisited() {
  const user = useUser()
  return useQuery({ queryKey: ['visited', user.id], queryFn: () => api.getVisited(user.id) })
}

export function usePassports() {
  return useQuery({ queryKey: ['passports'], queryFn: () => api.listPassports() })
}

export function useWishlist() {
  return useQuery({ queryKey: ['wishlist'], queryFn: () => api.listWishlist() })
}

/** Aeropuertos usados en los viajes, para calcular distancias y dibujar vuelos. */
export function useAirportMap(codes: (string | null | undefined)[]): AirportMap {
  const unique = [...new Set(codes.filter((c): c is string => !!c))].sort()
  const q = useQuery({ queryKey: ['airports', unique], queryFn: () => api.getAirports(unique), enabled: unique.length > 0, ...REF })
  return useMemo(() => new Map((q.data ?? []).map((a) => [a.iata, a])), [q.data])
}

/** Viajes + lugares + aeropuertos + estadísticas, lo que necesitan casi todas las pantallas. */
export function useTravelData() {
  const trips = useTrips()
  const visited = useVisited()
  const countries = useCountries()
  const list = useMemo(() => trips.data ?? [], [trips.data])
  const airports = useAirportMap(list.flatMap((t) => t.stops.flatMap((s) => [s.from_airport, s.to_airport])))
  const stats = useMemo(() => computeStats(list, visited.data, countries.byCode, airports), [list, visited.data, countries.byCode, airports])
  return {
    loading: trips.isLoading || visited.isLoading,
    error: trips.error ?? visited.error,
    trips: list,
    visited: visited.data,
    countries,
    airports,
    stats,
  }
}

/** Invalida todo lo que depende de los viajes tras una escritura. */
export function useInvalidateTravel() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['trips'] }),
      qc.invalidateQueries({ queryKey: ['trip'] }),
      qc.invalidateQueries({ queryKey: ['visited'] }),
    ])
}

/** Mutación que invalida los datos de viaje al terminar. */
export function useTravelMutation<A, R>(fn: (args: A) => Promise<R>) {
  const invalidate = useInvalidateTravel()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() })
}
