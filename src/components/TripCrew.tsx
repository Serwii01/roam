import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { ErrorNote, formatDate } from './ui'
import { api } from '../lib/api'
import { useUser } from '../lib/auth'
import type { TripMember, TripWithStops } from '../lib/db'
import { useInvalidateTravel } from '../lib/hooks'
import { inviteUrl } from '../lib/invites'

/** Compañeros de un viaje compartido: lista, invitación por enlace, expulsar y salir. */
export function TripCrew({ trip }: { trip: TripWithStops }) {
  const user = useUser()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const invalidate = useInvalidateTravel()
  const isOwner = trip.user_id === user.id
  const [copied, setCopied] = useState(false)

  const members = useQuery({ queryKey: ['members', trip.id], queryFn: () => api.listTripMembers(trip.id) })
  const invites = useQuery({ queryKey: ['invites', trip.id], queryFn: () => api.listInvites(trip.id), enabled: isOwner })
  const invite = invites.data?.find((i) => i.max_uses == null || i.uses < i.max_uses)

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['members', trip.id] }),
      qc.invalidateQueries({ queryKey: ['invites', trip.id] }),
      invalidate(),
    ])
  const create = useMutation({ mutationFn: () => api.createInvite(trip.id), onSuccess: refresh })
  const revoke = useMutation({ mutationFn: (token: string) => api.revokeInvite(token), onSuccess: refresh })
  const remove = useMutation({
    mutationFn: (m: TripMember) => api.removeTripMember(trip.id, m.user_id),
    onSuccess: async (_, m) => {
      if (m.user_id === user.id) {
        await invalidate()
        navigate('/app/bitacora')
      } else await refresh()
    },
  })

  const list = members.data ?? []
  const url = invite && inviteUrl(invite.token)

  async function share() {
    if (!url) return
    const text = `Únete a «${trip.title}» en ROAM y edítalo conmigo`
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: trip.title, text, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="card p-4" id="companeros">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="headline-sm uppercase">Compañeros de viaje</h3>
        <span className="label-code text-ink-soft">{list.length > 1 ? `${list.length} en la expedición` : 'Solo tú'}</span>
      </div>

      <ErrorNote error={members.error ?? create.error ?? revoke.error ?? remove.error} />

      <ul className="space-y-2">
        {list.map((m) => {
          const me = m.user_id === user.id
          return (
            <li key={m.user_id} className="flex items-center gap-3 rounded-sm bg-surface-low px-3 py-2">
              <Avatar profile={{ id: m.user_id, avatar_url: m.avatar_url, display_name: m.display_name, username: m.username }} className="h-9 w-9 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display font-semibold">
                  {m.display_name || m.username}
                  {me && <span className="font-normal text-ink-soft"> (tú)</span>}
                </span>
                <span className="label-code block text-ink-soft">
                  {m.role === 'owner' ? 'Creador' : `Puede editar · desde ${formatDate(m.joined_at.slice(0, 10))}`}
                </span>
              </span>
              {m.role !== 'owner' && (isOwner || me) && (
                <button
                  className="btn btn-ghost px-2! py-1! text-sm"
                  disabled={remove.isPending}
                  title={me ? 'Salir del viaje' : `Quitar a ${m.display_name || m.username}`}
                  onClick={() => {
                    const ok = me
                      ? confirm(`¿Salir de «${trip.title}»? Dejará de contar en tu pasaporte. Tus paradas se quedan en el viaje.`)
                      : confirm(`¿Quitar a ${m.display_name || m.username} del viaje? Sus paradas y fotos se quedan.`)
                    if (ok) remove.mutate(m)
                  }}
                >
                  <Icon name={me ? 'logout' : 'person_remove'} size={18} />
                  <span className="sr-only md:not-sr-only">{me ? 'Salir' : 'Quitar'}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {isOwner && (
        <div className="mt-4 border-t border-surface-highest pt-4">
          {url && invite ? (
            <>
              <label className="label-code mb-2 block text-ink-soft" htmlFor="invite-link">
                Enlace de invitación
              </label>
              <div className="flex gap-2">
                <input id="invite-link" className="field min-w-0 flex-1 text-sm" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn btn-dark shrink-0" onClick={share}>
                  <Icon name={copied ? 'check' : 'content_copy'} size={18} /> {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                Quien lo abra podrá añadir paradas, notas, fotos y música. Caduca el {formatDate(invite.expires_at.slice(0, 10), 'long')}
                {invite.max_uses != null && ` · ${invite.uses} de ${invite.max_uses} usos`}.{' '}
                <button className="font-semibold text-red-700 underline-offset-2 hover:underline" disabled={revoke.isPending} onClick={() => revoke.mutate(invite.token)}>
                  Anular enlace
                </button>
              </p>
            </>
          ) : (
            <>
              <button className="btn btn-accent w-full" disabled={create.isPending || invites.isLoading} onClick={() => create.mutate()}>
                <Icon name="person_add" size={18} /> {create.isPending ? 'Creando enlace…' : 'Invitar a tus compañeros'}
              </button>
              <p className="mt-2 text-sm text-ink-soft">Crea un enlace para que tus compañeros editen el viaje contigo. El viaje contará también en su pasaporte.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
