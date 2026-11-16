// Cola de cambios sin conexión. Corre en Node: sin IndexedDB la cola vive solo en memoria, y la red se simula con
// `navigator.onLine` y una API falsa que falla como lo haría fetch sin cobertura.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from './api/types'
import type { Expense, TripWithStops } from './db'

vi.mock('./supabase', () => ({ OFFLINE_MESSAGE: 'Sin conexión' }))
vi.mock('./offlineDocs', () => ({ clearSavedDocs: () => Promise.resolve() }))

type Outbox = typeof import('./outbox')
type QC = typeof import('./queryClient')['queryClient']

const net = { online: true }
const sinRed = () => new TypeError('Failed to fetch')

let outbox: Outbox
let qc: QC
let calls: { method: string; args: unknown[] }[]
/** Lo que responde cada método de la API falsa; por defecto, éxito. */
let behaviour: Record<string, (...a: unknown[]) => unknown>

function fakeApi(): Api {
  return new Proxy({} as Api, {
    get: (_, method: string) =>
      async (...args: unknown[]) => {
        calls.push({ method, args })
        const fn = behaviour[method]
        return fn ? fn(...args) : { ok: method }
      },
  })
}

const viaje = (): TripWithStops =>
  ({ id: 't1', user_id: 'yo', title: 'Japón', stops: [], photos: [], sights: [], member_count: 0 }) as unknown as TripWithStops

const gasto = { category: 'food', amount: 12, currency: 'EUR', description: 'Ramen' } as Parameters<Api['addExpense']>[1]

let api: Api

beforeEach(async () => {
  vi.resetModules()
  net.online = true
  vi.stubGlobal('navigator', {
    get onLine() {
      return net.online
    },
  })
  calls = []
  behaviour = {}
  outbox = await import('./outbox')
  qc = (await import('./queryClient')).queryClient
  api = outbox.withOffline(fakeApi())
  outbox.setOutboxUser('yo')
  await outbox.sync()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Cambios en cola (tras dejar terminar el sync que lanza cada escritura). */
const pending = async () => {
  await outbox.sync()
  return lastState().pending
}
const lastState = () => outbox.outboxState()

describe('isNetworkError', () => {
  it('reconoce los errores de red de cada navegador', () => {
    for (const msg of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'fetch failed'])
      expect(outbox.isNetworkError(new TypeError(msg))).toBe(true)
  })

  it('un error de datos no es de red', () => {
    expect(outbox.isNetworkError(new Error('new row violates row-level security policy'))).toBe(false)
  })

  it('sin conexión cualquier error cuenta como de red', () => {
    net.online = false
    expect(outbox.isNetworkError(new Error('lo que sea'))).toBe(true)
  })
})

describe('con conexión', () => {
  it('envía directamente y no encola nada', async () => {
    const r = await api.addExpense('t1', gasto)
    expect(r).toEqual({ ok: 'addExpense' })
    expect(calls).toHaveLength(1)
    expect(await pending()).toBe(0)
  })

  it('el id del registro nuevo se genera en el navegador', async () => {
    await api.addExpense('t1', gasto)
    const sent = calls[0].args[1] as { id: string }
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('respeta el id que ya trae', async () => {
    await api.addExpense('t1', { ...gasto, id: 'mio' } as typeof gasto)
    expect((calls[0].args[1] as { id: string }).id).toBe('mio')
  })

  it('un error de los datos se lanza y no se encola', async () => {
    behaviour.addExpense = () => {
      throw new Error('violates check constraint')
    }
    await expect(api.addExpense('t1', gasto)).rejects.toThrow('check constraint')
    expect(await pending()).toBe(0)
  })

  it('si la red falla al enviar, se encola y se aplica en la caché', async () => {
    qc.setQueryData<Expense[]>(['expenses', 't1'], [])
    behaviour.addExpense = () => {
      throw sinRed()
    }
    const r = await api.addExpense('t1', gasto)
    expect(r).toMatchObject({ trip_id: 't1', amount: 12, user_id: 'yo' })
    expect(qc.getQueryData<Expense[]>(['expenses', 't1'])).toHaveLength(1)
    expect(await pending()).toBe(1)
  })
})

describe('sin conexión', () => {
  beforeEach(() => {
    net.online = false
  })

  it('no intenta enviar: encola y devuelve el registro provisional', async () => {
    const trip = viaje()
    qc.setQueryData(['trip', 't1'], trip)
    const stop = await api.addStop(trip, { name: 'Kioto', country_code: 'JP', lat: 35, lon: 135.7 } as Parameters<Api['addStop']>[1])
    expect(calls).toHaveLength(0)
    expect(stop).toMatchObject({ name: 'Kioto', trip_id: 't1', position: 0 })
    expect(qc.getQueryData<TripWithStops>(['trip', 't1'])!.stops.map((s) => s.name)).toEqual(['Kioto'])
    expect(await pending()).toBe(1)
  })

  it('editar lo recién creado apunta al mismo id', async () => {
    const trip = viaje()
    qc.setQueryData(['trip', 't1'], trip)
    const stop = await api.addStop(trip, { name: 'Kioto', country_code: 'JP', lat: 35, lon: 135.7 } as Parameters<Api['addStop']>[1])
    await api.updateStop(stop.id, { notes: 'templos' })
    net.online = true
    await outbox.sync()
    expect(calls.map((c) => c.method)).toEqual(['addStop', 'updateStop'])
    expect((calls[0].args[1] as { id: string }).id).toBe(stop.id)
    expect(calls[1].args[0]).toBe(stop.id)
  })

  it('al volver la red envía la cola en el orden en que se hizo', async () => {
    await api.addExpense('t1', { ...gasto, description: 'uno' } as typeof gasto)
    await api.updateExpense('x', { amount: 3 })
    await api.deleteExpense('y')
    expect(await pending()).toBe(3)
    net.online = true
    await outbox.sync()
    expect(calls.map((c) => c.method)).toEqual(['addExpense', 'updateExpense', 'deleteExpense'])
    expect(await pending()).toBe(0)
  })

  it('con cosas en cola, lo nuevo va detrás aunque ya haya red', async () => {
    await api.addExpense('t1', gasto)
    net.online = true
    // Aún no se ha sincronizado: el borrado no puede adelantarse al alta.
    behaviour.addExpense = () => {
      throw sinRed()
    }
    await api.deleteExpense('y')
    await outbox.sync()
    expect(calls.filter((c) => c.method === 'deleteExpense')).toHaveLength(0)
    behaviour = {}
    await outbox.sync()
    const order = calls.map((c) => c.method)
    expect(order.lastIndexOf('addExpense')).toBeLessThan(order.indexOf('deleteExpense'))
  })

  it('si la red se corta a mitad, para y conserva lo que falta', async () => {
    await api.updateExpense('a', { amount: 1 })
    await api.updateExpense('b', { amount: 2 })
    await api.updateExpense('c', { amount: 3 })
    net.online = true
    behaviour.updateExpense = (id) => {
      if (id === 'b') throw sinRed()
      return {}
    }
    await outbox.sync()
    expect(await pending()).toBe(2)
    behaviour = {}
    calls = []
    await outbox.sync()
    expect(calls.map((c) => c.args[0])).toEqual(['b', 'c'])
    expect(await pending()).toBe(0)
  })

  it('una alta repetida («duplicate key») no se cuenta como fallo', async () => {
    await api.addExpense('t1', gasto)
    net.online = true
    behaviour.addExpense = () => {
      throw new Error('duplicate key value violates unique constraint "expenses_pkey"')
    }
    await outbox.sync()
    expect(lastState().failed).toEqual([])
    expect(await pending()).toBe(0)
  })

  it('un cambio que el servidor rechaza se avisa y se descarta, sin bloquear el resto', async () => {
    await api.updateExpense('a', { amount: 1 })
    await api.updateExpense('b', { amount: 2 })
    net.online = true
    behaviour.updateExpense = (id) => {
      if (id === 'a') throw new Error('permiso denegado')
      return {}
    }
    await outbox.sync()
    expect(lastState().failed).toEqual(['Guardar un gasto: permiso denegado'])
    expect(calls.map((c) => c.args[0])).toEqual(['a', 'b'])
    expect(await pending()).toBe(0)
  })

  it('la cola es de cada usuario: no se envía con otra sesión', async () => {
    await api.updateExpense('a', { amount: 1 })
    net.online = true
    outbox.setOutboxUser('otro')
    await outbox.sync()
    expect(calls).toHaveLength(0)
    expect(await pending()).toBe(0)
    outbox.setOutboxUser('yo')
    await outbox.sync()
    expect(calls.map((c) => c.args[0])).toEqual(['a'])
  })

  it('sin sesión no se puede encolar', async () => {
    outbox.setOutboxUser(null)
    await expect(api.updateExpense('a', { amount: 1 })).rejects.toThrow('Sin conexión')
  })

  it('las lecturas del editor siguen sin región ni aeropuerto', async () => {
    behaviour.getSubdivisions = () => {
      throw sinRed()
    }
    behaviour.getAirports = () => {
      throw sinRed()
    }
    expect(await api.getSubdivisions(['ES'])).toEqual([])
    expect(await api.getAirports(['ES'])).toEqual([])
  })
})
