import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ask } from './ConfirmDialog'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { api } from '../lib/api'

const feedUrl = (token: string) => `${location.origin}/cal/${token}.ics`
const webcal = (token: string) => feedUrl(token).replace(/^https?:/, 'webcal:')
const googleUrl = (token: string) => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal(token))}`

/**
 * Suscripción al calendario de tus viajes: un enlace secreto que el calendario del móvil consulta solo, así
 * los cambios (un vuelo nuevo, otra hora, un sitio del plan) llegan sin volver a importar nada.
 */
export function CalendarSubscription() {
  const qc = useQueryClient()
  const feed = useQuery({ queryKey: ['calendar-feed'], queryFn: () => api.getCalendarFeed() })
  const set = (token: string | null) => qc.setQueryData(['calendar-feed'], token)
  const renew = useMutation({ mutationFn: () => api.renewCalendarFeed(), onSuccess: set })
  const disable = useMutation({ mutationFn: () => api.disableCalendarFeed(), onSuccess: () => set(null) })
  const [copied, setCopied] = useState(false)
  const token = feed.data
  const busy = renew.isPending || disable.isPending

  async function copy() {
    if (!token) return
    await navigator.clipboard?.writeText(feedUrl(token))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="card mt-6 space-y-4 p-6" id="calendario">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-display font-semibold">Calendario de tus viajes</div>
          <p className="text-sm text-ink-soft">
            Suscribe tu calendario a ROAM: las fechas de los viajes, los vuelos y trenes con su hora, los alojamientos y el plan de cada día aparecen solos y se
            actualizan cuando cambias algo (el calendario lo consulta cada pocas horas).
          </p>
        </div>
        <span className={`label-code flex items-center gap-1 ${token ? 'text-accent-deep' : 'text-ink-soft'}`}>
          <Icon name={token ? 'event_available' : 'event_busy'} size={14} /> {token ? 'Activo' : 'Desactivado'}
        </span>
      </div>
      <ErrorNote error={feed.error ?? renew.error ?? disable.error} />
      {feed.isLoading ? null : token ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <a className="btn btn-dark" href={webcal(token)}>
              <Icon name="phone_iphone" size={18} /> iPhone, iPad y Mac
            </a>
            <a className="btn btn-dark" href={googleUrl(token)} target="_blank" rel="noreferrer">
              <Icon name="calendar_month" size={18} /> Google Calendar
            </a>
          </div>
          <div className="flex gap-2">
            <input aria-label="Enlace del calendario" className="field min-w-0 flex-1 py-2! text-sm" readOnly value={feedUrl(token)} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost shrink-0" onClick={copy}>
              <Icon name={copied ? 'check' : 'content_copy'} size={18} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-ink-soft">
            En Android, Google Calendar añade el calendario a tu cuenta y aparece en el móvil en unos minutos. Para Outlook u otros, pega el enlace en «Añadir
            calendario desde Internet». <b className="text-ink">Quien tenga el enlace ve tus viajes con sus reservas</b>: no lo compartas. Incluye los viajes del
            último año y los próximos.
          </p>
          <div className="flex flex-wrap gap-2 border-t border-surface-highest pt-4">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (await ask({ title: '¿Cambiar el enlace?', body: 'El enlace actual dejará de funcionar y tendrás que volver a suscribirte con el nuevo.', confirm: 'Cambiar enlace', icon: 'autorenew' }))
                  renew.mutate()
              }}
            >
              <Icon name="autorenew" size={18} /> Cambiar enlace
            </button>
            <button
              type="button"
              className="btn text-red-700 hover:bg-red-50"
              disabled={busy}
              onClick={async () => {
                if (await ask({ title: '¿Desactivar la suscripción?', body: 'Los calendarios suscritos dejarán de recibir tus viajes.', confirm: 'Desactivar', danger: true, icon: 'event_busy' }))
                  disable.mutate()
              }}
            >
              <Icon name="event_busy" size={18} /> Desactivar
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-dark" disabled={busy} onClick={() => renew.mutate()}>
          <Icon name="event_available" size={18} /> {renew.isPending ? 'Activando…' : 'Activar la suscripción'}
        </button>
      )}
    </div>
  )
}
