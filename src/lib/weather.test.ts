// El tiempo de todo el viaje: tramos por parada, de qué fuente sale cada día y el resumen. Open-Meteo se simula.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stop, TripWithStops } from './db'
import { kindsLabel, segmentWeather, summarize, weatherSegments, type WeatherDay } from './weather'

const parada = (id: string, lat: number, lon: number, arrived_on: string) => ({ id, name: id, lat, lon, arrived_on, country_code: 'XX' }) as Stop

describe('weatherSegments', () => {
  it('agrupa los días seguidos en cada ciudad y quita la salida y la vuelta a casa', () => {
    const t = {
      start_date: '2026-01-10',
      end_date: '2026-01-16',
      stops: [parada('Madrid', 40.42, -3.7, '2026-01-10'), parada('Kioto', 35.01, 135.77, '2026-01-11'), parada('Tokio', 35.68, 139.69, '2026-01-14'), parada('Madrid-vuelta', 40.42, -3.7, '2026-01-16')],
    } as unknown as TripWithStops
    expect(weatherSegments(t).map((s) => [s.stop.id, s.from, s.to])).toEqual([
      ['Kioto', '2026-01-11', '2026-01-13'],
      ['Tokio', '2026-01-14', '2026-01-15'],
    ])
  })

  it('sin fechas no hay tramos', () => {
    expect(weatherSegments({ start_date: null, end_date: null, stops: [] } as unknown as TripWithStops)).toEqual([])
  })
})

describe('summarize', () => {
  const dia = (date: string, tmin: number, tmax: number, code: number, wet: number, kind: WeatherDay['kind'] = 'past'): WeatherDay => ({ date, kind, tmin, tmax, code, wet })

  it('la mínima más baja, la máxima más alta, días de lluvia y el tiempo más repetido', () => {
    const s = summarize([dia('a', 8, 15, 0, 0), dia('b', 5, 12, 61, 1), dia('c', 9, 18, 0, 0), dia('d', 7, 14, 61, 1), dia('e', 10, 19, 0, 0)])
    expect(s).toMatchObject({ tmin: 5, tmax: 19, wetDays: 2, days: 5, label: 'Despejado', icon: 'sunny', kinds: ['past'] })
  })

  it('en el clima habitual, los días de lluvia son los esperados', () => {
    expect(summarize([dia('a', 8, 15, 3, 0.3, 'normal'), dia('b', 8, 15, 3, 0.4, 'normal')])!.wetDays).toBeCloseTo(0.7)
  })

  it('sin días no hay resumen', () => {
    expect(summarize([])).toBeNull()
  })
})

describe('kindsLabel', () => {
  it('nombra las fuentes en orden', () => {
    expect(kindsLabel(['past'])).toBe('Tiempo que hizo')
    expect(kindsLabel(['normal', 'forecast'])).toBe('Pronóstico y clima habitual')
    expect(kindsLabel(['normal', 'past', 'forecast'])).toBe('Tiempo que hizo, pronóstico y clima habitual')
  })
})

describe('segmentWeather', () => {
  const calls: URL[] = []
  /** Respuesta de Open-Meteo para las fechas pedidas: en el archivo, la máxima es el año − 2000 y en 2025 llueve. */
  const daily = (url: URL) => {
    const from = Date.parse(`${url.searchParams.get('start_date')}T00:00:00Z`)
    const to = Date.parse(`${url.searchParams.get('end_date')}T00:00:00Z`)
    const time: string[] = []
    for (let t = from; t <= to; t += 86_400_000) time.push(new Date(t).toISOString().slice(0, 10))
    const year = Number(time[0].slice(0, 4))
    const archive = url.hostname.startsWith('archive')
    return {
      time,
      weather_code: time.map(() => (archive ? 3 : 61)),
      temperature_2m_max: time.map(() => (archive ? year - 2000 : 20)),
      temperature_2m_min: time.map(() => 10),
      precipitation_sum: time.map(() => (archive && year === 2025 ? 5 : 0)),
      precipitation_probability_max: time.map((_, i) => (i % 2 ? 80 : 10)),
    }
  }

  beforeEach(() => {
    calls.length = 0
    vi.useFakeTimers({ now: new Date('2026-06-01T10:00:00Z'), toFake: ['Date'] })
    vi.stubGlobal('fetch', async (u: string) => {
      const url = new URL(u)
      calls.push(url)
      return { ok: true, json: async () => ({ daily: daily(url) }) }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('un viaje de hace meses: una sola petición al archivo', async () => {
    const days = await segmentWeather(35, 135, '2026-03-01', '2026-03-03')
    expect(calls.map((c) => c.hostname)).toEqual(['archive-api.open-meteo.com'])
    expect(days.map((d) => d.kind)).toEqual(['past', 'past', 'past'])
  })

  it('alrededor de hoy: pronóstico, con lo de ayer como tiempo que hizo', async () => {
    const days = await segmentWeather(35, 135, '2026-05-30', '2026-06-03')
    expect(calls.map((c) => c.hostname)).toEqual(['api.open-meteo.com'])
    expect(days.map((d) => d.kind)).toEqual(['past', 'past', 'forecast', 'forecast', 'forecast'])
    // Probabilidad alterna 10 % / 80 %: llueve en los días con ≥ 50 %
    expect(days.filter((d) => d.kind === 'forecast').map((d) => d.wet)).toEqual([0, 1, 0])
  })

  it('más allá de 15 días: clima habitual con la media de los 3 años anteriores', async () => {
    const days = await segmentWeather(35, 135, '2026-07-10', '2026-07-12')
    expect(calls.map((c) => c.searchParams.get('start_date'))).toEqual(['2025-07-10', '2024-07-10', '2023-07-10'])
    expect(days).toHaveLength(3)
    expect(days[0]).toMatchObject({ kind: 'normal', tmax: 24, tmin: 10, code: 3 })
    expect(days[0].wet).toBeCloseTo(1 / 3)
  })

  it('un tramo entre los dos: pronóstico hasta el día 15 y clima habitual después', async () => {
    const days = await segmentWeather(35, 135, '2026-06-14', '2026-06-18')
    expect(days.map((d) => [d.date, d.kind])).toEqual([
      ['2026-06-14', 'forecast'],
      ['2026-06-15', 'forecast'],
      ['2026-06-16', 'forecast'],
      ['2026-06-17', 'normal'],
      ['2026-06-18', 'normal'],
    ])
  })

  it('el clima habitual de un tramo que cruza el año pide desde el año anterior', async () => {
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
    await segmentWeather(35, 135, '2026-12-30', '2027-01-02')
    expect(calls.map((c) => [c.searchParams.get('start_date'), c.searchParams.get('end_date')])[0]).toEqual(['2024-12-30', '2025-01-02'])
  })
})
