import { useState } from 'react'
import { dismissFailed, sync, useOutbox } from '../lib/outbox'
import { Icon } from './Icon'

/** Pastilla de la cabecera: sin conexión, cambios pendientes de enviar o enviándose. */
export function OfflineStatus() {
  const { online, pending, syncing } = useOutbox()
  const [open, setOpen] = useState(false)
  if (online && !pending) return null
  const text = syncing ? 'Sincronizando…' : !online ? 'Sin conexión' : `${pending} sin enviar`
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`label-code flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 ${online ? 'bg-accent-soft text-accent-ink' : 'bg-surface-high text-ink'}`}
      >
        <Icon name={syncing ? 'sync' : online ? 'cloud_upload' : 'cloud_off'} size={16} className={syncing ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{text}</span>
        {pending > 0 && <span className="rounded-full bg-ink px-1.5 text-[10px] text-white sm:hidden">{pending}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md bg-card p-4 text-sm shadow-2xl ring-1 ring-surface-highest">
          <div className="font-display font-semibold">{online ? 'Hay conexión' : 'Estás sin conexión'}</div>
          <p className="mt-1 text-ink-soft">
            {pending
              ? `${pending === 1 ? 'Un cambio se guardó' : `${pending} cambios se guardaron`} en este móvil y se ${pending === 1 ? 'enviará' : 'enviarán'} solos en cuanto haya conexión. No cierres sesión hasta entonces.`
              : 'Puedes ver tus viajes y seguir apuntando paradas, sitios, gastos y fotos: se enviarán al volver la conexión.'}
          </p>
          {online && pending > 0 && (
            <button className="btn btn-dark mt-3 w-full" disabled={syncing} onClick={() => void sync()}>
              <Icon name="sync" size={18} /> Enviar ahora
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Aviso de los cambios hechos sin conexión que el servidor no aceptó al enviarlos. */
export function SyncErrors() {
  const { failed } = useOutbox()
  if (!failed.length) return null
  return (
    <div role="alert" className="fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 mx-auto max-w-md rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-2xl">
      <div className="flex items-start gap-3">
        <Icon name="error" size={20} />
        <div className="mr-auto">
          <div className="font-semibold">
            {failed.length === 1 ? 'Un cambio hecho sin conexión no se pudo guardar' : `${failed.length} cambios hechos sin conexión no se pudieron guardar`}
          </div>
          <ul className="mt-1 space-y-0.5">
            {failed.slice(0, 5).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
        <button aria-label="Cerrar" className="-m-1 p-1" onClick={dismissFailed}>
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  )
}
