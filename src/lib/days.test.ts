import { describe, expect, it } from 'vitest'
import type { Sight, Stop, TripWithStops } from './db'
import { addDays, dayInfo, datesAfterEdit, datesAfterMove, isReturnHome, orderDay, reorderDay, setDayTime, sightDay, tripDays, weekday } from './days'

const COORDS = { madrid: [40.42, -3.7], kioto: [35.01, 135.77], tokio: [35.68, 139.69], getafe: [40.31, -3.73] } as const

const parada = (id: string, where: keyof typeof COORDS, arrived_on: string | null = null, position = 0): Stop =>
  ({ id, name: id, trip_id: 't1', lat: COORDS[where][0], lon: COORDS[where][1], arrived_on, position }) as Stop

/** Madrid → Kioto → Tokio → vuelta a Madrid, del 10 al 20 de enero. */
const viaje = () => [parada('ida', 'madrid', '2026-01-10'), parada('kioto', 'kioto', '2026-01-11'), parada('tokio', 'tokio', '2026-01-15'), parada('vuelta', 'madrid', '2026-01-20')]
const END = '2026-01-20'

describe('fechas', () => {
  it('addDays cruza meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    // El cambio de hora no descuadra los días
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('weekday en español', () => {
    expect(weekday('2026-11-16')).toBe('lunes')
  })
})

describe('isReturnHome', () => {
  it('la última parada en el mismo sitio que la salida es la vuelta', () => {
    expect(isReturnHome(viaje(), 3)).toBe(true)
  })

  it('vale a menos de 30 km (otro aeropuerto de la misma ciudad)', () => {
    const s = viaje()
    s[3] = parada('vuelta', 'getafe', END)
    expect(isReturnHome(s, 3)).toBe(true)
  })

  it('ni la primera, ni una intermedia, ni una última lejos de casa', () => {
    const s = viaje()
    expect(isReturnHome(s, 0)).toBe(false)
    expect(isReturnHome(s, 2)).toBe(false)
    expect(isReturnHome(s.slice(0, 3), 2)).toBe(false)
    expect(isReturnHome([s[0]], 0)).toBe(false)
  })
})

describe('datesAfterEdit', () => {
  it('mover la llegada arrastra las siguientes los mismos días', () => {
    const out = datesAfterEdit(viaje(), 1, '2026-01-12', END)
    expect(Object.fromEntries(out)).toEqual({ kioto: '2026-01-12', tokio: '2026-01-16' })
  })

  it('no pasa del último día del viaje y la vuelta se queda en él', () => {
    const out = datesAfterEdit(viaje(), 1, '2026-01-18', END)
    expect(Object.fromEntries(out)).toEqual({ kioto: '2026-01-18', tokio: END })
  })

  it('las anteriores no pueden quedar después', () => {
    const out = datesAfterEdit(viaje(), 2, '2026-01-09', END)
    expect(Object.fromEntries(out)).toEqual({ tokio: '2026-01-09', ida: '2026-01-09', kioto: '2026-01-09' })
  })

  it('poner fecha a una parada sin fecha no mueve las demás, salvo que queden antes', () => {
    const s = viaje()
    s[1] = parada('kioto', 'kioto', null)
    expect(Object.fromEntries(datesAfterEdit(s, 1, '2026-01-12', END))).toEqual({ kioto: '2026-01-12' })
    expect(Object.fromEntries(datesAfterEdit(s, 1, '2026-01-16', END))).toEqual({ kioto: '2026-01-16', tokio: '2026-01-16' })
  })

  it('quitar la fecha solo cambia esa parada', () => {
    expect(Object.fromEntries(datesAfterEdit(viaje(), 1, null, END))).toEqual({ kioto: null })
  })
})

describe('datesAfterMove', () => {
  it('los días se quedan en su sitio y cambian las ciudades', () => {
    const [ida, kioto, tokio, vuelta] = viaje()
    const out = datesAfterMove([ida, tokio, kioto, vuelta], END)
    expect(Object.fromEntries(out)).toEqual({ tokio: '2026-01-11', kioto: '2026-01-15' })
  })

  it('la vuelta a casa va el último día', () => {
    const s = viaje()
    s[3] = parada('vuelta', 'madrid', '2026-01-18')
    expect(datesAfterMove(s, END).get('vuelta')).toBe(END)
  })

  it('sin cambios no devuelve nada', () => {
    expect(datesAfterMove(viaje(), END).size).toBe(0)
  })
})

describe('tripDays', () => {
  const t = (p: Partial<TripWithStops>) => ({ start_date: null, end_date: null, stops: [], ...p }) as unknown as TripWithStops

  it('de la ida a la vuelta, ambas incluidas', () => {
    expect(tripDays(t({ start_date: '2026-03-28', end_date: '2026-03-30' }))).toEqual(['2026-03-28', '2026-03-29', '2026-03-30'])
  })

  it('sin fechas del viaje, de la primera a la última parada', () => {
    expect(tripDays(t({ stops: viaje() }))).toHaveLength(11)
  })

  it('sin ninguna fecha no hay días', () => {
    expect(tripDays(t({}))).toEqual([])
  })

  it('como mucho 60 días', () => {
    expect(tripDays(t({ start_date: '2026-01-01', end_date: '2026-12-31' }))).toHaveLength(60)
  })
})

describe('dayInfo', () => {
  it('el día de salida se está en casa camino del primer destino', () => {
    expect(dayInfo(viaje(), '2026-01-10')).toMatchObject({ stop: { id: 'ida' }, travel: 'out', next: { id: 'kioto' } })
  })

  it('un día cualquiera, la última parada a la que se ha llegado', () => {
    expect(dayInfo(viaje(), '2026-01-13')).toMatchObject({ stop: { id: 'kioto' }, travel: null })
  })

  it('el día de la vuelta', () => {
    expect(dayInfo(viaje(), END)).toMatchObject({ stop: { id: 'vuelta' }, travel: 'back' })
  })

  it('sin paradas no hay parada', () => {
    expect(dayInfo([], END)).toEqual({ day: END, stop: undefined, travel: null })
  })
})

describe('sightDay', () => {
  const days = ['2026-01-10', '2026-01-11', '2026-01-12']
  const sitio = (p: Partial<Sight>) => ({ id: 's', stop_id: 'kioto', day: null, ...p }) as Sight

  it('el día propio del sitio manda', () => {
    expect(sightDay(sitio({ day: '2026-01-12' }), viaje(), days)).toBe('2026-01-12')
  })

  it('si no, el de llegada a su parada', () => {
    expect(sightDay(sitio({}), viaje(), days)).toBe('2026-01-11')
  })

  it('una llegada antes del viaje va al primer día', () => {
    expect(sightDay(sitio({}), viaje(), ['2026-01-12', '2026-01-13'])).toBe('2026-01-12')
  })

  it('sin parada con fecha, el primer día', () => {
    expect(sightDay(sitio({ stop_id: 'otra' }), viaje(), days)).toBe('2026-01-10')
  })
})

describe('orden de los sitios del día', () => {
  const s = (id: string, position: number, time: string | null = null) => ({ id, position, time, created_at: '2026-01-01T00:00:00Z' })
  const dia = () => [s('museo', 0, '09:00:00'), s('nota', 1), s('cena', 2, '21:00')]

  it('orderDay respeta la posición si las horas van en orden', () => {
    expect(orderDay([s('b', 1, '10:00'), s('a', 0), s('c', 2, '11:00')]).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('orderDay ordena por hora los planes antiguos con las horas desordenadas', () => {
    expect(orderDay([s('tarde', 0, '18:00'), s('mañana', 1, '08:00'), s('sin', 2)]).map((x) => x.id)).toEqual(['mañana', 'tarde', 'sin'])
  })

  it('al arrastrar, las horas se quedan en su sitio y se mueven las actividades', () => {
    expect(reorderDay(dia(), 2, 0)).toEqual([
      { id: 'cena', position: 0, time: '09:00' },
      { id: 'museo', position: 1, time: '21:00' },
      { id: 'nota', position: 2 },
    ])
  })

  it('arrastrar al mismo sitio no cambia nada', () => {
    expect(reorderDay(dia(), 1, 1)).toEqual([])
  })

  it('poner una hora coloca el sitio entre los demás', () => {
    expect(setDayTime(dia(), 'nota', '10:00')).toEqual([{ id: 'nota', time: '10:00' }])
  })

  it('una hora más tarde que todas lo manda detrás de la última con hora', () => {
    expect(setDayTime(dia(), 'museo', '22:00')).toEqual([
      { id: 'nota', position: 0 },
      { id: 'cena', position: 1 },
      { id: 'museo', position: 2, time: '22:00' },
    ])
  })

  it('quitar la hora solo quita la hora', () => {
    expect(setDayTime(dia(), 'cena', null)).toEqual([{ id: 'cena', time: null }])
  })

  it('un sitio que no está no da cambios', () => {
    expect(setDayTime(dia(), 'otro', '10:00')).toEqual([])
  })
})
