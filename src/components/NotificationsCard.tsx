import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from './Icon'
import { ErrorNote } from './ui'
import { api } from '../lib/api'
import type { NotificationPrefs } from '../lib/api/types'
import { currentSubscription, pushSupport, sendTestPush, subscribePush, unsubscribePush, type PushSupport } from '../lib/push'

const KINDS: { id: keyof NotificationPrefs; label: string; hint: string }[] = [
  { id: 'travel', label: 'Vuelos y trenes', hint: 'El día antes: a qué hora sales, compañía y reserva.' },
  { id: 'lodging', label: 'Alojamiento', hint: 'El día de entrada: desde qué hora, dirección y reserva.' },
  { id: 'passport', label: 'Pasaporte', hint: 'A 60, 30 y 7 días de un viaje, si te falta o caduca pronto.' },
  { id: 'social', label: 'Compañeros', hint: 'Cuando alguien se une a uno de tus viajes o un viaje compartido pasa a realizado.' },
]

const WHY: Record<Exclude<PushSupport, 'ok'>, string> = {
  'ios-install': 'En iPhone y iPad, los avisos solo llegan a la app instalada: en Safari, Compartir → «Añadir a pantalla de inicio», y ábrela desde el icono.',
  unsupported: 'Este navegador no admite avisos. Prueba desde la app instalada en el móvil o desde Chrome.',
  unconfigured: 'Los avisos aún no están configurados en el servidor.',
  denied: 'Has bloqueado los avisos de ROAM. Para recibirlos, permítelos en los ajustes del móvil (Notificaciones → ROAM) o en los permisos del sitio del navegador.',
}

/** Ajustes → Avisos: activarlos en este móvil, elegir cuáles (para todos tus móviles) y enviar uno de prueba. */
export function NotificationsCard() {
  const qc = useQueryClient()
  const [support, setSupport] = useState<PushSupport | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [tested, setTested] = useState<string | null>(null)
  useEffect(() => {
    void pushSupport().then(setSupport)
    void currentSubscription().then((s) => setSubscribed(!!s))
  }, [])

  const prefs = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api.getNotificationPrefs() })
  const enable = useMutation({
    mutationFn: async () => api.savePushSubscription(await subscribePush()),
    onSuccess: () => setSubscribed(true),
    onSettled: () => void pushSupport().then(setSupport),
  })
  const disable = useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribePush()
      if (endpoint) await api.deletePushSubscription(endpoint)
    },
    onSuccess: () => setSubscribed(false),
  })
  const savePrefs = useMutation({
    mutationFn: (next: NotificationPrefs) => api.setNotificationPrefs(next),
    onMutate: (next) => qc.setQueryData(['notification-prefs'], next),
    onError: () => qc.invalidateQueries({ queryKey: ['notification-prefs'] }),
  })
  const test = useMutation({
    mutationFn: () => sendTestPush(),
    onSuccess: (n) => setTested(n ? 'Enviado: te llegará en unos segundos.' : 'No hay ningún móvil con los avisos activados.'),
  })
  const busy = enable.isPending || disable.isPending

  return (
    <div className="card mt-6 space-y-4 p-6" id="avisos">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-display font-semibold">Avisos en el móvil</div>
          <p className="text-sm text-ink-soft">Cada mañana, lo que te toca: el vuelo o el tren de mañana, la entrada al alojamiento y el pasaporte antes de un viaje.</p>
        </div>
        <span className={`label-code flex items-center gap-1 ${subscribed ? 'text-accent-deep' : 'text-ink-soft'}`}>
          <Icon name={subscribed ? 'notifications_active' : 'notifications_off'} size={14} /> {subscribed ? 'Activados' : 'Desactivados'}
        </span>
      </div>
      <ErrorNote error={enable.error ?? disable.error ?? savePrefs.error ?? test.error ?? prefs.error} />

      {support && support !== 'ok' && !subscribed ? (
        <p className="rounded-sm bg-surface-low p-4 text-sm text-ink-soft">{WHY[support]}</p>
      ) : support === 'ok' || subscribed ? (
        <>
          {subscribed ? (
            <div className="space-y-2">
              {KINDS.map((k) => (
                <label key={k.id} className="flex items-start gap-3 rounded-sm bg-surface-low p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={prefs.data?.[k.id] ?? true}
                    disabled={!prefs.data}
                    onChange={(e) => prefs.data && savePrefs.mutate({ ...prefs.data, [k.id]: e.target.checked })}
                  />
                  <span>
                    <span className="font-semibold">{k.label}</span>
                    <span className="block text-sm text-ink-soft">{k.hint}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-ink-soft">Llegan hacia las 9:00 (hora de España). Lo que elijas vale para todos tus móviles.</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {subscribed ? (
              <>
                <button type="button" className="btn btn-ghost" disabled={test.isPending} onClick={() => (setTested(null), test.mutate())}>
                  <Icon name="send" size={18} /> {test.isPending ? 'Enviando…' : 'Enviar un aviso de prueba'}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => disable.mutate()}>
                  <Icon name="notifications_off" size={18} /> Desactivar en este móvil
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-dark" disabled={busy} onClick={() => enable.mutate()}>
                <Icon name="notifications_active" size={18} /> {enable.isPending ? 'Activando…' : 'Activar avisos en este móvil'}
              </button>
            )}
          </div>
          {tested && <p className="label-code text-accent-deep">{tested}</p>}
        </>
      ) : null}
    </div>
  )
}
