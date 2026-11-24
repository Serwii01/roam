// Cambios de los demás al momento: por el tiempo real de Supabase y por los avisos que recibe el service worker. Si
// ninguno llega (sin red, pestaña dormida), outbox.ts recarga al volver a la app.
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

/** Mientras se ve el viaje: gastos, cuentas e historial al día. */
export function useTripLive(tripId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = api.watch({ tripId }, () => {
      // Varios cambios seguidos (la cola de un compañero) se recargan una vez.
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const key of ['expenses', 'budget', 'expense-history']) void qc.invalidateQueries({ queryKey: [key, tripId] })
      }, 300)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [qc, tripId])
}

/** La bandeja de avisos y cuántos hay sin leer (también en el icono de la app instalada). */
export function useNotifications(userId: string) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['notifications', userId], queryFn: () => api.listNotifications(), retry: false })
  const unread = (q.data ?? []).filter((n) => !n.read_at).length
  useEffect(() => {
    const refresh = () => {
      for (const key of ['notifications', 'expenses', 'budget', 'expense-history']) void qc.invalidateQueries({ queryKey: [key] })
    }
    const stop = api.watch({ userId }, refresh)
    const onMessage = (e: MessageEvent) => (e.data as { type?: string } | null)?.type === 'roam-push' && refresh()
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      stop()
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [qc, userId])
  useEffect(() => {
    if (!q.data) return
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    void (unread ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.())?.catch(() => {})
  }, [q.data, unread])
  return { ...q, unread }
}
