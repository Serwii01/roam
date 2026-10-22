import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

// Confirmaciones con el diseño de la web en lugar del confirm() del navegador.
// `ask()` se puede llamar desde cualquier sitio y devuelve una promesa con la respuesta.

interface Request {
  title: string
  body?: string
  confirm?: string
  cancel?: string
  danger?: boolean
  icon?: string
  resolve: (ok: boolean) => void
}

let current: Request | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function ask(opts: Omit<Request, 'resolve'>): Promise<boolean> {
  current?.resolve(false)
  return new Promise((resolve) => {
    current = { ...opts, resolve }
    emit()
  })
}

function answer(ok: boolean) {
  const r = current
  current = null
  emit()
  r?.resolve(ok)
}

/** Va una vez en la raíz de la app. */
export function ConfirmHost() {
  const req = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
  const cancelRef = useRef<HTMLButtonElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!req) return
    // En las acciones peligrosas el foco empieza en «Cancelar».
    ;(req.danger ? cancelRef : okRef).current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && answer(false)
    addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [req])

  if (!req) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && answer(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.body ? 'confirm-body' : undefined} className="w-full max-w-md rounded-md bg-card p-5 shadow-2xl">
        <div className="flex gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${req.danger ? 'bg-red-50 text-red-700' : 'bg-accent-soft text-accent-deep'}`}>
            <Icon name={req.icon ?? (req.danger ? 'delete' : 'help')} size={22} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-display text-lg font-semibold leading-snug">
              {req.title}
            </h2>
            {req.body && (
              <p id="confirm-body" className="mt-1 text-sm text-ink-soft">
                {req.body}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={() => answer(false)}>
            {req.cancel ?? 'Cancelar'}
          </button>
          <button ref={okRef} type="button" className={`btn ${req.danger ? 'btn-danger' : 'btn-dark'}`} onClick={() => answer(true)}>
            {req.confirm ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** La misma pregunta al eliminar un viaje desde el editor o desde su página. */
export const deleteTripQuestion = (title: string) => ({
  title: `¿Eliminar «${title}»?`,
  body: 'Se borran sus paradas, fotos, gastos y documentos, también para tus compañeros. No se puede deshacer.',
  confirm: 'Eliminar viaje',
  danger: true,
})
