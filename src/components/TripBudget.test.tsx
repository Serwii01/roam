// @vitest-environment jsdom
// Pantalla de gastos entera sobre la API de demo: que abre, que se apunta un gasto en pocos toques y que los pagos, el
// historial y el cierre de cuentas funcionan desde los botones.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Expense, TripWithStops } from '../lib/db'

const ME = '00000000-0000-4000-8000-00000000demo'
const BEA = '00000000-0000-4000-8000-000000000001'
let list: Expense[] = []
let closed: string | null = null
const added: Record<string, unknown>[] = []

vi.mock('../lib/api', () => ({
  api: {
    getBudget: async () => ({ trip_id: 't', currency: 'EUR', amount: null, updated_at: '', closed_at: closed, closed_by: closed ? ME : null }),
    setBudget: async () => ({}),
    listExpenses: async () => structuredClone(list),
    listTripMembers: async () => [
      { user_id: ME, username: 'ana', display_name: 'Ana', avatar_url: null, role: 'owner', joined_at: '' },
      { user_id: BEA, username: 'bea', display_name: 'Bea', avatar_url: null, role: 'editor', joined_at: '' },
    ],
    addExpense: async (_t: string, e: Record<string, unknown>) => {
      added.push(e)
      const full = { ...gasto({}), ...e, id: `n${added.length}` } as Expense
      list = [...list, full]
      return full
    },
    updateExpense: async (id: string, patch: Partial<Expense>) => {
      list = list.map((e) => (e.id === id ? { ...e, ...patch } : e))
      return list.find((e) => e.id === id)
    },
    deleteExpense: async () => {},
    setAccountsClosed: async (_t: string, on: boolean) => {
      closed = on ? '2026-11-23T10:00:00Z' : null
    },
    listExpenseHistory: async () => [{ id: 1, trip_id: 't', expense_id: 'x', actor_id: BEA, action: 'delete', before: gasto({ id: 'x', description: 'Taxi', amount: 12 }), after: null, created_at: '2026-11-20T10:00:00Z' }],
    watch: () => () => {},
  },
}))
vi.mock('../lib/auth', () => ({ useUser: () => ({ id: ME, email: null }), useAuth: () => ({ user: { id: ME }, demo: true }) }))
vi.mock('../lib/hooks', () => ({ useProfile: () => ({ data: { home_country: 'ES' } }) }))
vi.mock('./DocViewer', () => ({ DocViewer: () => null }))

const gasto = (e: Partial<Expense>): Expense => ({ id: 'e1', trip_id: 't', stop_id: null, user_id: ME, paid_by: ME, payer_key: `u:${ME}`, category: 'food', description: 'Cena', amount: 30, currency: 'EUR', rate: 1, spent_on: '2026-11-19', split_mode: 'equal', split: [{ k: `u:${ME}`, v: 1 }, { k: `u:${BEA}`, v: 1 }], created_at: '2026-11-19T20:00:00Z', ...e })
const trip = { id: 't', title: 'Estambul', user_id: ME, start_date: '2026-11-18', end_date: '2020-01-01', status: 'done', companions: [], stops: [], photos: [], sights: [] } as unknown as TripWithStops

const { TripBudget } = await import('./TripBudget')
const { ConfirmHost } = await import('./ConfirmDialog')
const show = (start?: 'budget' | 'expense' | 'balances') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConfirmHost />
      <TripBudget trip={trip} start={start} />
    </QueryClientProvider>,
  )

beforeEach(() => {
  list = [gasto({})]
  closed = null
  added.length = 0
  Element.prototype.scrollIntoView = () => {}
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('pantalla de gastos', () => {
  it('abre con el saldo y la lista', async () => {
    show()
    expect(await screen.findByText(/Te deben 15/)).toBeTruthy()
    expect(screen.getByText('Cena')).toBeTruthy()
  })

  it('apunta un gasto solo con importe y concepto, con la categoría adivinada y entre todos', async () => {
    const u = userEvent.setup()
    show('expense')
    await u.type(await screen.findByLabelText('Importe'), '20')
    await u.type(screen.getByLabelText('Descripción'), 'Taxi')
    expect(screen.queryByLabelText('Pagó')).toBeNull() // lo demás, plegado
    await u.click(screen.getByRole('button', { name: 'Añadir' }))
    await waitFor(() => expect(added).toHaveLength(1))
    expect(added[0]).toMatchObject({ amount: 20, description: 'Taxi', category: 'transport', payer_key: `u:${ME}` })
    expect((added[0].split as unknown[]).length).toBe(2)
  })

  it('despliega el resto de opciones', async () => {
    const u = userEvent.setup()
    show('expense')
    await u.click(await screen.findByText('Cambiar'))
    expect(screen.getByLabelText('Pagó')).toBeTruthy()
  })

  it('confirma un pago que me han hecho', async () => {
    list = [gasto({}), gasto({ id: 'p', category: 'settlement', description: null, amount: 15, paid_by: BEA, payer_key: `u:${BEA}`, split_mode: 'amount', split: [{ k: `u:${ME}`, v: 15 }], payment_status: 'pending' })]
    const u = userEvent.setup()
    show()
    await u.click(await screen.findByRole('button', { name: /Sí, recibido/ }))
    await waitFor(() => expect(list.find((e) => e.id === 'p')!.payment_status).toBe('confirmed'))
  })

  it('un pago rechazado deja de contar en el saldo', async () => {
    list = [gasto({}), gasto({ id: 'p', category: 'settlement', amount: 15, paid_by: BEA, payer_key: `u:${BEA}`, split_mode: 'amount', split: [{ k: `u:${ME}`, v: 15 }], payment_status: 'rejected' })]
    show()
    expect(await screen.findByText(/Te deben 15/)).toBeTruthy()
  })

  it('apunta un cambio de efectivo ya devuelto con las dos partes: el saldo no cambia', async () => {
    const u = userEvent.setup()
    show('balances')
    await u.click(await screen.findByRole('button', { name: /Registrar un pago o efectivo/ }))
    await u.click(screen.getByRole('radio', { name: 'Cambio de efectivo' }))
    await u.type(screen.getByLabelText(/Importe/), '20')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Guardar pago' }))
    await waitFor(() => expect(added).toHaveLength(2))
    expect(added.map((x) => x.transfer_kind)).toEqual(['cash', 'cash'])
    expect(added.map((x) => x.payer_key)).toEqual([`u:${ME}`, `u:${BEA}`])
    expect(await screen.findByText(/Te deben 15/)).toBeTruthy()
  })

  it('cierra las cuentas, bloquea los gastos y se pueden reabrir', async () => {
    const u = userEvent.setup()
    show('balances')
    await u.click(await screen.findByRole('button', { name: /Cerrar cuentas/ }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cerrar cuentas' }))
    expect(await screen.findByText('Cuentas cerradas')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Apuntar gasto/ })).toBeNull()
    await u.click(screen.getByRole('button', { name: /Reabrir/ }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reabrir' }))
    expect(await screen.findByRole('button', { name: /Apuntar gasto/ })).toBeTruthy()
  })

  it('el historial dice quién borró un gasto y lo recupera', async () => {
    const u = userEvent.setup()
    show()
    await u.click(await screen.findByRole('tab', { name: 'Resumen' }))
    expect(await screen.findByText(/borró Taxi/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: /Recuperar/, hidden: true }))
    await waitFor(() => expect(added[0]).toMatchObject({ id: 'x', description: 'Taxi', amount: 12 }))
  })
})
