import type { Airport, Country, InvitePreview, Passport, Photo, Profile, Sight, Stop, Subdivision, Trip, TripInvite, TripMember, TripWithStops, Wish } from '../db'

export type NewStop = Pick<Stop, 'name' | 'country_code' | 'lat' | 'lon'> &
  Partial<Omit<Stop, 'id' | 'user_id' | 'trip_id' | 'position' | 'name' | 'country_code' | 'lat' | 'lon'>>

export type NewSight = Pick<Sight, 'name'> & Partial<Pick<Sight, 'lat' | 'lon' | 'wiki_url' | 'done' | 'position'>>

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

  // Viajes (los propios y los compartidos en los que participa)
  listTrips(userId: string): Promise<TripWithStops[]>
  getTrip(id: string): Promise<TripWithStops | null>
  createTrip(fields: TripFields & { title: string }): Promise<Trip>
  updateTrip(id: string, patch: TripFields): Promise<Trip>
  deleteTrip(id: string): Promise<void>

  // Viajes compartidos
  listTripMembers(tripId: string): Promise<TripMember[]>
  /** Expulsa a un compañero (el creador) o sale del viaje (uno mismo). */
  removeTripMember(tripId: string, userId: string): Promise<void>
  /** Enlaces de invitación vigentes del viaje (solo el creador). */
  listInvites(tripId: string): Promise<TripInvite[]>
  createInvite(tripId: string): Promise<TripInvite>
  revokeInvite(token: string): Promise<void>
  /** Vista previa de una invitación; null si el enlace no existe. Funciona sin sesión. */
  getInvite(token: string): Promise<InvitePreview | null>
  /** Se une al viaje y devuelve su id. */
  acceptInvite(token: string): Promise<string>

  // Paradas
  addStop(trip: TripWithStops, stop: NewStop): Promise<Stop>
  updateStop(id: string, patch: Partial<Stop>): Promise<Stop>
  deleteStop(id: string): Promise<void>
  reorderStops(stops: Stop[]): Promise<void>

  // Sitios de cada parada
  addSight(stopId: string, sight: NewSight): Promise<Sight>
  updateSight(id: string, patch: Partial<Pick<Sight, 'name' | 'done' | 'position'>>): Promise<Sight>
  deleteSight(id: string): Promise<void>

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

  // Derechos RGPD
  /** Todos los datos del usuario en un objeto serializable (derecho de acceso y portabilidad). */
  exportMyData(userId: string): Promise<Record<string, unknown>>
  /** Borra la cuenta, sus datos y sus fotos (derecho de supresión). */
  deleteMyAccount(userId: string): Promise<void>
}
