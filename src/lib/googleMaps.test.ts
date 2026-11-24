import { describe, expect, it } from 'vitest'
import { googleMapsDayLinks, googleMapsDirections } from './googleMaps'

const stop = { name: 'Estambul', country_code: 'TR' }
const sitio = (i: number) => ({ name: `Sitio ${i}`, lat: 41 + i / 100, lon: 29 })
const puntos = (href: string) => {
  const p = new URL(href).searchParams
  return [p.get('origin'), ...(p.get('waypoints')?.split('|') ?? []), p.get('destination')]
}

describe('googleMapsDayLinks', () => {
  it('usa las coordenadas del plan y no el nombre, que puede ser otro lugar', () => {
    const [href] = googleMapsDayLinks([{ name: 'İstiklal', lat: 41.0342, lon: 28.9789 }, sitio(1)], stop)
    expect(puntos(href)).toEqual(['41.034200,28.978900', '41.010000,29.000000'])
  })

  it('busca por nombre, ciudad y país lo que no tiene ubicación', () => {
    const [href] = googleMapsDayLinks([{ name: 'Bar de Ali', lat: null, lon: null }, sitio(1)], stop)
    expect(puntos(href)[0]).toMatch(/^Bar de Ali, Estambul, Tur/)
  })

  it('en el móvil parte la ruta de 5 en 5 sin perder ningún sitio ni cambiar el orden', () => {
    const sitios = Array.from({ length: 12 }, (_, i) => sitio(i))
    const partes = googleMapsDayLinks(sitios, stop, 'walking', 5).map(puntos)
    expect(partes.map((p) => p.length)).toEqual([5, 5, 4])
    for (let i = 1; i < partes.length; i++) expect(partes[i][0]).toBe(partes[i - 1].at(-1))
    expect([...new Set(partes.flat())]).toEqual(sitios.map((s) => `${s.lat.toFixed(6)},${s.lon.toFixed(6)}`))
  })

  it('con un sitio abre una búsqueda y sin sitios nada', () => {
    expect(googleMapsDayLinks([sitio(1)], stop)[0]).toContain('/maps/search/')
    expect(googleMapsDayLinks([], stop)).toEqual([])
  })
})

it('cómo llegar usa la ubicación si la hay y, si no, la dirección', () => {
  const destino = (x: string) => new URL(x).searchParams.get('destination')
  expect(destino(googleMapsDirections({ ...sitio(1), address: 'Calle 1' }, stop))).toBe('41.010000,29.000000')
  expect(destino(googleMapsDirections({ name: 'Hotel', lat: null, lon: null, address: 'Calle 1' }, stop))).toBe('Hotel, Calle 1')
})
