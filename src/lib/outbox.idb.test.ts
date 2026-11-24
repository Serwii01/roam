// Cola de cambios sin conexión: si esto falla, se pierde o se duplica lo que el usuario apuntó sin cobertura.
// outbox.ts guarda su estado en el módulo: cada prueba lo carga de nuevo, y «reabrir la app» es volver a cargarlo.
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from './api/types'
import type { Expense, Photo, TripWithStops } from './db'

// useOutbox es un hook: fuera de React basta con leer el estado actual.
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useSyncExternalStore: (_: unknown, get: () => unknown) => get() }))
vi.mock('./supabase', () => ({ OFFLINE_MESSAGE: 'Sin conexión' }))
vi.mock('./queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queryClient: new QueryClient() }
})

const NETWORK = new Error('TypeError: Failed to fetch')

/** API falsa: apunta cada llamada y responde lo que diga `respond`. */
function fakeApi() {
  const calls: { method: string; args: unknown[] }[] = []
  const fake = {
    calls,
    sent: () => calls.map((c) => c.method),
    respond: (_method: string, _args: unknown[]): unknown => undefined,
  }
  const api = new Proxy({} as Api, {
    get: (_, method: string) =>
      async (...args: unknown[]) => {
        calls.push({ method, args })
        return fake.respond(method, args)
      },
  })
  return { fake, api }
}

const online = (on: boolean) => vi.stubGlobal('navigator', { onLine: on })

async function openApp(user: string | null = 'ana') {
  vi.resetModules()
  const outbox = await import('./outbox')
  const { queryClient } = await import('./queryClient')
  queryClient.clear()
  const { fake, api } = fakeApi()
  const offline = outbox.withOffline(api)
  outbox.setOutboxUser(user)
  await outbox.sync()
  return { outbox, qc: queryClient, fake, api: offline, state: outbox.useOutbox }
}

const newExpense = (description: string) => ({ amount: 10, currency: 'EUR', category: 'food', description }) as unknown as Parameters<Api['addExpense']>[1]

const trip = () =>
  ({
    id: 't1',
    title: 'Japón',
    stops: [
      { id: 's1', position: 0, name: 'Tokio' },
      { id: 's2', position: 1, name: 'Kioto' },
    ],
    sights: [
      { id: 'v1', stop_id: 's1', name: 'Senso-ji' },
      { id: 'v2', stop_id: 's2', name: 'Fushimi Inari' },
    ],
    photos: [],
  }) as unknown as TripWithStops

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  online(true)
})

describe('con conexión', () => {
  it('escribe directamente y no deja nada en la cola', async () => {
    const { api, fake, state } = await openApp()
    await api.updateTrip('t1', { title: 'Nuevo' })
    expect(fake.sent()).toEqual(['updateTrip'])
    expect(state().pending).toBe(0)
  })

  it('un error de los datos llega a la pantalla y no se encola', async () => {
    const { api, fake, state } = await openApp()
    fake.respond = () => {
      throw new Error('new row violates row-level security policy')
    }
    await expect(api.updateTrip('t1', { title: 'Nuevo' })).rejects.toThrow('row-level security')
    expect(state().pending).toBe(0)
  })

  it('si la red falla a mitad, el cambio se guarda en la cola', async () => {
    const { api, fake, qc, state } = await openApp()
    fake.respond = () => {
      throw NETWORK
    }
    qc.setQueryData(['expenses', 't1'], [])
    const saved = await api.addExpense('t1', newExpense('Ramen'))
    expect(saved.description).toBe('Ramen')
    expect(qc.getQueryData<Expense[]>(['expenses', 't1'])).toHaveLength(1)
    expect(state().pending).toBe(1)
  })
})

describe('sin conexión', () => {
  it('se ve el cambio al momento y no se llama al servidor', async () => {
    const { api, fake, qc, state } = await openApp()
    qc.setQueryData(['trips', 'ana'], [trip()])
    online(false)
    await api.updateStop('s1', { name: 'Tokyo' })
    expect(qc.getQueryData<TripWithStops[]>(['trips', 'ana'])![0].stops[0].name).toBe('Tokyo')
    expect(fake.calls).toEqual([])
    expect(state().pending).toBe(1)
  })

  it('quitar una parada quita también sus sitios', async () => {
    const { api, qc } = await openApp()
    qc.setQueryData(['trips', 'ana'], [trip()])
    online(false)
    await api.deleteStop('s1')
    const t = qc.getQueryData<TripWithStops[]>(['trips', 'ana'])![0]
    expect(t.stops.map((s) => s.id)).toEqual(['s2'])
    expect(t.sights.map((s) => s.id)).toEqual(['v2'])
  })

  it('sin sesión no se puede guardar', async () => {
    const { api } = await openApp(null)
    online(false)
    await expect(api.updateTrip('t1', { title: 'Nuevo' })).rejects.toThrow('Sin conexión')
  })

  it('las lecturas del editor siguen sin región ni aeropuerto', async () => {
    const { api, fake } = await openApp()
    fake.respond = () => {
      throw NETWORK
    }
    await expect(api.getAirports(['MAD'])).resolves.toEqual([])
    await expect(api.getSubdivisions(['ES'])).resolves.toEqual([])
  })
})

describe('al volver la conexión', () => {
  it('envía los cambios en el orden en que se hicieron', async () => {
    const { outbox, api, fake, state } = await openApp()
    online(false)
    await api.updateTrip('t1', { title: 'Uno' })
    await api.deleteStop('s1')
    await api.setCountryMarked('JP', true)
    online(true)
    await outbox.sync()
    expect(fake.sent()).toEqual(['updateTrip', 'deleteStop', 'setCountryMarked'])
    expect(state().pending).toBe(0)
  })

  it('lo nuevo va detrás de lo pendiente aunque ya haya red', async () => {
    const { outbox, api, fake } = await openApp()
    online(false)
    await api.addStop(trip(), { name: 'Osaka' } as never)
    online(true)
    await api.updateStop('s1', { name: 'Tokyo' })
    await outbox.sync()
    expect(fake.sent()).toEqual(['addStop', 'updateStop'])
  })

  it('un cambio hecho mientras se envía la cola también sale', async () => {
    const { outbox, api, fake, state } = await openApp()
    online(false)
    await api.updateTrip('t1', { title: 'Uno' })
    online(true)
    let release = () => {}
    fake.respond = (method) => (method === 'updateTrip' ? new Promise<void>((r) => (release = r)) : undefined)
    const sending = outbox.sync()
    await vi.waitFor(() => expect(fake.sent()).toEqual(['updateTrip']))
    await api.deleteStop('s1')
    release()
    await sending
    await vi.waitFor(() => expect(fake.sent()).toEqual(['updateTrip', 'deleteStop']))
    await vi.waitFor(() => expect(state().pending).toBe(0))
  })

  it('si se corta la red para y luego sigue sin repetir lo ya enviado', async () => {
    const { outbox, api, fake, state } = await openApp()
    online(false)
    await api.updateTrip('t1', { title: 'Uno' })
    await api.deleteStop('s1')
    await api.deleteStop('s2')
    online(true)
    fake.respond = (_, args) => {
      if (args[0] === 's1') throw NETWORK
    }
    await outbox.sync()
    expect(state().pending).toBe(2)
    expect(state().failed).toEqual([])

    fake.respond = () => undefined
    fake.calls.length = 0
    await outbox.sync()
    expect(fake.calls.map((c) => c.args[0])).toEqual(['s1', 's2'])
    expect(state().pending).toBe(0)
  })

  it('reenviar un alta lleva el mismo id: no se duplica', async () => {
    const { outbox, api, fake } = await openApp()
    online(false)
    const saved = await api.addExpense('t1', newExpense('Ramen'))
    online(true)
    fake.respond = () => {
      throw NETWORK
    }
    await outbox.sync()
    await outbox.sync()
    const ids = fake.calls.map((c) => (c.args[1] as Expense).id)
    expect(new Set(ids)).toEqual(new Set([saved.id]))
  })

  it('«ya existe» no es un fallo: la respuesta se perdió la otra vez', async () => {
    const { outbox, api, fake, state } = await openApp()
    online(false)
    await api.addExpense('t1', newExpense('Ramen'))
    online(true)
    fake.respond = () => {
      throw new Error('duplicate key value violates unique constraint "expenses_pkey"')
    }
    await outbox.sync()
    expect(state().pending).toBe(0)
    expect(state().failed).toEqual([])
  })

  it('con la sesión caducada los cambios esperan: no se pierden', async () => {
    const { outbox, api, fake, state } = await openApp()
    online(false)
    await api.updateTrip('t1', { title: 'Uno' })
    await api.deleteStop('s1')
    online(true)
    for (const message of ['Tu sesión ha caducado. Vuelve a entrar.', 'Sin sesión']) {
      fake.respond = () => {
        throw new Error(message)
      }
      await outbox.sync()
      expect(state().pending).toBe(2)
      expect(state().failed).toEqual([])
    }
    fake.respond = () => undefined
    fake.calls.length = 0
    await outbox.sync()
    expect(fake.sent()).toEqual(['updateTrip', 'deleteStop'])
  })

  it('lo que el servidor rechaza se avisa, se descarta y no frena lo demás', async () => {
    const { outbox, api, fake, state } = await openApp()
    online(false)
    await api.updateTrip('t1', { title: 'Uno' })
    await api.deleteStop('s1')
    online(true)
    fake.respond = (method) => {
      if (method === 'updateTrip') throw new Error('permission denied')
    }
    await outbox.sync()
    expect(fake.sent()).toEqual(['updateTrip', 'deleteStop'])
    expect(state().pending).toBe(0)
    expect(state().failed).toEqual(['Guardar los datos del viaje: permission denied'])
    outbox.dismissFailed()
    expect(state().failed).toEqual([])
  })
})

describe('entre sesiones', () => {
  it('la cola sobrevive a cerrar y abrir la app', async () => {
    const first = await openApp()
    online(false)
    await first.api.updateTrip('t1', { title: 'Uno' })

    const second = await openApp()
    expect(second.state().pending).toBe(1)
    online(true)
    await second.outbox.sync()
    expect(second.fake.calls).toEqual([{ method: 'updateTrip', args: ['t1', { title: 'Uno' }] }])
  })

  it('cada usuario envía solo lo suyo', async () => {
    const { outbox, api, fake, state } = await openApp('ana')
    online(false)
    await api.updateTrip('t1', { title: 'De Ana' })
    online(true)
    outbox.setOutboxUser('bea')
    await outbox.sync()
    expect(fake.calls).toEqual([])
    expect(state().pending).toBe(0)

    outbox.setOutboxUser('ana')
    await outbox.sync()
    expect(fake.sent()).toEqual(['updateTrip'])
  })
})

describe('fotos y tickets', () => {
  const file = () => new File(['foto'], 'foto.jpg', { type: 'image/jpeg' })

  it('una foto sin subir se ve desde el móvil y se sube al volver la red', async () => {
    const { outbox, api, fake, qc } = await openApp()
    qc.setQueryData(['trips', 'ana'], [trip()])
    online(false)
    const photo = await api.uploadPhoto('t1', file(), 's1')
    expect(photo.path).toMatch(/^local:/)
    expect(api.photoUrl(photo.path)).toMatch(/^blob:/)
    expect(qc.getQueryData<TripWithStops[]>(['trips', 'ana'])![0].photos).toHaveLength(1)
    online(true)
    await outbox.sync()
    expect(fake.sent()).toEqual(['uploadPhoto'])
    expect(api.photoUrl(photo.path)).not.toMatch(/^blob:/)
  })

  it('borrar una foto sin subir la quita de la cola y nunca llega al servidor', async () => {
    const { outbox, api, fake, qc, state } = await openApp()
    qc.setQueryData(['trips', 'ana'], [trip()])
    online(false)
    const photo = await api.uploadPhoto('t1', file(), 's1')
    await api.deletePhoto(photo as Photo)
    expect(state().pending).toBe(0)
    expect(qc.getQueryData<TripWithStops[]>(['trips', 'ana'])![0].photos).toEqual([])
    online(true)
    await outbox.sync()
    expect(fake.calls).toEqual([])
  })

  it('un ticket sin subir se sigue viendo al reabrir la app', async () => {
    const first = await openApp()
    online(false)
    await first.api.uploadReceipt('t1', file(), 't1/ticket.jpg')

    const second = await openApp()
    await expect(second.api.receiptUrl('t1/ticket.jpg')).resolves.toMatch(/^blob:/)
    expect(second.fake.calls).toEqual([])
  })
})

describe('isNetworkError', () => {
  it('distingue la red de los errores de datos', async () => {
    const { isNetworkError } = await import('./outbox')
    for (const msg of ['TypeError: Failed to fetch', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource.', 'AuthRetryableFetchError', 'Sin conexión: esto necesita internet.']) expect(isNetworkError(new Error(msg))).toBe(true)
    for (const msg of ['duplicate key value', 'permission denied', 'new row violates row-level security policy']) expect(isNetworkError(new Error(msg))).toBe(false)
  })

  it('sin red, cualquier error cuenta como de red', async () => {
    const { isNetworkError } = await import('./outbox')
    online(false)
    expect(isNetworkError(new Error('permission denied'))).toBe(true)
  })
})
