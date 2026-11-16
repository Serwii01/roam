// País al llegar, contra las siluetas reales de public/geo/world.json (las mismas que usa la app).
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Shapes } from './countries'
import type { Stop, TripWithStops } from './db'
import { arrivalCountry, countryAt, nearestCountry } from './welcome'

const shapes = JSON.parse(fs.readFileSync(new URL('../../public/geo/world.json', import.meta.url), 'utf8')) as Shapes

const parada = (country_code: string, lon: number, lat: number) => ({ id: country_code + lon, country_code, lon, lat }) as Stop
const viaje = (...stops: Stop[]) => ({ id: 't1', stops }) as unknown as TripWithStops
const MADRID = parada('ES', -3.7, 40.42)

describe('countryAt', () => {
  it('dentro de las siluetas', () => {
    expect(countryAt(shapes, 2.17, 41.39)).toBe('ES') // Barcelona
    expect(countryAt(shapes, -73.78, 40.64)).toBe('US') // JFK
    expect(countryAt(shapes, 1.52, 42.51)).toBe('AD')
  })

  it('en el mar no hay país', () => {
    expect(countryAt(shapes, 5, 40)).toBeNull()
  })
})

describe('nearestCountry', () => {
  // Ciudades de costa que la silueta simplificada deja «en el mar».
  const COSTA: [string, number, number, string][] = [
    ['Estambul', 28.97, 41.01, 'TR'],
    ['Reikiavik', -21.94, 64.15, 'IS'],
    ['Keflavík', -22.6, 63.98, 'IS'],
    ['Suva', 178.44, -18.14, 'FJ'],
    ['Malé', 73.51, 4.17, 'MV'],
    ['Changi', 103.99, 1.36, 'SG'],
    ['Venecia', 12.33, 45.44, 'IT'],
    ['Tenerife Sur', -16.57, 28.04, 'ES'],
    ['Hong Kong', 114.17, 22.3, 'HK'],
    ['Copenhague', 12.57, 55.68, 'DK'],
    ['Dubrovnik', 18.09, 42.65, 'HR'],
    ['Mónaco', 7.42, 43.74, 'MC'],
    ['Bali', 115.17, -8.75, 'ID'],
    ['Mauricio', 57.68, -20.43, 'MU'],
    ['Funchal', -16.91, 32.65, 'PT'],
    ['Baréin', 50.58, 26.22, 'BH'],
    ['Haneda', 139.78, 35.55, 'JP'],
    ['Kansai', 135.24, 34.43, 'JP'],
  ]

  it.each(COSTA)('%s', (_, lon, lat, code) => {
    expect(countryAt(shapes, lon, lat)).toBeNull()
    expect(nearestCountry(shapes, lon, lat, 15)).toBe(code)
  })

  it('en mar abierto no da ninguno', () => {
    expect(nearestCountry(shapes, 5, 40, 15)).toBeNull() // Mediterráneo, a 60 km de Mallorca
    expect(nearestCountry(shapes, 3, 56, 15)).toBeNull() // mar del Norte
  })
})

describe('arrivalCountry', () => {
  it('en la costa de un país del viaje', () => {
    expect(arrivalCountry(shapes, viaje(MADRID, parada('TR', 28.97, 41.01)), 28.98, 41.0)).toBe('TR')
  })

  it('en una isla que el mapa no tiene, la parada cercana', () => {
    // Ibiza desaparece al simplificar las siluetas
    expect(arrivalCountry(shapes, viaje(MADRID, parada('ES', 1.43, 38.91)), 1.37, 38.87)).toBe('ES')
    // Azores, a 900 km de Portugal continental
    expect(arrivalCountry(shapes, viaje(MADRID, parada('PT', -25.67, 37.74)), -25.7, 37.75)).toBe('PT')
  })

  it('en un aeropuerto de frontera, el país de la parada', () => {
    // Ginebra: la silueta simplificada deja el aeropuerto en Francia
    expect(countryAt(shapes, 6.11, 46.24)).toBe('FR')
    expect(arrivalCountry(shapes, viaje(MADRID, parada('CH', 6.14, 46.2)), 6.11, 46.24)).toBe('CH')
  })

  it('si el país es del viaje, manda la silueta aunque haya una parada de otro país cerca', () => {
    expect(arrivalCountry(shapes, viaje(MADRID, parada('FR', 6.13, 45.9), parada('CH', 6.14, 46.2)), 6.11, 46.24)).toBe('FR')
  })

  it('en otro país lejos de las paradas, ese país (no sale sello)', () => {
    expect(arrivalCountry(shapes, viaje(MADRID, parada('JP', 139.69, 35.68)), -9.14, 38.72)).toBe('PT')
  })

  it('en el mar y lejos de todo, ninguno', () => {
    expect(arrivalCountry(shapes, viaje(MADRID, parada('JP', 139.69, 35.68)), -30, 30)).toBeNull()
  })
})
