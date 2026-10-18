// Ruta de un vuelo por su número (IB6251 → Madrid-Barajas → Nueva York JFK) con adsbdb: API pública,
// gratuita y sin clave, de código abierto (https://www.adsbdb.com · https://github.com/mrjackwills/adsbdb).
// Solo da el origen y el destino habituales de ese número de vuelo, no horarios.

export interface FlightAirport {
  iata: string
  name: string
  city: string
  countryCode: string
  lat: number
  lon: number
}

export interface FlightRoute {
  flight: string
  airline: string
  from: FlightAirport
  to: FlightAirport
}

interface AdsbAirport {
  iata_code: string
  name: string
  municipality: string
  country_iso_name: string
  latitude: number
  longitude: number
}

/** IB6251, «ib 6251», IBE6251 → IB6251 (o null si no parece un número de vuelo). */
export function normalizeFlight(s: string): string | null {
  const v = s.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(v) && /\d/.test(v.slice(2)) ? v : null
}

const cache = new Map<string, Promise<FlightRoute | null>>()

export function lookupFlight(input: string): Promise<FlightRoute | null> {
  const code = normalizeFlight(input)
  if (!code) return Promise.resolve(null)
  if (!cache.has(code)) {
    const p = fetch(`https://api.adsbdb.com/v0/callsign/${code}`, { signal: AbortSignal.timeout(10_000) })
      .then(async (res) => {
        if (!res.ok) return null
        const json = (await res.json()) as { response: { flightroute?: { callsign_iata?: string; airline?: { name: string }; origin: AdsbAirport; destination: AdsbAirport } } | string }
        const r = typeof json.response === 'object' ? json.response.flightroute : undefined
        if (!r?.origin?.iata_code || !r.destination?.iata_code) return null
        const ap = (a: AdsbAirport): FlightAirport => ({ iata: a.iata_code, name: a.name, city: a.municipality, countryCode: a.country_iso_name, lat: a.latitude, lon: a.longitude })
        return { flight: r.callsign_iata ?? code, airline: r.airline?.name ?? '', from: ap(r.origin), to: ap(r.destination) }
      })
      .catch((e) => {
        cache.delete(code)
        throw e
      })
    cache.set(code, p)
  }
  return cache.get(code)!
}
