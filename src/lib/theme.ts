import { useSyncExternalStore } from 'react'

// Tema de la app: por defecto el del dispositivo (claro u oscuro, y cambia con él), o fijo desde Ajustes.
// index.html aplica lo mismo antes de pintar nada, para que al abrir la app no se vea un destello blanco.

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'roam.theme'
/** Color de la barra del navegador y de la del sistema en Android (coincide con --color-surface). */
const BAR = { light: '#f9f9fa', dark: '#111214' } as const

const media = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = readPref()
const resolve = (p: ThemePref): Theme => (p === 'system' ? (media?.matches ? 'dark' : 'light') : p)
let state = { pref, theme: resolve(pref) }
const listeners = new Set<() => void>()

function apply() {
  state = { pref, theme: resolve(pref) }
  const root = document.documentElement
  root.dataset.theme = state.theme
  root.style.colorScheme = state.theme
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', BAR[state.theme]))
  listeners.forEach((l) => l())
}

if (typeof document !== 'undefined') {
  apply()
  media?.addEventListener('change', () => pref === 'system' && apply())
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    /* sin almacenamiento: dura lo que la visita */
  }
  apply()
}

/** Preferencia elegida y tema que se está usando. */
export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
