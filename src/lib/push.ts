// Avisos en el móvil (Web Push): permiso del sistema, suscripción del navegador y llamadas a /api/push.
// La suscripción se guarda en Supabase (api.savePushSubscription) y los avisos los manda la función de Vercel.
import type { PushSubscriptionRow } from './api/types'
import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushSupport =
  | 'ok'
  /** iPhone/iPad sin instalar: Safari solo permite avisos a la app añadida a la pantalla de inicio. */
  | 'ios-install'
  /** Navegador sin avisos, o la app sin service worker (en desarrollo). */
  | 'unsupported'
  /** Faltan las claves en Vercel (VITE_VAPID_PUBLIC_KEY). */
  | 'unconfigured'
  /** El usuario bloqueó los avisos: hay que permitirlos en los ajustes del móvil o del navegador. */
  | 'denied'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Service worker de la app (sin esperar indefinidamente: en desarrollo no hay ninguno). */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker.getRegistration()
}

export async function pushSupport(): Promise<PushSupport> {
  if (isIos() && !standalone()) return 'ios-install'
  if (!('PushManager' in window) || !('Notification' in window) || !(await registration())) return 'unsupported'
  if (!VAPID) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

/** Suscripción de este móvil o navegador, si ya tiene los avisos activados. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await registration())?.pushManager.getSubscription() ?? null
}

/** La clave pública VAPID va en base64url; el navegador la quiere en bytes. */
function keyBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** Pide permiso (tiene que venir de un toque del usuario) y suscribe este móvil. */
export async function subscribePush(): Promise<PushSubscriptionRow> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('No has dado permiso para los avisos. Puedes cambiarlo en los ajustes del móvil.')
  const reg = await registration()
  if (!reg || !VAPID) throw new Error('Los avisos no están disponibles en este navegador.')
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }))
  } catch (e) {
    // Mensajes del navegador en inglés («Registration failed - …»): se explica en castellano.
    console.error(e)
    throw new Error('El navegador no ha podido activar los avisos. Comprueba que ROAM tiene permiso de notificaciones y vuelve a intentarlo.')
  }
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('El navegador no ha dado una suscripción válida.')
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 300) }
}

/** Quita la suscripción de este móvil; devuelve su endpoint para borrarlo también del servidor. */
export async function unsubscribePush(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  await sub.unsubscribe()
  return sub.endpoint
}

async function callPush(action: 'test' | 'join', body?: unknown) {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error('Sin sesión')
  const res = await fetch(`/api/push?action=${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; sent?: number }
  if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar el aviso.')
  return data
}

/** Aviso de prueba a todos tus móviles con los avisos activados. Devuelve a cuántos se envió. */
export async function sendTestPush(): Promise<number> {
  return (await callPush('test')).sent ?? 0
}

/** Al unirse a un viaje: avisa al resto. Si falla (sin red, sin configurar), no pasa nada. */
export async function notifyJoin(tripId: string) {
  await callPush('join', { tripId }).catch(() => {})
}
