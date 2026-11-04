// Fotos de los sitios: la respuesta de Wikipedia lleva títulos normalizados y redirecciones, y hay que devolver
// cada foto con el título que se pidió.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { guessSightPhoto, sightPhotos, wikiTitle, wikiUrl } from './sights'

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

describe('guessSightPhoto', () => {
  const page = (title: string, index = 1) => ({ title, index, thumbnail: { source: `https://thumb.wikimedia.org/${index}.jpg` }, pageimage: `${title}.jpg` })
  /** Responde a la búsqueda según la web a la que se pregunta. */
  const answer = (pages: Record<string, unknown[]>) =>
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url)
      const search = u.searchParams.get('generator') === 'search'
      return new Response(JSON.stringify({ query: { pages: search ? (pages[u.hostname.split('.')[0]] ?? []) : [] } }))
    })
  const guess = (name: string) => guessSightPhoto(name, 41.03, 29.01, 3)

  it('entiende «Distrito de», la ciudad tras la coma, las aclaraciones y el nombre sin tildes', async () => {
    answer({ es: [page('Distrito de Üsküdar')] })
    expect((await guess('Uskudar'))?.url).toContain('1.jpg')
    answer({ es: [page('Balat (Estambul)')] })
    expect(await guess('Balat')).not.toBeNull()
    answer({ en: [page('Kabataş, Beyoğlu')] })
    expect(await guess('Kabatas')).not.toBeNull()
    answer({ en: [page('Kadıköy')] })
    expect(await guess('Kadikoy')).not.toBeNull()
  })

  it('prefiere Wikipedia en español', async () => {
    answer({ es: [page('Kuzguncuk', 1)], en: [page('Kuzguncuk', 2)] })
    expect((await guess('Kuzguncuk'))?.url).toContain('1.jpg')
  })

  it('no acepta la foto de otro sitio cercano', async () => {
    answer({ es: [page('Palacio Feriye')], en: [page('Karacaahmet Cemetery')], commons: [{ title: 'File:Istanbul 2013.jpg', imageinfo: [{ thumburl: 'https://x/y.jpg' }] }] })
    expect(await guess('Hafiz Mustafa')).toBeNull()
  })

  it('si no hay artículo, busca entre las fotos de Commons de ese punto', async () => {
    answer({ commons: [{ title: 'File:Kabataş Mars 2013.jpg', imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/k.jpg', extmetadata: { Artist: { value: 'Ana' }, LicenseShortName: { value: 'CC BY 4.0' } } }] }] })
    expect(await guess('Kabatas')).toEqual({ url: 'https://thumb.wikimedia.org/k.jpg', page: 'https://commons.wikimedia.org/wiki/File%3AKabata%C5%9F_Mars_2013.jpg', author: 'Ana', license: 'CC BY 4.0' })
  })

  it('un nombre demasiado corto no se busca', async () => {
    answer({ es: [page('Ab')] })
    expect(await guess('Ab')).toBeNull()
  })
})
