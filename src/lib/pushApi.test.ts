// La función de Vercel /api/push con Supabase y el envío simulados.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendNotification = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification } }))
Object.assign(process.env, { VITE_SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', VITE_VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k', CRON_SECRET: 'secreto' })
// @ts-expect-error función de Vercel en JavaScript, sin tipos
const { default: handler } = (await import('../../api/push.js')) as { default: (req: unknown, res: unknown) => Promise<unknown> }

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const T = '00000000-0000-4000-8000-0000000000ff'
let calls: { path: string; method: string; body: unknown }[] = []
let pending: unknown[] = []
let user: unknown = { id: A }

beforeEach(() => {
  calls = []
  user = { id: A }
  sendNotification.mockClear()
  pending = [{ user_id: B, trip_id: T, kind: 'expenses', title: 'Ana ha apuntado Cena · 30,00 €', body: 'Tu parte: 15,00 €', url: '/app/x', tag: 'exp-1' }]
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const path = url.replace('https://sb.test', '')
    const body = init.body ? JSON.parse(String(init.body)) : null
    calls.push({ path, method: init.method ?? 'GET', body })
    const ok = (data: unknown, status = 200) => new Response(status === 204 ? null : data === undefined ? '' : JSON.stringify(data), { status })
    if (path === '/auth/v1/user') return user ? ok(user) : ok({}, 401)
    if (path.includes('rpc/claim_notifications')) return ok(pending)
    if (path.includes('rpc/due_notifications')) return ok([{ user_id: B, kind: 'travel', title: 'Mañana: vuelo a Sevilla', body: 'IST → SVQ', url: `/app/viajes/${T}`, tag: 'leg-1' }])
    if (path.includes('push_subscriptions')) return ok([{ id: 's', user_id: B, endpoint: 'https://push.test/b', p256dh: 'k', auth: 'a' }])
    if (path.includes('/trips?')) return ok([])
    if (init.method === 'POST') return ok(undefined, 201)
    if (init.method === 'DELETE') return ok(undefined, 204)
    return ok([])
  })
})
const call = async (query: Record<string, string>, headers: Record<string, string> = {}, method = 'POST') => {
  const out = { status: 0, body: null as unknown }
  const res = {
    status(n: number) {
      out.status = n
      return res
    },
    json(b: unknown) {
      out.body = b
      return res
    },
  }
  await handler({ method, query, headers, body: {} }, res)
  return out
}

describe('/api/push', () => {
  it('flush envía solo lo que provocó quien llama', async () => {
    const r = await call({ action: 'flush' }, { authorization: 'Bearer token' })
    expect(r).toMatchObject({ status: 200, body: { sent: 1 } })
    expect(calls.find((c) => c.path.includes('claim'))?.body).toEqual({ actor: A })
    expect(JSON.parse(String(sendNotification.mock.calls[0][1])).title).toContain('Cena')
  })
  it('flush sin sesión no envía nada', async () => {
    user = null
    expect((await call({ action: 'flush' }, { authorization: 'Bearer falso' })).status).toBe(401)
    expect(sendNotification).not.toHaveBeenCalled()
  })
  it('el cron exige su secreto', async () => {
    expect((await call({ action: 'daily' }, { authorization: 'Bearer otro' }, 'GET')).status).toBe(401)
  })
  it('el cron guarda los avisos del día (con el check-in), sin repetirlos, y los envía', async () => {
    const r = await call({ action: 'daily', today: '2026-11-21' }, { authorization: 'Bearer secreto' }, 'GET')
    expect(r.status).toBe(200)
    const insert = calls.find((c) => c.path.startsWith('/rest/v1/notifications?on_conflict=dedupe'))!
    expect(insert.body).toMatchObject([{ user_id: B, trip_id: T, kind: 'travel', dedupe: `2026-11-21:${B}:leg-1` }])
    expect((insert.body as { body: string }[])[0].body).toMatch(/check-in/)
    expect(calls.find((c) => c.path.includes('claim'))?.body).toEqual({})
    expect(sendNotification).toHaveBeenCalledOnce()
  })
})
