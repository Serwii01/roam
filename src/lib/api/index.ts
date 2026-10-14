import { supabaseConfigured } from '../supabase'
import { demoApi } from './demo'
import { supabaseApi } from './supabase'
import type { Api } from './types'

export type { Api, NewStop, TripFields, Visited } from './types'

/** Sin `.env.local` la app funciona en modo demo, con los datos guardados en el navegador. */
export const DEMO_MODE = !supabaseConfigured
export const api: Api = DEMO_MODE ? demoApi : supabaseApi
