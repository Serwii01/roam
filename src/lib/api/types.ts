import type { DocumentKind, PackingItem, TripDocument } from '../db'
import type { Airport, Country, Expense, InvitePreview, Passport, Photo, Profile, PublicProfile, SharedTrip, Sight, Stop, Subdivision, Trip, TripBudget, TripInvite, TripMember, TripWithStops, Wish } from '../db'

export type NewStop = Pick<Stop, 'name' | 'country_code' | 'lat' | 'lon'> &
  Partial<Omit<Stop, 'id' | 'user_id' | 'trip_id' | 'position' | 'name' | 'country_code' | 'lat' | 'lon'>>

export type NewSight = Pick<Sight, 'name'> & Partial<Pick<Sight, 'lat' | 'lon' | 'wiki_url' | 'done' | 'position' | 'day' | 'time' | 'notes'>>

export type NewExpense = Pick<Expense, 'category' | 'amount' | 'currency'> & Partial<Pick<Expense, 'stop_id' | 'paid_by' | 'description' | 'rate' | 'spent_on'>>

export type NewPackingItem = Pick<PackingItem, 'label' | 'category'> & Partial<Pick<PackingItem, 'position'>>

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
  /** Cambiar `stop_id` mueve el sitio a otra parada (otro día en otra ciudad). */
  updateSight(id: string, patch: Partial<Pick<Sight, 'name' | 'done' | 'position' | 'day' | 'time' | 'notes' | 'stop_id'>>): Promise<Sight>
  deleteSight(id: string): Promise<void>

  // Perfil público, enlaces y amigos
  /** Perfil por nombre de usuario (null si no existe o es privado y no es el tuyo). */
  getProfileByUsername(username: string): Promise<Profile | null>
  /** Crea (true) o quita (false) el enlace público de un viaje; devuelve el token o null. */
  setTripShare(tripId: string, enabled: boolean): Promise<string | null>
  getSharedTrip(token: string): Promise<SharedTrip | null>
  searchProfiles(q: string): Promise<PublicProfile[]>
  /** Ids de los viajeros que sigues. */
  listFollowing(): Promise<string[]>
  getProfiles(ids: string[]): Promise<PublicProfile[]>
  follow(userId: string): Promise<void>
  unfollow(userId: string): Promise<void>
  followCounts(userId: string): Promise<{ followers: number; following: number }>
  /** Últimos viajes hechos de los viajeros que sigues. */
  listFriendsTrips(userIds: string[]): Promise<TripWithStops[]>

  // Planificador (solo participantes)
  listPacking(tripId: string): Promise<PackingItem[]>
  /** Añade varios a la vez (los que ya están con el mismo nombre se ignoran). */
  addPackingItems(tripId: string, items: NewPackingItem[]): Promise<void>
  updatePackingItem(id: string, patch: Partial<Pick<PackingItem, 'packed' | 'label' | 'category'>>): Promise<PackingItem>
  deletePackingItem(id: string): Promise<void>
  listDocuments(tripId: string): Promise<TripDocument[]>
  uploadDocument(tripId: string, file: File, kind: DocumentKind): Promise<TripDocument>
  deleteDocument(doc: TripDocument): Promise<void>
  /** Enlace temporal (unos minutos) para abrir el documento. */
  documentUrl(doc: TripDocument): Promise<string>

  // Presupuesto y gastos (solo participantes)
  getBudget(tripId: string): Promise<TripBudget | null>
  setBudget(tripId: string, budget: Pick<TripBudget, 'currency' | 'amount'>): Promise<TripBudget>
  listExpenses(tripId: string): Promise<Expense[]>
  addExpense(tripId: string, expense: NewExpense): Promise<Expense>
  updateExpense(id: string, patch: Partial<NewExpense>): Promise<Expense>
  deleteExpense(id: string): Promise<void>

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
