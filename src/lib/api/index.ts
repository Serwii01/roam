import { supabaseConfigured } from '../supabase'
import { demoApi } from './demo'
import { supabaseApi } from './supabase'
import type { Api } from './types'

export type { Api, NewStop, TripFields, Visited } from './types'

/**
 * Modo demo (datos en el navegador): en desarrollo, si falta `.env.local`; en producción, solo si se
 * pide expresamente con VITE_DEMO=1. Así un despliegue sin variables de Supabase no se hace pasar por
 * la app real con datos que en realidad no se guardan en ningún servidor.
 */
const DEMO_FORCED = import.meta.env.VITE_DEMO === '1'
export const DEMO_MODE = DEMO_FORCED || (!supabaseConfigured && import.meta.env.DEV)
/** Producción sin Supabase ni demo explícita: la app muestra un aviso de configuración. */
export const MISCONFIGURED = !DEMO_MODE && !supabaseConfigured
export const api: Api = DEMO_MODE ? demoApi : supabaseApi
