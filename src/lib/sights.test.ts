// Fotos de los sitios: la respuesta de Wikipedia lleva títulos normalizados y redirecciones, y hay que devolver
// cada foto con el título que se pidió.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sightPhotos, wikiTitle, wikiUrl } from './sights'

const respond = (handler: (params: URLSearchParams) => unknown) =>
  vi.stubGlobal('fetch', async (url: string) => {
    const body = handler(new URL(url).searchParams)
    return body === null ? new Response('', { status: 500 }) : new Response(JSON.stringify(body))
  })

const eiffel = { title: 'Torre Eiffel', thumbnail: { source: 'https://thumb.wikimedia.org/eiffel.jpg' }, pageimage: 'Tour_Eiffel_(cropped).jpg' }
const credit = {
  query: {
    pages: [{ title: 'Archivo:Tour Eiffel (cropped).jpg', imageinfo: [{ extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Benh">Benh &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] }],
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('wikiTitle', () => {
  it('saca el título del enlace, también con acentos', () => {
    expect(wikiTitle(wikiUrl('Museo del Prado'))).toBe('Museo del Prado')
    expect(wikiTitle(wikiUrl('Sensō-ji'))).toBe('Sensō-ji')
  })

  it('no acepta otros enlaces', () => {
    expect(wikiTitle('https://en.wikipedia.org/wiki/Eiffel_Tower')).toBeNull()
    expect(wikiTitle('https://ejemplo.com/wiki/Algo')).toBeNull()
    expect(wikiTitle(null)).toBeNull()
  })
})

describe('sightPhotos', () => {
  it('devuelve la foto con su autor y licencia', async () => {
    respond((p) => (p.get('prop') === 'pageimages' ? { query: { pages: [eiffel] } } : credit))
    expect(await sightPhotos(['Torre Eiffel'])).toEqual({
      'Torre Eiffel': { url: eiffel.thumbnail.source, page: 'https://commons.wikimedia.org/wiki/File:Tour_Eiffel_(cropped).jpg', author: 'Benh & Co', license: 'CC BY-SA 4.0' },
    })
  })

  it('sigue las redirecciones y deja fuera los artículos sin foto', async () => {
    respond((p) =>
      p.get('prop') === 'pageimages'
        ? { query: { normalized: [{ from: 'torre eiffel', to: 'Torre eiffel' }], redirects: [{ from: 'Torre eiffel', to: 'Torre Eiffel' }], pages: [eiffel, { title: 'Sin foto' }] } }
        : credit,
    )
    expect(Object.keys(await sightPhotos(['torre eiffel', 'Sin foto']))).toEqual(['torre eiffel'])
  })

  it('sin autoría la foto se enseña igual', async () => {
    respond((p) => (p.get('prop') === 'pageimages' ? { query: { pages: [eiffel] } } : null))
    const { 'Torre Eiffel': photo } = await sightPhotos(['Torre Eiffel'])
    expect(photo.url).toBe(eiffel.thumbnail.source)
    expect(photo.author).toBeNull()
  })

  it('pide de 50 en 50', async () => {
    const sizes: number[] = []
    respond((p) => {
      if (p.get('prop') === 'pageimages') sizes.push(p.get('titles')!.split('|').length)
      return { query: {} }
    })
    await sightPhotos(Array.from({ length: 120 }, (_, i) => `Sitio ${i}`))
    expect(sizes).toEqual([50, 50, 20])
  })
})
