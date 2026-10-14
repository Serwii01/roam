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
  created_at: string
  updated_at: string
}

export interface Stop {
  id: string
  trip_id: string
  user_id: string
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

export type TripWithStops = Trip & { stops: Stop[]; photos: Photo[] }

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
