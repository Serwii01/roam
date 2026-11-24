import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { useAuth } from '../lib/auth'
import { currentPushPlan, enablePush, setPushOff, snoozePrompt } from '../lib/push'

/**
 * Avisos activados por defecto. Con permiso ya dado, la suscripción se mantiene sola (los navegadores la renuevan o la
 * pierden). Sin permiso hace falta un toque: se propone al entrar y, si se dice que luego, otra vez a la semana.
 */
export function PushPrompt() {
  const { demo } = useAuth()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (demo) return
    // Tras el primer vistazo: que no tape la app al abrirla.
    const id = setTimeout(() => {
      void currentPushPlan().then((plan) => {
        if (plan === 'ask') setOpen(true)
        // En silencio: si falla (sin red), se intenta la próxima vez.
        if (plan === 'subscribe') void enablePush().catch(() => {})
      })
    }, 2500)
    return () => clearTimeout(id)
  }, [demo])
  const enable = useMutation({ mutationFn: enablePush, onSuccess: () => setOpen(false) })
  if (!open) return null
  const close = () => {
    snoozePrompt()
    setOpen(false)
  }
  return (
    <div role="dialog" aria-labelledby="push-title" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md rounded-md bg-card p-4 shadow-2xl ring-1 ring-surface-highest xl:inset-x-auto xl:bottom-6 xl:right-6">
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-deep">
          <Icon name="notifications_active" size={22} />
        </span>
        <div className="min-w-0">
          <h2 id="push-title" className="font-display font-semibold">
            Entérate al momento
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">Gastos que apuntan tus compañeros, pagos, vuelos y recordatorios. Puedes elegir cuáles en Ajustes.</p>
        </div>
      </div>
      <ErrorNote error={enable.error} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost min-h-11" onClick={close}>
          Ahora no
        </button>
        <button type="button" className="btn btn-accent min-h-11" disabled={enable.isPending} onClick={() => (setPushOff(false), enable.mutate())}>
          {enable.isPending ? 'Activando…' : 'Activar avisos'}
        </button>
      </div>
    </div>
  )
}
