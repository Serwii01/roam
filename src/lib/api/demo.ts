// Modo demo: misma interfaz que Supabase, con los datos del usuario en localStorage y la
// referencia (países, subdivisiones, aeropuertos) leída de /data/*.json, generados por `npm run data`.
import type { Airport, Country, Photo, Stop, Subdivision, Trip, TripWithStops } from '../db'
import { nearestAirportLocal, searchAirportsLocal } from '../airportIndex'
import { demoState, DEMO_USER_ID, type DemoState } from './demo-data'
import type { Api } from './types'

const KEY = 'rumbo-demo-v1'

let state: DemoState = load()

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DemoState
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
  }
}

function resizeToDataUrl(file: File, max = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
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
    save()
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
    save()
  },
  async reorderStops(stops) {
    const pos = new Map(stops.map((s, i) => [s.id, i]))
    state.stops = state.stops.map((s) => (pos.has(s.id) ? { ...s, position: pos.get(s.id)! } : s))
    save()
  },

  async uploadPhoto(tripId, file, stopId) {
    const photo: Photo = {
      id: uid(),
      user_id: DEMO_USER_ID,
      trip_id: tripId,
      stop_id: stopId ?? null,
      path: await resizeToDataUrl(file),
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
  async setWish(code, wished, note) {
    state.wishlist = state.wishlist.filter((w) => w.country_code !== code)
    if (wished) state.wishlist.push({ user_id: DEMO_USER_ID, country_code: code, note: note ?? null, created_at: now() })
    save()
  },
}
