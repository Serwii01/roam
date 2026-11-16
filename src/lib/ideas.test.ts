import { describe, expect, it } from 'vitest'
import { findTaken, ideaZones, type TakenSight } from './ideas'
import type { SightSuggestion } from './sights'

// Kioto, y puntos a tantos km al norte (+) / sur (−) y este (+) / oeste (−) del centro.
const CENTER = { lat: 35.0116, lon: 135.7681 }
const KM_LAT = 110.57
const KM_LON = Math.cos((CENTER.lat * Math.PI) / 180) * 111.32
const at = (north: number, east: number) => ({ lat: CENTER.lat + north / KM_LAT, lon: CENTER.lon + east / KM_LON })
const idea = (title: string, north: number, east: number, url?: string): SightSuggestion => ({ title, ...at(north, east), km: Math.hypot(north, east), url })
const puesto = (name: string, north: number, east: number, extra: Partial<TakenSight> = {}): TakenSight => ({ name, ...at(north, east), ...extra })

const zones = (ideas: SightSuggestion[], taken: TakenSight[] = [], day: TakenSight[] = []) => ideaZones(ideas, { city: 'Kioto', center: CENTER, taken, day })
const titles = (z: { ideas: SightSuggestion[] }) => z.ideas.map((i) => i.title)

describe('findTaken', () => {
  const taken = [puesto('Plaza de España', 0, 0), puesto('Kiyomizu', -2, 1.5, { wiki_url: 'https://es.wikipedia.org/wiki/Kiyomizu-dera' })]

  it('mismo nombre sin tildes, mayúsculas ni signos', () => {
    expect(findTaken(idea('plaza de espana', 3, 3), taken)?.name).toBe('Plaza de España')
    expect(findTaken(idea('Plaza de España.', 3, 3), taken)?.name).toBe('Plaza de España')
  })

  it('mismo artículo de Wikipedia con otro nombre', () => {
    expect(findTaken(idea('Kiyomizu-dera', 5, 5, 'https://es.wikipedia.org/wiki/Kiyomizu-dera'), taken)?.name).toBe('Kiyomizu')
  })

  it('casi el mismo punto con otro nombre (a menos de 150 m)', () => {
    expect(findTaken(idea('Templo del agua pura', -2.05, 1.55), taken)?.name).toBe('Kiyomizu')
  })

  it('otro sitio cerca pero no encima no cuenta', () => {
    expect(findTaken(idea('Sannenzaka', -1.7, 1.5), taken)).toBeUndefined()
  })

  it('un sitio escrito a mano sin coordenadas solo se compara por nombre', () => {
    expect(findTaken(idea('Mercado Nishiki', 0.2, 0), [{ name: 'Cena en Pontocho' }])).toBeUndefined()
    expect(findTaken(idea('Mercado Nishiki', 0.2, 0), [{ name: 'mercado nishiki' }])).toBeDefined()
  })
})

describe('ideaZones', () => {
  // Ordenadas de más a menos conocidas, como las da suggestSights.
  const IDEAS = [
    idea('Fushimi Inari', -5, 0.5),
    idea('Kiyomizu-dera', -2, 1.5),
    idea('Kinkaku-ji', 3, -4),
    idea('Sannenzaka', -1.6, 1.3),
    idea('Ryoan-ji', 2.8, -4.6),
    idea('Gion', -0.8, 1),
    idea('Yasaka', -1.2, 1.2),
    idea('Nishiki', -0.2, 0.4),
    idea('Ginkaku-ji', 2, 3),
  ]

  it('no propone lo que ya está en otro día del viaje', () => {
    const z = zones(IDEAS, [puesto('Kinkaku-ji', 3, -4), puesto('Fushimi Inari Taisha', -5.02, 0.5)])
    const all = z.flatMap(titles)
    expect(all).not.toContain('Kinkaku-ji')
    expect(all).not.toContain('Fushimi Inari')
    expect(all).toContain('Ryoan-ji')
  })

  it('agrupa lo que se recorre andando y empieza por la zona con más ideas', () => {
    const [first] = zones(IDEAS)
    expect(titles(first)).toEqual(['Kiyomizu-dera', 'Sannenzaka', 'Yasaka'])
    expect(first.label).toBe('Alrededores de Kiyomizu-dera')
    expect(first.where).toMatch(/^2,\d km al sureste$/)
  })

  it('la zona del centro se llama así y no dice distancia', () => {
    const centro = zones(IDEAS).find((z) => z.label === 'Centro de Kioto')!
    expect(titles(centro)).toEqual(['Gion', 'Nishiki'])
    expect(centro.where).toBe('')
  })

  it('con sitios ya puestos ese día, primero la zona de al lado', () => {
    const z = zones(IDEAS, [], [puesto('Templo Kinkaku', 3.1, -4.1)])
    expect(z[0]).toMatchObject({ label: 'Junto a Templo Kinkaku', near: true })
    expect(titles(z[0])).toEqual(['Kinkaku-ji', 'Ryoan-ji'])
  })

  it('las ideas sueltas lejos de todo van juntas al final', () => {
    const z = zones(IDEAS)
    expect(z.at(-1)).toMatchObject({ label: 'Otros sitios', where: 'más repartidos' })
    expect(titles(z.at(-1)!)).toEqual(['Fushimi Inari', 'Ginkaku-ji'])
  })

  it('dos zonas en el centro no se llaman igual', () => {
    const labels = zones([idea('Nijo', 0.3, -1.2), idea('Pontocho', 0, 0.9), idea('Castillo', 0.4, -1.3), idea('Kamo', 0.1, 1)]).map((z) => z.label)
    expect(labels).toEqual(['Centro de Kioto', 'Alrededores de Pontocho'])
  })

  it('como mucho seis ideas por zona', () => {
    const muchas = Array.from({ length: 9 }, (_, i) => idea(`Sitio ${i}`, -2 + i * 0.05, 1.5))
    expect(zones(muchas)[0].ideas).toHaveLength(6)
  })

  it('sin ideas libres no hay zonas', () => {
    expect(zones([idea('Nishiki', 0.2, 0)], [puesto('Nishiki', 0.2, 0)])).toEqual([])
  })
})
