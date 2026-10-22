import { useSyncExternalStore } from 'react'

// Instalación como app (PWA). Android y Chrome avisan con `beforeinstallprompt` y dejan abrir su diálogo
// desde un botón; Safari en iPhone/iPad no tiene ese evento: allí se instala con Compartir → «Añadir a pantalla de inicio».
// El evento puede llegar antes de que React pinte nada, por eso se escucha desde que se importa este módulo (main.tsx).

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** Ya se está usando como app instalada (pantalla de inicio). */
  standalone: boolean
  /** El navegador ofrece su propio diálogo de instalación (Android, Chrome y Edge de escritorio). */
  canPrompt: boolean
  /** iPhone o iPad sin la app instalada: hay que explicar cómo añadirla a la pantalla de inicio. */
  ios: boolean
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
// Los iPad recientes se presentan como Mac: se distinguen por la pantalla táctil.
const isIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

let deferred: InstallPromptEvent | null = null
let state: InstallState = { standalone: isStandalone(), canPrompt: false, ios: isIos && !isStandalone() }
const listeners = new Set<() => void>()
const set = (next: Partial<InstallState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // Sin la mini barra de Chrome: se ofrece desde el aviso y desde Ajustes.
    deferred = e as InstallPromptEvent
    set({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    set({ canPrompt: false, ios: false })
  })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => set({ standalone: isStandalone(), ios: isIos && !isStandalone() }))
}

export function useInstall() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Abre el diálogo de instalación del navegador. Devuelve true si el usuario acepta. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  set({ canPrompt: false })
  await e.prompt()
  return (await e.userChoice).outcome === 'accepted'
}

// El aviso de instalación se puede cerrar; vuelve a salir pasado un mes.
const DISMISS_KEY = 'roam.install.dismissed'
const MONTH = 30 * 24 * 60 * 60 * 1000

export function installDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < MONTH
  } catch {
    return false
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // Navegación privada o almacenamiento bloqueado: el aviso se cierra solo en esta visita.
  }
}
