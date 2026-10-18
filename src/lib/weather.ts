// El tiempo de cada parada con Open-Meteo (gratis para uso no comercial, sin clave; datos CC BY 4.0):
//  - pronóstico si la fecha está entre hace 2 meses y dentro de 15 días,
//  - lo que hizo ese día en viajes ya pasados (archivo histórico),
//  - el clima habitual (media de los 3 años anteriores, ±3 días) en fechas más lejanas.
// https://open-meteo.com · Solo se envían las coordenadas y las fechas.

export interface DayWeather {
  kind: 'forecast' | 'past' | 'normal'
  tmax: number
  tmin: number
  code: number
  label: string
  icon: string
  /** «40% de lluvia», «3 mm», «Llueve 2 de cada 10 días». */
  rain: string
  /** Probabilidad (0-1) de un día de lluvia, para las sugerencias de equipaje. */
  wet: number
}

const WMO: { codes: number[]; label: string; icon: string }[] = [
  { codes: [0], label: 'Despejado', icon: 'sunny' },
  { codes: [1, 2], label: 'Poco nuboso', icon: 'partly_cloudy_day' },
  { codes: [3], label: 'Nublado', icon: 'cloud' },
  { codes: [45, 48], label: 'Niebla', icon: 'foggy' },
  { codes: [51, 53, 55, 56, 57], label: 'Llovizna', icon: 'rainy' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: 'Lluvia', icon: 'rainy' },
  { codes: [71, 73, 75, 77, 85, 86], label: 'Nieve', icon: 'weather_snowy' },
  { codes: [95, 96, 99], label: 'Tormenta', icon: 'thunderstorm' },
]
export const describeCode = (code: number) => {
  const w = WMO.find((x) => x.codes.includes(code))
  return { label: w?.label ?? 'Variable', icon: w?.icon ?? 'partly_cloudy_day' }
}

const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const todayUtc = () => Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)

interface Daily {
  time: string[]
  weather_code: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  precipitation_sum?: number[]
  precipitation_probability_max?: (number | null)[]
}

async function get(host: string, params: Record<string, string>): Promise<Daily> {
  const res = await fetch(`https://${host}/v1/${host.startsWith('archive') ? 'archive' : 'forecast'}?${new URLSearchParams({ timezone: 'auto', ...params })}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const json = (await res.json()) as { daily?: Daily }
  if (!json.daily?.time?.length) throw new Error('Sin datos del tiempo')
  return json.daily
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const mode = (xs: number[]) => {
  const c = new Map<number, number>()
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1)
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2
}

const cache = new Map<string, Promise<DayWeather>>()

export function weatherFor(lat: number, lon: number, date: string): Promise<DayWeather> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}@${date}`
  if (!cache.has(key)) {
    const p = load(lat, lon, date).catch((e) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, p)
  }
  return cache.get(key)!
}

async function load(lat: number, lon: number, date: string): Promise<DayWeather> {
  const where = { latitude: lat.toFixed(3), longitude: lon.toFixed(3) }
  const t = Date.parse(`${date}T00:00:00Z`)
  const diff = Math.round((t - todayUtc()) / DAY)

  if (diff >= -60 && diff <= 15) {
    const d = await get('api.open-meteo.com', { ...where, start_date: date, end_date: date, daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' })
    const code = d.weather_code[0]
    const prob = d.precipitation_probability_max?.[0]
    const mm = d.precipitation_sum?.[0] ?? 0
    return {
      kind: diff < 0 ? 'past' : 'forecast',
      tmax: d.temperature_2m_max[0],
      tmin: d.temperature_2m_min[0],
      code,
      ...describeCode(code),
      rain: diff >= 0 && prob != null ? `${Math.round(prob)}% de lluvia` : mm >= 0.5 ? `${mm.toFixed(0)} mm` : 'Sin lluvia',
      wet: diff >= 0 && prob != null ? prob / 100 : mm >= 1 ? 1 : 0,
    }
  }

  if (diff < -60) {
    const d = await get('archive-api.open-meteo.com', { ...where, start_date: date, end_date: date, daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' })
    const mm = d.precipitation_sum?.[0] ?? 0
    return { kind: 'past', tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0], code: d.weather_code[0], ...describeCode(d.weather_code[0]), rain: mm >= 0.5 ? `${mm.toFixed(0)} mm` : 'Sin lluvia', wet: mm >= 1 ? 1 : 0 }
  }

  // Clima habitual: los mismos días (±3) de los 3 años anteriores al último completo.
  const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5)
  const base = new Date().getUTCFullYear() - 1
  const years = [base, base - 1, base - 2]
  const all = await Promise.all(
    years.map((y) => {
      const c = Date.parse(`${y}-${md}T00:00:00Z`)
      return get('archive-api.open-meteo.com', { ...where, start_date: iso(c - 3 * DAY), end_date: iso(c + 3 * DAY), daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' }).catch(() => null)
    }),
  )
  const ok = all.filter((d): d is Daily => !!d)
  if (!ok.length) throw new Error('Sin datos del clima')
  const tmax = avg(ok.flatMap((d) => d.temperature_2m_max))
  const tmin = avg(ok.flatMap((d) => d.temperature_2m_min))
  const rainDays = ok.flatMap((d) => d.precipitation_sum ?? []).map((mm) => (mm >= 1 ? 1 : 0))
  const wet = avg(rainDays)
  const code = mode(ok.flatMap((d) => d.weather_code))
  return { kind: 'normal', tmax, tmin, code, ...describeCode(code), rain: `Llueve ${Math.round(wet * 10)} de cada 10 días`, wet }
}

export const KIND_LABEL: Record<DayWeather['kind'], string> = {
  forecast: 'Pronóstico',
  past: 'Tiempo que hizo',
  normal: 'Clima habitual (media de 3 años)',
}
