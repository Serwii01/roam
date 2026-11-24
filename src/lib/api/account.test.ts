// Copia de datos y borrado de cuenta: con un Supabase falso que apunta cada consulta.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allRows, chunks, PAGE } from './paging'

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const removed: { bucket: string; paths: string[] }[] = []
const updates: { table: string; patch: Row; filters: string[] }[] = []
const selects: { table: string; columns: string }[] = []
let rpc: string[] = []
let removeError: string | null = null
let updateError: string | null = null

function query(table: string) {
  let rows = db[table] ?? []
  let patch: Row | null = null
  const filters: string[] = []
  const q = {
    select(columns = '*') {
      selects.push({ table, columns })
      return q
    },
    update(p: Row) {
      patch = p
      return q
    },
    eq(k: string, v: unknown) {
      filters.push(`${k}=${v}`)
      rows = rows.filter((r) => r[k] === v)
      return q
    },
    neq(k: string, v: unknown) {
      filters.push(`${k}!=${v}`)
      rows = rows.filter((r) => r[k] !== v)
      return q
    },
    in(k: string, v: unknown[]) {
      rows = rows.filter((r) => v.includes(r[k]))
      return q
    },
    not(k: string) {
      rows = rows.filter((r) => r[k] != null)
      return q
    },
    or: () => q,
    order: () => q,
    range(a: number, b: number) {
      rows = rows.slice(a, b + 1)
      return q
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then(ok: (r: unknown) => unknown) {
      if (patch) {
        updates.push({ table, patch, filters })
        return Promise.resolve(updateError ? { data: null, error: { message: updateError } } : { data: null, error: null }).then(ok)
      }
      return Promise.resolve({ data: rows, error: null }).then(ok)
    },
  }
  return q
}

vi.mock('../supabase', () => ({
  must: (r: { data: unknown; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
    return r.data
  },
  supabase: {
    from: (t: string) => query(t),
    rpc: (name: string) => {
      rpc.push(name)
      return Promise.resolve({ data: null, error: null })
    },
    auth: { signOut: () => Promise.resolve(), getUser: () => Promise.resolve({ data: { user: { id: 'yo' } } }) },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          removed.push({ bucket, paths })
          return Promise.resolve({ data: null, error: removeError ? { message: removeError } : null })
        },
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  },
}))
vi.mock('../push', () => ({ flushNotifications: () => {}, notifyJoin: () => {}, setSaveSubscription: () => {} }))
vi.mock('../images', () => ({ prepareImage: () => {}, THUMB_MAX: 1 }))

const { supabaseApi } = await import('./supabase')

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  removed.length = updates.length = selects.length = 0
  rpc = []
  removeError = updateError = null
})

describe('allRows', () => {
  it('lee todas las páginas, también si la última está llena', async () => {
    const all = Array.from({ length: PAGE * 2 }, (_, i) => i)
    const asked: number[] = []
    const got = await allRows<number>((a, b) => {
      asked.push(a)
      return Promise.resolve({ data: all.slice(a, b + 1), error: null })
    })
    expect(got).toEqual(all)
    expect(asked).toEqual([0, PAGE, PAGE * 2])
  })

  it('si falla una página, no devuelve una copia a medias', async () => {
    await expect(allRows(() => Promise.resolve({ data: null, error: { message: 'sin red' } }))).rejects.toThrow('sin red')
  })

  it('chunks parte la lista sin perder nada', () => {
    expect(chunks([1, 2, 3], 2)).toEqual([[1, 2], [3]])
    expect(chunks([])).toEqual([])
  })
})

describe('exportMyData', () => {
  it('lleva también lo que faltaba y pasa de 1.000 filas', async () => {
    db.expense_history = Array.from({ length: 1500 }, (_, id) => ({ id }))
    db.lodgings = [{ id: 'l1' }]
    db.notifications = [{ id: 'n1', user_id: 'yo' }]
    const data = await supabaseApi.exportMyData('yo')
    expect(data.expense_history).toHaveLength(1500)
    expect(data.lodgings).toEqual([{ id: 'l1' }])
    expect(data.notifications).toHaveLength(1)
    for (const k of ['packing_items', 'leg_details', 'documents', 'itinerary', 'trip_members', 'notification_prefs', 'devices', 'calendar_feed', 'following', 'marked_countries', 'wishlist', 'expenses', 'budgets'])
      expect(data).toHaveProperty(k)
  })

  it('no pide las claves de los avisos ni el enlace secreto del calendario', async () => {
    await supabaseApi.exportMyData('yo')
    const cols = (t: string) => selects.filter((s) => s.table === t).map((s) => s.columns)
    expect(cols('push_subscriptions')).toEqual(['user_agent, created_at'])
    expect(cols('calendar_feeds')).toEqual(['created_at'])
  })
})

describe('deleteMyAccount', () => {
  const shared = { id: 'e1', user_id: 'yo', trip_id: 'ajeno', category: 'food', receipt_path: 'ajeno/mio.jpg' }

  it('borra los tickets propios en viajes de otros, y no los de los demás', async () => {
    db.expenses = [shared, { id: 'e2', user_id: 'ana', trip_id: 'ajeno', category: 'food', receipt_path: 'ajeno/ana.jpg' }]
    await supabaseApi.deleteMyAccount('yo')
    expect(removed.flatMap((r) => r.paths)).toEqual(['ajeno/mio.jpg'])
    expect(updates[0]).toMatchObject({ table: 'expenses', patch: { receipt_path: null } })
    expect(rpc).toContain('delete_my_account')
  })

  it('un pago no se edita (volvería a quedar por confirmar), pero su ticket se borra', async () => {
    db.expenses = [{ ...shared, category: 'settlement' }]
    await supabaseApi.deleteMyAccount('yo')
    expect(updates[0].filters).toContain('category!=settlement')
    expect(removed.flatMap((r) => r.paths)).toEqual(['ajeno/mio.jpg'])
  })

  it('con las cuentas cerradas, no poder quitar el enlace no impide borrar el ticket ni la cuenta', async () => {
    db.expenses = [shared]
    updateError = 'Las cuentas de este viaje están cerradas.'
    await supabaseApi.deleteMyAccount('yo')
    expect(removed.flatMap((r) => r.paths)).toEqual(['ajeno/mio.jpg'])
    expect(rpc).toContain('delete_my_account')
  })

  it('si un archivo no se puede borrar, no borra la cuenta', async () => {
    db.expenses = [shared]
    removeError = 'sin red'
    await expect(supabaseApi.deleteMyAccount('yo')).rejects.toThrow('sin red')
    expect(rpc).not.toContain('delete_my_account')
  })
})
