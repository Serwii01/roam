// Implementación real sobre Supabase. Las consultas de usuario dependen de RLS: Supabase solo
// devuelve las filas del usuario con sesión (o de perfiles públicos).
import type { Airport, Photo, Stop, TripWithStops } from '../db'
import { must, supabase } from '../supabase'
import type { Api } from './types'

const BUCKET = 'trip-photos'

/** Reduce una imagen a `max` px de lado (JPEG 0,82). Si ya es pequeña o no se puede leer, devuelve el original. */
async function shrinkImage(file: File, max = 2000): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1_500_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

// ── Enlaces firmados de fotos (bucket privado) ──
const SIGNED_TTL = 6 * 3600 // segundos
const signed = new Map<string, { url: string; expires: number }>()

/** Firma de golpe las fotos que aún no tienen un enlace vigente (≥30 min de margen). */
async function signPhotos(paths: string[]) {
  const now = Date.now()
  const missing = [...new Set(paths)].filter((p) => (signed.get(p)?.expires ?? 0) - now < 30 * 60_000)
  if (!missing.length) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL)
  if (error) throw new Error(error.message)
  for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, { url: d.signedUrl, expires: now + SIGNED_TTL * 1000 })
}

const sortTrip = (t: TripWithStops): TripWithStops => ({
  ...t,
  stops: [...(t.stops ?? [])].sort((a, b) => a.position - b.position),
  photos: [...(t.photos ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
})

export const supabaseApi: Api = {
  async listCountries() {
    return must(await supabase.from('countries').select('*').order('name'))
  },
  async listSubdivisions(countryCode) {
    return must(await supabase.from('subdivisions').select('*').eq('country_code', countryCode).order('name'))
  },
  async getSubdivisions(codes) {
    if (!codes.length) return []
    return must(await supabase.from('subdivisions').select('*').in('code', [...new Set(codes)]))
  },
  async searchAirports(q, limit = 8) {
    const s = q.trim()
    if (s.length < 2) return []
    let exact: Airport[] = []
    if (/^[a-zA-Z]{3}$/.test(s)) exact = must(await supabase.from('airports').select('*').eq('iata', s.toUpperCase()))
    const like = `%${s.replace(/[%_,()]/g, ' ')}%`
    const rest: Airport[] = must(
      await supabase.from('airports').select('*').or(`name.ilike.${like},city.ilike.${like}`).order('size').limit(limit),
    )
    return [...exact, ...rest.filter((a) => !exact.some((e) => e.iata === a.iata))].slice(0, limit)
  },
  async getAirports(codes) {
    const unique = [...new Set(codes.filter(Boolean))]
    if (!unique.length) return []
    return must(await supabase.from('airports').select('*').in('iata', unique))
  },
  async nearestAirport(lat, lon) {
    const rows = must(await supabase.rpc('nearest_airports', { lat, lon, n: 1 })) as { iata: string }[]
    return rows[0]?.iata
  },

  async getProfile(userId) {
    return must(await supabase.from('profiles').select('*').eq('id', userId).single())
  },
  async updateProfile(userId, patch) {
    return must(await supabase.from('profiles').update(patch).eq('id', userId).select().single())
  },

  async listPassports() {
    return must(await supabase.from('passports').select('*').order('expires_on'))
  },
  async savePassport(p) {
    const { id, ...fields } = p
    return id
      ? must(await supabase.from('passports').update(fields).eq('id', id).select().single())
      : must(await supabase.from('passports').insert(fields).select().single())
  },
  async deletePassport(id) {
    must(await supabase.from('passports').delete().eq('id', id))
  },

  async listTrips(userId) {
    const rows = must(
      await supabase
        .from('trips')
        .select('*, stops(*), photos(*)')
        .eq('user_id', userId)
        .order('start_date', { ascending: false, nullsFirst: true }),
    ) as TripWithStops[]
    await signPhotos(rows.flatMap((t) => (t.photos ?? []).map((p) => p.path)))
    return rows.map(sortTrip)
  },
  async getTrip(id) {
    const row = must(await supabase.from('trips').select('*, stops(*), photos(*)').eq('id', id).maybeSingle()) as TripWithStops | null
    if (row) await signPhotos((row.photos ?? []).map((p) => p.path))
    return row && sortTrip(row)
  },
  async createTrip(fields) {
    return must(await supabase.from('trips').insert(fields).select().single())
  },
  async updateTrip(id, patch) {
    return must(await supabase.from('trips').update(patch).eq('id', id).select().single())
  },
  async deleteTrip(id) {
    const photos = must(await supabase.from('photos').select('path').eq('trip_id', id)) as Pick<Photo, 'path'>[]
    if (photos.length) await supabase.storage.from(BUCKET).remove(photos.map((p) => p.path))
    must(await supabase.from('trips').delete().eq('id', id))
  },

  async addStop(trip, stop) {
    const position = (trip.stops.at(-1)?.position ?? -1) + 1
    return must(await supabase.from('stops').insert({ ...stop, trip_id: trip.id, position }).select().single())
  },
  async updateStop(id, patch) {
    return must(await supabase.from('stops').update(patch).eq('id', id).select().single())
  },
  async deleteStop(id) {
    must(await supabase.from('stops').delete().eq('id', id))
  },
  async reorderStops(stops: Stop[]) {
    await Promise.all(stops.map((s, i) => (s.position === i ? null : supabaseApi.updateStop(s.id, { position: i }))))
  },

  async uploadPhoto(tripId, file, stopId) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Sin sesión')
    // Las fotos del móvil pesan 5-10 MB: se reducen antes de subirlas (menos espera y menos espacio en el plan gratuito).
    const small = await shrinkImage(file)
    const ext = small.type === 'image/jpeg' ? 'jpg' : file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${auth.user.id}/${tripId}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from(BUCKET).upload(path, small, { contentType: small.type, upsert: false, cacheControl: '31536000' })
    if (up.error) throw new Error(up.error.message)
    return must(await supabase.from('photos').insert({ trip_id: tripId, stop_id: stopId ?? null, path }).select().single())
  },
  async deletePhoto(photo) {
    await supabase.storage.from(BUCKET).remove([photo.path])
    signed.delete(photo.path)
    must(await supabase.from('photos').delete().eq('id', photo.id))
  },
  photoUrl(path) {
    // Las fotos se firman al cargar los viajes (listTrips/getTrip); aquí solo se lee el enlace vigente.
    return signed.get(path)?.url ?? ''
  },

  async getVisited(userId) {
    const [c, s] = await Promise.all([
      supabase.from('visited_countries').select('country_code, source').eq('user_id', userId),
      supabase.from('visited_subdivisions').select('subdivision_code, source').eq('user_id', userId),
    ])
    return {
      countries: (must(c) as { country_code: string; source: 'trip' | 'manual' }[]).map((r) => ({ code: r.country_code, source: r.source })),
      subdivisions: (must(s) as { subdivision_code: string; source: 'trip' | 'manual' }[]).map((r) => ({
        code: r.subdivision_code,
        source: r.source,
      })),
    }
  },
  async setCountryMarked(code, marked) {
    must(
      marked
        ? await supabase.from('user_countries').upsert({ country_code: code })
        : await supabase.from('user_countries').delete().eq('country_code', code),
    )
  },
  async setSubdivisionMarked(code, marked) {
    must(
      marked
        ? await supabase.from('user_subdivisions').upsert({ subdivision_code: code })
        : await supabase.from('user_subdivisions').delete().eq('subdivision_code', code),
    )
  },
  async listWishlist() {
    return must(await supabase.from('wishlist').select('*').order('created_at'))
  },
  async exportMyData(userId) {
    const [profile, passports, trips, countries, subdivisions, wishlist] = await Promise.all([
      supabaseApi.getProfile(userId),
      supabaseApi.listPassports(),
      supabaseApi.listTrips(userId),
      supabase.from('user_countries').select('country_code').eq('user_id', userId),
      supabase.from('user_subdivisions').select('subdivision_code').eq('user_id', userId),
      supabaseApi.listWishlist(),
    ])
    return {
      profile,
      passports,
      trips,
      marked_countries: must(countries),
      marked_subdivisions: must(subdivisions),
      wishlist,
    }
  },
  async deleteMyAccount(userId) {
    // Primero los archivos (Storage no se vacía con el borrado en cascada de la base de datos).
    const photos = must(await supabase.from('photos').select('path').eq('user_id', userId)) as Pick<Photo, 'path'>[]
    for (let i = 0; i < photos.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 100).map((p) => p.path))
      if (error) throw new Error(error.message)
    }
    must(await supabase.rpc('delete_my_account'))
    await supabase.auth.signOut()
  },
  async setWish(code, wished, note) {
    must(
      wished
        ? await supabase.from('wishlist').upsert({ country_code: code, note: note ?? null })
        : await supabase.from('wishlist').delete().eq('country_code', code),
    )
  },
}
