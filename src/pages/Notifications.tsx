import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useUser } from '../lib/auth'
import type { AppNotification } from '../lib/db'
import { useNotifications } from '../lib/live'
import { timeAgo } from '../lib/timeAgo'

const KIND: Record<AppNotification['kind'], { icon: string }> = {
  expenses: { icon: 'receipt_long' },
  payments: { icon: 'handshake' },
  reminders: { icon: 'notifications_active' },
  travel: { icon: 'flight' },
  lodging: { icon: 'hotel' },
  passport: { icon: 'badge' },
  social: { icon: 'group' },
  memories: { icon: 'photo_library' },
}

/** Bandeja de avisos: lo mismo que llega al móvil, también para quien no los tiene activados. */
export function NotificationsPage() {
  const user = useUser()
  const qc = useQueryClient()
  const list = useNotifications(user.id)
  // Los que estaban sin leer al entrar siguen marcados mientras se mira la pantalla.
  const fresh = useRef(new Set<string>())
  const items = list.data ?? []
  for (const n of items) if (!n.read_at) fresh.current.add(n.id)
  const unread = list.unread
  useEffect(() => {
    if (!unread) return
    const id = setTimeout(() => {
      void api
        .markNotificationsRead()
        .then(() => qc.invalidateQueries({ queryKey: ['notifications', user.id] }))
        .catch(() => {})
    }, 1200)
    return () => clearTimeout(id)
  }, [unread, qc, user.id])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display-hero">Avisos</h1>
        <Link to="/app/ajustes#avisos" className="btn btn-ghost">
          <Icon name="settings" size={18} /> Configurar
        </Link>
      </div>
      <div className="mt-6">
        <ErrorNote error={list.error} />
        {list.isLoading ? (
          <Spinner />
        ) : items.length ? (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id}>
                <Link to={n.url} className={`card flex gap-3 p-3 transition hover:bg-surface-low ${fresh.current.has(n.id) ? 'ring-1 ring-accent/60' : ''}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-container text-accent">
                    <Icon name={KIND[n.kind].icon} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{n.title}</span>
                    <span className="block text-sm text-ink-soft">{n.body}</span>
                    <time dateTime={n.created_at} className="mt-0.5 block text-xs text-ink-soft">
                      {timeAgo(n.created_at)}
                    </time>
                  </span>
                  {fresh.current.has(n.id) && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Nuevo" role="img" />}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          !list.error && (
            <Empty icon="notifications_off" title="Aún no hay avisos">
              Aquí verás los gastos y pagos de tus compañeros, los vuelos y los recordatorios.
            </Empty>
          )
        )}
      </div>
    </div>
  )
}
