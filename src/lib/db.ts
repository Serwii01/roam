// Tipos de las tablas de Supabase (ver supabase/migrations).

export type TransportMode = 'plane' | 'train' | 'car' | 'bus' | 'boat' | 'bike' | 'walk'
export type TripStyle = 'backpacker' | 'roadtrip' | 'relax' | 'cultural' | 'adventure' | 'business'
export type ContinentCode = 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA'

export interface Country {
  code: string
  name: string
  name_en: string
  continent: ContinentCode
}

export interface Subdivision {
  code: string
  country_code: string
  name: string
  type: string
  parent_code: string | null
  level: number
}

export interface Airport {
  iata: string
  icao: string | null
  name: string
  city: string | null
  country_code: string
  subdivision_code: string | null
  lat: number
  lon: number
  size: 'large' | 'medium' | 'small'
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  home_country: string | null
  home_city: string | null
  is_public: boolean
  created_at: string
}

export interface Passport {
  id: string
  user_id: string
  country_code: string
  issued_on: string | null
  expires_on: string | null
}

export interface Trip {
  id: string
  user_id: string
  title: string
  description: string | null
  start_date: string | null
  end_date: string | null
  cover_url: string | null
  status: 'done' | 'planned'
  style: TripStyle | null
  solo: boolean
  companions: string[]
  /** Enlace de Spotify con la banda sonora del viaje. */
  soundtrack_url: string | null
  /** Token del enlace público del viaje (null = no compartido). */
  share_token?: string | null
  created_at: string
  updated_at: string
}

export interface Stop {
  id: string
  trip_id: string
  /** Quién añadió la parada; null si borró su cuenta (la parada se queda en el viaje). */
  user_id: string | null
  position: number
  name: string
  country_code: string
  region_code: string | null
  province_code: string | null
  lat: number
  lon: number
  arrived_on: string | null
  notes: string | null
  rating: number | null
  tags: string[]
  /** Enlace de Spotify con la canción de esa parada. */
  song_url: string | null
  transport_in: TransportMode | null
  from_airport: string | null
  to_airport: string | null
  /** Número de vuelo del tramo (IB6251). */
  flight_no?: string | null
}

export interface Photo {
  id: string
  user_id: string
  trip_id: string
  stop_id: string | null
  path: string
  caption: string | null
  created_at: string
}

export interface Wish {
  user_id: string
  country_code: string
  note: string | null
  created_at: string
}

export type ExpenseCategory = 'transport' | 'lodging' | 'food' | 'activities' | 'shopping' | 'fees' | 'other'

/** Presupuesto del viaje y moneda en la que se suman los gastos. Solo lo ven los participantes. */
export interface TripBudget {
  trip_id: string
  currency: string
  amount: number | null
  updated_at: string
}

/** Gasto de un viaje. `rate`: unidades de la moneda del viaje por cada unidad de `currency`. */
export interface Expense {
  id: string
  trip_id: string
  stop_id: string | null
  user_id: string | null
  paid_by: string | null
  category: ExpenseCategory
  description: string | null
  amount: number
  currency: string
  rate: number
  spent_on: string | null
  created_at: string
}

/** Sitio de una parada: visitado o, en un plan, por ver. */
export interface Sight {
  id: string
  trip_id: string
  stop_id: string
  user_id: string | null
  name: string
  lat: number | null
  lon: number | null
  wiki_url: string | null
  done: boolean
  position: number
  created_at: string
}

/** Viaje con sus paradas, sitios y fotos. `member_count`: compañeros con cuenta que lo comparten (sin contar al creador). */
export type TripWithStops = Trip & { stops: Stop[]; photos: Photo[]; sights: Sight[]; member_count?: number }

/** Lo que se ve de un viajero en público (búsqueda, seguidos, enlaces). */
export type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'home_country'>

/** Viaje visto por enlace público: sin gastos ni compañeros; del creador, solo nombre y avatar. */
export interface SharedTrip {
  trip: TripWithStops
  owner: { id: string; display_name: string; avatar_url: string | null; username: string | null }
}

/** Participante de un viaje compartido: solo lo necesario para mostrarlo. */
export interface TripMember {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: 'owner' | 'editor'
  joined_at: string
}

/** Enlace de invitación a un viaje (lo gestiona el creador). */
export interface TripInvite {
  token: string
  trip_id: string
  expires_at: string
  max_uses: number | null
  uses: number
  revoked: boolean
  created_at: string
}

/** Lo que ve quien abre un enlace de invitación, antes de unirse. */
export interface InvitePreview {
  trip_id: string
  title: string
  start_date: string | null
  end_date: string | null
  stops: number
  owner_id: string
  owner_name: string
  owner_username: string
  owner_avatar: string | null
  status: 'valid' | 'expired' | 'used_up' | 'revoked'
  already_member: boolean
}

export const CONTINENT_NAMES: Record<ContinentCode, string> = {
  AF: 'África',
  AN: 'Antártida',
  AS: 'Asia',
  EU: 'Europa',
  NA: 'América del Norte',
  OC: 'Oceanía',
  SA: 'América del Sur',
}

/** Continentes habitados (para "Vuelta al mundo"). */
export const INHABITED_CONTINENTS: ContinentCode[] = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC']
