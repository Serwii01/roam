import type { Airport, Country, Passport, Photo, Profile, Stop, Subdivision, Trip, TripWithStops, Wish } from '../db'

export type NewStop = Pick<Stop, 'name' | 'country_code' | 'lat' | 'lon'> &
  Partial<Omit<Stop, 'id' | 'user_id' | 'trip_id' | 'position' | 'name' | 'country_code' | 'lat' | 'lon'>>

export type TripFields = Partial<Omit<Trip, 'id' | 'user_id' | 'created_at' | 'updated_at'>>

export interface Visited {
  countries: { code: string; source: 'trip' | 'manual' }[]
  subdivisions: { code: string; source: 'trip' | 'manual' }[]
}

/** Operaciones de datos de la app. Hay dos implementaciones: Supabase y demo (navegador). */
export interface Api {
  // Referencia
  listCountries(): Promise<Country[]>
  listSubdivisions(countryCode: string): Promise<Subdivision[]>
  getSubdivisions(codes: string[]): Promise<Subdivision[]>
  searchAirports(q: string, limit?: number): Promise<Airport[]>
  getAirports(codes: string[]): Promise<Airport[]>
  nearestAirport(lat: number, lon: number): Promise<string | undefined>

  // Perfil
  getProfile(userId: string): Promise<Profile>
  updateProfile(userId: string, patch: Partial<Omit<Profile, 'id' | 'created_at'>>): Promise<Profile>

  // Pasaportes
  listPassports(): Promise<Passport[]>
  savePassport(p: Partial<Passport> & Pick<Passport, 'country_code'>): Promise<Passport>
  deletePassport(id: string): Promise<void>

  // Viajes
  listTrips(userId: string): Promise<TripWithStops[]>
  getTrip(id: string): Promise<TripWithStops | null>
  createTrip(fields: TripFields & { title: string }): Promise<Trip>
  updateTrip(id: string, patch: TripFields): Promise<Trip>
  deleteTrip(id: string): Promise<void>

  // Paradas
  addStop(trip: TripWithStops, stop: NewStop): Promise<Stop>
  updateStop(id: string, patch: Partial<Stop>): Promise<Stop>
  deleteStop(id: string): Promise<void>
  reorderStops(stops: Stop[]): Promise<void>

  // Fotos
  uploadPhoto(tripId: string, file: File, stopId?: string | null): Promise<Photo>
  deletePhoto(photo: Photo): Promise<void>
  photoUrl(path: string): string

  // Lugares
  getVisited(userId: string): Promise<Visited>
  setCountryMarked(code: string, marked: boolean): Promise<void>
  setSubdivisionMarked(code: string, marked: boolean): Promise<void>
  listWishlist(): Promise<Wish[]>
  setWish(code: string, wished: boolean, note?: string): Promise<void>
}
