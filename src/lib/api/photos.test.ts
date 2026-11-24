// Enlaces firmados de las fotos: volver a firmarlos cuando fallan (caducados en la caché del móvil) y avisar para
// que las fotos se repinten. Supabase se simula.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSignedUrls = vi.fn()
vi.mock('../supabase', () => ({
  must: (r: unknown) => r,
  supabase: { storage: { from: () => ({ createSignedUrls }) }, auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('../push', () => ({ notifyJoin: () => {}, flushNotifications: () => {}, setSaveSubscription: () => {} }))
vi.mock('../images', () => ({ prepareImage: async (f: File) => f, THUMB_MAX: 640 }))

let api: typeof import('./supabase')['supabaseApi']
let changes = 0
let firma = 0

beforeEach(async () => {
  vi.resetModules()
  vi.useRealTimers()
  createSignedUrls.mockReset()
  createSignedUrls.mockImplementation(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://x/${path}?v=${++firma}` })), error: null }))
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  changes = 0
  const links = await import('../photoLinks')
  const original = links.photoLinksChanged
  vi.spyOn(links, 'photoLinksChanged').mockImplementation(() => {
    changes++
    original()
  })
  api = (await import('./supabase')).supabaseApi
})

describe('refreshPhotos', () => {
  it('firma una foto sin enlace (recién subida) con su miniatura y avisa', async () => {
    expect(api.photoThumbUrl('u/t/a.jpg')).toBe('')
    await api.refreshPhotos(['u/t/a.jpg'])
    expect(createSignedUrls).toHaveBeenCalledWith(['u/t/a.jpg', 'u/t/a.t.jpg'], expect.any(Number))
    expect(api.photoThumbUrl('u/t/a.jpg')).toMatch(/a\.t\.jpg/)
    expect(api.photoUrl('u/t/a.jpg')).toMatch(/a\.jpg/)
    expect(changes).toBe(1)
  })

  it('junta en una petición las fotos que fallan seguidas', async () => {
    await Promise.all([api.refreshPhotos(['u/t/a.jpg']), api.refreshPhotos(['u/t/b.jpg']), api.refreshPhotos(['u/t/c.jpg'])])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(6)
  })

  it('vuelve a firmar aunque el enlace guardado no haya caducado (si ha fallado, no vale)', async () => {
    await api.refreshPhotos(['u/t/a.jpg'])
    const antes = api.photoThumbUrl('u/t/a.jpg')
    vi.useFakeTimers({ now: Date.now() + 6 * 60_000, toFake: ['Date'] })
    await api.refreshPhotos(['u/t/a.jpg'])
    expect(api.photoThumbUrl('u/t/a.jpg')).not.toBe(antes)
  })

  it('no reintenta la misma foto en bucle: una vez cada 5 minutos', async () => {
    await api.refreshPhotos(['u/t/a.jpg'])
    await api.refreshPhotos(['u/t/a.jpg'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('sin conexión no rompe: la foto se queda sin enlace hasta el siguiente intento', async () => {
    createSignedUrls.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.refreshPhotos(['u/t/a.jpg'])).resolves.toBeUndefined()
    expect(api.photoThumbUrl('u/t/a.jpg')).toBe('')
  })
})
