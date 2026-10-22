import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { DEMO_MODE } from './api'
import { DEMO_USER_ID } from './api/demo-data'
import { isNetworkError, setOutboxUser } from './outbox'
import { clearLocalData } from './queryClient'
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  email: string | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  demo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username?: string) => Promise<{ needsConfirmation: boolean }>
  signInWithProvider: (provider: Provider) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', github: 'GitHub', azure: 'Microsoft' }

/** Proveedores OAuth activos (VITE_OAUTH_PROVIDERS), una vez habilitados en Supabase → Authentication → Providers. */
export const OAUTH_PROVIDERS: { id: Provider; label: string }[] = ((import.meta.env.VITE_OAUTH_PROVIDERS as string | undefined) ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((id) => ({ id: id as Provider, label: PROVIDER_NAMES[id] ?? id[0].toUpperCase() + id.slice(1) }))

const DEMO_KEY = 'rumbo-demo-session'
const redirectTo = () => `${location.origin}/app`

/**
 * Sin conexión y con el token caducado (dura una hora), Supabase no puede renovarlo y no da sesión, aunque siga
 * guardada en el móvil. Para no mandar a «Entrar» a quien abre la app en modo avión, se usa la guardada;
 * al volver la red, Supabase la renueva sola.
 */
function storedUser(): AuthUser | null {
  try {
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey
    const s = JSON.parse(localStorage.getItem(key) ?? 'null') as { user?: { id: string; email?: string } } | null
    return s?.user ? { id: s.user.id, email: s.user.email ?? null } : null
  } catch {
    return null
  }
}

/** Dueño de los datos guardados en el móvil: si entra otra cuenta, se borran antes de enseñar nada. */
const OWNER_KEY = 'roam.owner'

function readDemoSession(): AuthUser | null {
  try {
    return localStorage.getItem(DEMO_KEY) ? { id: DEMO_USER_ID, email: localStorage.getItem(DEMO_KEY) } : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(DEMO_MODE ? readDemoSession() : null)
  const [loading, setLoading] = useState(!DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE) return
    // Sin red, renovar un token caducado se reintenta hasta 30 s: mientras, se entra con la sesión guardada.
    let settled = false
    const fallback = setTimeout(
      () => {
        const stored = settled ? null : storedUser()
        if (!stored) return
        setUser(stored)
        setLoading(false)
      },
      navigator.onLine ? 4000 : 300,
    )
    supabase.auth.getSession().then(({ data, error }) => {
      settled = true
      clearTimeout(fallback)
      if (data.session) setUser({ id: data.session.user.id, email: data.session.user.email ?? null })
      else setUser((prev) => (error && isNetworkError(error) ? (prev ?? storedUser()) : null))
      setLoading(false)
    })
    // Sin sesión solo al cerrarla de verdad: el aviso inicial sin red llega vacío aunque la sesión siga guardada.
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (s) setUser({ id: s.user.id, email: s.user.email ?? null })
      else if (e === 'SIGNED_OUT') setUser(null)
    })
    return () => {
      clearTimeout(fallback)
      data.subscription.unsubscribe()
    }
  }, [])

  // Datos del móvil de una sola cuenta: al cerrar sesión o entrar con otra, se borran.
  const userId = user?.id ?? null
  useEffect(() => {
    if (loading) return
    setOutboxUser(userId)
    let owner: string | null = null
    try {
      owner = localStorage.getItem(OWNER_KEY)
      if (userId) localStorage.setItem(OWNER_KEY, userId)
      else localStorage.removeItem(OWNER_KEY)
    } catch {
      /* sin almacenamiento: tampoco hay nada guardado */
    }
    if (owner && owner !== userId) void clearLocalData()
  }, [userId, loading])

  const demoSignIn = (email: string) => {
    try {
      localStorage.setItem(DEMO_KEY, email || 'demo@rumbo.app')
    } catch {
      /* sin almacenamiento: la sesión dura lo que la pestaña */
    }
    setUser({ id: DEMO_USER_ID, email: email || 'demo@rumbo.app' })
  }

  const value: AuthState = {
    user,
    loading,
    demo: DEMO_MODE,
    async signIn(email, password) {
      if (DEMO_MODE) return demoSignIn(email)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(translateAuthError(error.message))
    },
    async signUp(email, password, username) {
      if (DEMO_MODE) {
        demoSignIn(email)
        return { needsConfirmation: false }
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo(), data: username ? { username } : undefined },
      })
      if (error) throw new Error(translateAuthError(error.message))
      return { needsConfirmation: !data.session }
    },
    async signInWithProvider(provider) {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } })
      if (error) throw new Error(translateAuthError(error.message))
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
      if (error) throw new Error(translateAuthError(error.message))
    },
    async signOut() {
      if (DEMO_MODE) {
        try {
          localStorage.removeItem(DEMO_KEY)
        } catch {
          /* nada que borrar */
        }
        setUser(null)
        return
      }
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}

/** Usuario con sesión; solo para pantallas dentro de <RequireAuth>. */
export function useUser(): AuthUser {
  const { user } = useAuth()
  if (!user) throw new Error('Sin sesión')
  return user
}

function translateAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Confirma tu email antes de entrar (revisa tu bandeja de entrada).'
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese email.'
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  return msg
}
