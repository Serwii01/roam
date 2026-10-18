// Aviso de pasaporte para los viajes planificados. Muchos países exigen que el pasaporte siga siendo
// válido 6 meses después de la entrada o la salida. Solo se avisa si el viaje sale de la UE/EEE/Suiza
// (dentro, a los españoles les basta el DNI).
import type { Passport, TripWithStops } from './db'
import { EU_EEA } from './packing'

export interface PassportWarning {
  trip: TripWithStops
  level: 'missing' | 'before' | 'soon'
  passport?: Passport
}

const addMonths = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}

export function passportWarnings(trips: TripWithStops[], passports: Passport[], home = 'ES'): PassportWarning[] {
  const today = new Date().toISOString().slice(0, 10)
  const out: PassportWarning[] = []
  for (const t of trips) {
    if (t.status !== 'planned') continue
    const start = t.start_date
    const end = t.end_date ?? t.start_date
    if (end && end < today) continue
    const countries = [...new Set(t.stops.map((s) => s.country_code))].filter((c) => c !== home)
    if (!countries.some((c) => !EU_EEA.has(c))) continue
    const valid = passports.filter((p) => p.expires_on).sort((a, b) => (b.expires_on ?? '').localeCompare(a.expires_on ?? ''))[0]
    if (!passports.length) out.push({ trip: t, level: 'missing' })
    else if (valid?.expires_on && start && valid.expires_on < (end ?? start)) out.push({ trip: t, level: 'before', passport: valid })
    else if (valid?.expires_on && end && valid.expires_on < addMonths(end, 6)) out.push({ trip: t, level: 'soon', passport: valid })
  }
  return out
}
