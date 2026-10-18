// Modo demo: misma interfaz que Supabase, con los datos del usuario en localStorage y la
// referencia (países, subdivisiones, aeropuertos) leída de /data/*.json, generados por `npm run data`.
import type { Airport, Country, Expense, InvitePreview, Photo, Sight, Stop, Subdivision, Trip, TripInvite, TripWithStops } from '../db'
import { nearestAirportLocal, searchAirportsLocal } from '../airportIndex'
import { prepareImage } from '../images'
import { demoState, DEMO_USER_ID, type DemoState } from './demo-data'
import type { Api } from './types'

const KEY = 'rumbo-demo-v1'

let state: DemoState = load()

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    // Estados guardados por versiones anteriores no tienen compañeros ni invitaciones.
    if (raw) return { members: [], invites: [], sights: [], budgets: [], expenses: [], ...(JSON.parse(raw) as Partial<DemoState>) } as DemoState
  } catch {
    /* almacenamiento no disponible: se usa el estado inicial en memoria */
  }
  return demoState()
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* lleno o bloqueado: los cambios viven solo en esta pestaña */
  }
}

export function resetDemo() {
  state = demoState()
  save()
}

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 60))
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// ── Referencia ──

interface Table {
  cols: string[]
  rows: unknown[][]
}
const tables = new Map<string, Promise<Record<string, unknown>[]>>()
function table<T>(name: 'countries' | 'subdivisions' | 'airports'): Promise<T[]> {
  if (!tables.has(name)) {
    tables.set(
      name,
      fetch(`/data/${name}.json`)
        .then((r) => r.json() as Promise<Table>)
        .then((t) => t.rows.map((row) => Object.fromEntries(t.cols.map((c, i) => [c, row[i]])))),
    )
  }
  return tables.get(name) as Promise<T[]>
}


function withRelations(t: Trip): TripWithStops {
  return {
    ...t,
    stops: state.stops.filter((s) => s.trip_id === t.id).sort((a, b) => a.position - b.position),
    photos: state.photos.filter((p) => p.trip_id === t.id),
    sights: state.sights.filter((x) => x.trip_id === t.id).sort((a, b) => a.position - b.position),
    member_count: state.members.filter((m) => m.trip_id === t.id).length,
  }
}

function invitePreview(i: TripInvite): InvitePreview | null {
  const t = state.trips.find((x) => x.id === i.trip_id)
  if (!t) return null
  const p = state.profile
  return {
    trip_id: t.id,
    title: t.title,
    start_date: t.start_date,
    end_date: t.end_date,
    stops: state.stops.filter((s) => s.trip_id === t.id).length,
    owner_id: p.id,
    owner_name: p.display_name || p.username,
    owner_username: p.username,
    owner_avatar: p.avatar_url,
    status: i.revoked ? 'revoked' : i.expires_at < now() ? 'expired' : i.max_uses != null && i.uses >= i.max_uses ? 'used_up' : 'valid',
    // En la demo todos los viajes son del usuario demo.
    already_member: true,
  }
}

/** Foto preparada (HEIC admitido, sin EXIF) como data URL pequeña para caber en localStorage. */
async function toDataUrl(file: File): Promise<string> {
  const jpeg = await prepareImage(file, 1200)
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(jpeg)
  })
}

export const demoApi: Api = {
  async listCountries() {
    return (await table<Country>('countries')).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  },
  async listSubdivisions(countryCode) {
    return (await table<Subdivision>('subdivisions')).filter((s) => s.country_code === countryCode)
  },
  async getSubdivisions(codes) {
    const set = new Set(codes)
    return (await table<Subdivision>('subdivisions')).filter((s) => set.has(s.code))
  },
  searchAirports: (q, limit) => searchAirportsLocal(q, limit),
  async getAirports(codes) {
    const set = new Set(codes)
    return (await table<Airport>('airports')).filter((a) => set.has(a.iata))
  },
  nearestAirport: (lat, lon) => nearestAirportLocal(lat, lon),

  async getProfile() {
    return delay(state.profile)
  },
  async updateProfile(_id, patch) {
    state.profile = { ...state.profile, ...patch }
    save()
    return delay(state.profile)
  },

  async listPassports() {
    return delay(state.passports)
  },
  async savePassport(p) {
    const existing = p.id ? state.passports.find((x) => x.id === p.id) : undefined
    const saved = { issued_on: null, expires_on: null, ...existing, ...p, id: p.id ?? uid(), user_id: DEMO_USER_ID }
    state.passports = existing ? state.passports.map((x) => (x.id === saved.id ? saved : x)) : [...state.passports, saved]
    save()
    return delay(saved)
  },
  async deletePassport(id) {
    state.passports = state.passports.filter((p) => p.id !== id)
    save()
  },

  async listTrips() {
    const key = (t: Trip) => t.start_date ?? '9999'
    return delay([...state.trips].sort((a, b) => key(b).localeCompare(key(a))).map(withRelations))
  },
  async getTrip(id) {
    const t = state.trips.find((x) => x.id === id)
    return delay(t ? withRelations(t) : null)
  },
  async createTrip(fields) {
    const t: Trip = {
      id: uid(),
      user_id: DEMO_USER_ID,
      description: null,
      start_date: null,
      end_date: null,
      cover_url: null,
      status: 'done',
      style: null,
      solo: false,
      companions: [],
      soundtrack_url: null,
      created_at: now(),
      updated_at: now(),
      ...fields,
    }
    state.trips.push(t)
    save()
    return delay(t)
  },
  async updateTrip(id, patch) {
    state.trips = state.trips.map((t) => (t.id === id ? { ...t, ...patch, updated_at: now() } : t))
    save()
    return delay(state.trips.find((t) => t.id === id)!)
  },
  async deleteTrip(id) {
    state.trips = state.trips.filter((t) => t.id !== id)
    state.stops = state.stops.filter((s) => s.trip_id !== id)
    state.photos = state.photos.filter((p) => p.trip_id !== id)
    state.members = state.members.filter((m) => m.trip_id !== id)
    state.sights = state.sights.filter((x) => x.trip_id !== id)
    state.expenses = state.expenses.filter((x) => x.trip_id !== id)
    state.budgets = state.budgets.filter((x) => x.trip_id !== id)
    state.invites = state.invites.filter((i) => i.trip_id !== id)
    save()
  },

  async listTripMembers(tripId) {
    const t = state.trips.find((x) => x.id === tripId)
    if (!t) return []
    const p = state.profile
    const owner = { user_id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, role: 'owner' as const, joined_at: t.created_at }
    return delay([owner, ...state.members.filter((m) => m.trip_id === tripId).map(({ trip_id: _, ...m }) => m)])
  },
  async removeTripMember(tripId, userId) {
    state.members = state.members.filter((m) => !(m.trip_id === tripId && m.user_id === userId))
    save()
  },
  async listInvites(tripId) {
    return delay(state.invites.filter((i) => i.trip_id === tripId && !i.revoked && i.expires_at > now()).reverse())
  },
  async createInvite(tripId) {
    const invite: TripInvite = {
      token: uid(),
      trip_id: tripId,
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      max_uses: 10,
      uses: 0,
      revoked: false,
      created_at: now(),
    }
    state.invites.push(invite)
    save()
    return delay(invite)
  },
  async revokeInvite(token) {
    state.invites = state.invites.map((i) => (i.token === token ? { ...i, revoked: true } : i))
    save()
  },
  async getInvite(token) {
    const i = state.invites.find((x) => x.token === token)
    return delay(i ? invitePreview(i) : null)
  },
  async acceptInvite(token) {
    const i = state.invites.find((x) => x.token === token)
    const preview = i && invitePreview(i)
    if (!preview) throw new Error('La invitación no existe')
    return preview.trip_id
  },

  async addStop(trip, stop) {
    const s: Stop = {
      region_code: null,
      province_code: null,
      arrived_on: null,
      notes: null,
      rating: null,
      tags: [],
      song_url: null,
      transport_in: null,
      from_airport: null,
      to_airport: null,
      ...stop,
      id: uid(),
      trip_id: trip.id,
      user_id: DEMO_USER_ID,
      position: (trip.stops.at(-1)?.position ?? -1) + 1,
    }
    state.stops.push(s)
    save()
    return delay(s)
  },
  async updateStop(id, patch) {
    state.stops = state.stops.map((s) => (s.id === id ? { ...s, ...patch } : s))
    save()
    return delay(state.stops.find((s) => s.id === id)!)
  },
  async deleteStop(id) {
    state.stops = state.stops.filter((s) => s.id !== id)
    state.photos = state.photos.map((p) => (p.stop_id === id ? { ...p, stop_id: null } : p))
    state.sights = state.sights.filter((x) => x.stop_id !== id)
    save()
  },
  async reorderStops(stops) {
    const pos = new Map(stops.map((s, i) => [s.id, i]))
    state.stops = state.stops.map((s) => (pos.has(s.id) ? { ...s, position: pos.get(s.id)! } : s))
    save()
  },

  async addSight(stopId, input) {
    const stop = state.stops.find((x) => x.id === stopId)
    if (!stop) throw new Error('La parada no existe')
    const s: Sight = {
      id: uid(),
      trip_id: stop.trip_id,
      stop_id: stopId,
      user_id: DEMO_USER_ID,
      lat: null,
      lon: null,
      wiki_url: null,
      done: false,
      position: Date.now(),
      created_at: now(),
      ...input,
    }
    state.sights.push(s)
    save()
    return delay(s)
  },
  async updateSight(id, patch) {
    state.sights = state.sights.map((x) => (x.id === id ? { ...x, ...patch } : x))
    save()
    return delay(state.sights.find((x) => x.id === id)!)
  },
  async deleteSight(id) {
    state.sights = state.sights.filter((x) => x.id !== id)
    save()
  },

  async getBudget(tripId) {
    return delay(state.budgets.find((b) => b.trip_id === tripId) ?? null)
  },
  async setBudget(tripId, budget) {
    const b = { trip_id: tripId, ...budget, updated_at: now() }
    state.budgets = [...state.budgets.filter((x) => x.trip_id !== tripId), b]
    save()
    return delay(b)
  },
  async listExpenses(tripId) {
    const key = (e: Expense) => `${e.spent_on ?? '9999'}${e.created_at}`
    return delay(state.expenses.filter((e) => e.trip_id === tripId).sort((a, b) => key(a).localeCompare(key(b))))
  },
  async addExpense(tripId, input) {
    const e: Expense = { id: uid(), trip_id: tripId, user_id: DEMO_USER_ID, stop_id: null, paid_by: null, description: null, rate: 1, spent_on: null, created_at: now(), ...input }
    state.expenses.push(e)
    save()
    return delay(e)
  },
  async updateExpense(id, patch) {
    state.expenses = state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e))
    save()
    return delay(state.expenses.find((e) => e.id === id)!)
  },
  async deleteExpense(id) {
    state.expenses = state.expenses.filter((e) => e.id !== id)
    save()
  },

  async uploadPhoto(tripId, file, stopId) {
    const photo: Photo = {
      id: uid(),
      user_id: DEMO_USER_ID,
      trip_id: tripId,
      stop_id: stopId ?? null,
      path: await toDataUrl(file),
      caption: null,
      created_at: now(),
    }
    state.photos.push(photo)
    save()
    return delay(photo)
  },
  async deletePhoto(photo) {
    state.photos = state.photos.filter((p) => p.id !== photo.id)
    save()
  },
  photoUrl(path) {
    return path
  },

  async getVisited() {
    const countries = new Map<string, 'trip' | 'manual'>()
    const subs = new Map<string, 'trip' | 'manual'>()
    const done = new Set(state.trips.filter((t) => t.status === 'done').map((t) => t.id))
    for (const s of state.stops) {
      if (!done.has(s.trip_id)) continue
      countries.set(s.country_code, 'trip')
      if (s.region_code) subs.set(s.region_code, 'trip')
      if (s.province_code) subs.set(s.province_code, 'trip')
    }
    for (const c of state.userCountries) if (!countries.has(c)) countries.set(c, 'manual')
    for (const c of state.userSubdivisions) if (!subs.has(c)) subs.set(c, 'manual')
    return delay({
      countries: [...countries].map(([code, source]) => ({ code, source })),
      subdivisions: [...subs].map(([code, source]) => ({ code, source })),
    })
  },
  async setCountryMarked(code, marked) {
    state.userCountries = marked ? [...new Set([...state.userCountries, code])] : state.userCountries.filter((c) => c !== code)
    save()
  },
  async setSubdivisionMarked(code, marked) {
    state.userSubdivisions = marked
      ? [...new Set([...state.userSubdivisions, code])]
      : state.userSubdivisions.filter((c) => c !== code)
    save()
  },
  async listWishlist() {
    return delay(state.wishlist)
  },
  async exportMyData() {
    return structuredClone(state) as unknown as Record<string, unknown>
  },
  async deleteMyAccount() {
    resetDemo()
  },
  async setWish(code, wished, note) {
    state.wishlist = state.wishlist.filter((w) => w.country_code !== code)
    if (wished) state.wishlist.push({ user_id: DEMO_USER_ID, country_code: code, note: note ?? null, created_at: now() })
    save()
  },
}
