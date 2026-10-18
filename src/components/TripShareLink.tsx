import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { api } from '../lib/api'
import { useUser } from '../lib/auth'
import type { TripWithStops } from '../lib/db'
import { useInvalidateTravel } from '../lib/hooks'

export const sharedTripUrl = (token: string) => `${location.origin}/v/${token}`

/** Enlace público del viaje: cualquiera con él lo ve sin cuenta (sin gastos ni compañeros). */
export function TripShareLink({ trip }: { trip: TripWithStops }) {
  const user = useUser()
  const invalidate = useInvalidateTravel()
  const isOwner = trip.user_id === user.id
  const [copied, setCopied] = useState(false)
  const toggle = useMutation({ mutationFn: (on: boolean) => api.setTripShare(trip.id, on), onSuccess: () => invalidate() })
  const url = trip.share_token ? sharedTripUrl(trip.share_token) : null

  async function share() {
    if (!url) return
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: trip.title, text: `Mira mi viaje «${trip.title}» en ROAM`, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="card p-4" id="compartir">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="headline-sm uppercase">Enlace público</h3>
        <span className={`label-code flex items-center gap-1 ${url ? 'text-accent-deep' : 'text-ink-soft'}`}>
          <Icon name={url ? 'public' : 'lock'} size={14} /> {url ? 'Activo' : 'Desactivado'}
        </span>
      </div>
      <ErrorNote error={toggle.error} />
      {url ? (
        <>
          <div className="flex gap-2">
            <input aria-label="Enlace público del viaje" className="field min-w-0 flex-1 py-2! text-sm" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-dark shrink-0" onClick={share}>
              <Icon name={copied ? 'check' : 'content_copy'} size={18} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            Quien lo abra ve la ruta, las paradas, los sitios y las fotos, sin necesidad de cuenta. Nunca los gastos ni los compañeros.{' '}
            {isOwner && (
              <button type="button" className="font-semibold text-red-700 hover:underline" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}>
                Quitar enlace
              </button>
            )}
          </p>
        </>
      ) : isOwner ? (
        <>
          <p className="text-sm text-ink-soft">Crea un enlace para enseñar el viaje a quien quieras, aunque no tenga cuenta en ROAM.</p>
          <button type="button" className="btn btn-accent mt-3 w-full" disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>
            <Icon name="link" size={18} /> {toggle.isPending ? 'Creando…' : 'Crear enlace público'}
          </button>
        </>
      ) : (
        <p className="text-sm text-ink-soft">Solo el creador del viaje puede crear un enlace público.</p>
      )}
    </div>
  )
}
