// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const push = vi.hoisted(() => ({ currentPushPlan: vi.fn(), enablePush: vi.fn(async () => {}), setPushOff: vi.fn(), snoozePrompt: vi.fn() }))
vi.mock('../lib/push', () => push)
vi.mock('../lib/auth', () => ({ useAuth: () => ({ demo: false }) }))
const { PushPrompt } = await import('./PushPrompt')

const show = async (plan: string) => {
  push.currentPushPlan.mockResolvedValue(plan)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PushPrompt />
    </QueryClientProvider>,
  )
  await act(() => vi.advanceTimersByTimeAsync(3000))
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('sin permiso aún, propone activarlos y un toque basta', async () => {
  await show('ask')
  fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))
  await act(() => vi.advanceTimersByTimeAsync(10))
  expect(push.enablePush).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('«Ahora no» lo deja para más adelante', async () => {
  await show('ask')
  fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
  expect(push.snoozePrompt).toHaveBeenCalledOnce()
  expect(push.enablePush).not.toHaveBeenCalled()
})
it('con permiso ya dado se activan sin preguntar', async () => {
  await show('subscribe')
  expect(push.enablePush).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('si se desactivaron o están bloqueados, no molesta', async () => {
  await show('none')
  expect(push.enablePush).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})
