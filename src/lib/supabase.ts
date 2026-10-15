import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false si falta configurar `.env.local` (ver `.env.example`). */
export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Errores de la base de datos traducidos a algo que el usuario entienda. */
const FRIENDLY: [RegExp, string][] = [
  [/"trips_check"/, 'La fecha de vuelta no puede ser anterior a la de ida.'],
  [/"trips_title_check"/, 'El título debe tener entre 1 y 120 caracteres.'],
  [/(soundtrack|song)_url_check/, 'El enlace de música tiene que ser de Spotify (open.spotify.com).'],
  [/"stops_rating_check"/, 'La valoración va de 1 a 5 estrellas.'],
  [/row-level security|permission denied/i, 'No tienes permiso para guardar esto. Si tu sesión ha caducado, vuelve a entrar.'],
  [/JWT expired/i, 'Tu sesión ha caducado. Vuelve a entrar.'],
]

export function friendlyError(message: string): string {
  return FRIENDLY.find(([re]) => re.test(message))?.[1] ?? message
}

/** Lanza el error de Supabase si lo hay; si no, devuelve los datos. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendlyError(res.error.message))
  return res.data as T
}
