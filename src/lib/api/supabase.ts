// Implementación real sobre Supabase. Las consultas de usuario dependen de RLS: Supabase solo
// devuelve las filas del usuario con sesión (o de perfiles públicos).
import type { Airport, Expense, InvitePreview, Photo, PublicProfile, SharedTrip, Stop, TripMember, TripWithStops } from '../db'
import { prepareImage } from '../images'
import { must, supabase } from '../supabase'
import type { Api } from './types'

const BUCKET = 'trip-photos'
const DOCS = 'trip-docs'

// ── Enlaces firmados de fotos (bucket privado) ──
const SIGNED_TTL = 6 * 3600 // segundos
const signed = new Map<string, { url: string; expires: number }>()

/** Miniatura de cada foto (640 px), guardada junto a ella al subirla. Las fotos antiguas no la tienen. */
const thumbOf = (path: string) => path.replace(/\.jpg$/, '.t.jpg')

/** Firma de golpe las fotos (y sus miniaturas) que aún no tienen un enlace vigente (≥30 min de margen). */
async function signPhotos(paths: string[]) {
  const now = Date.now()
  const all = paths.flatMap((p) => (p.endsWith('.jpg') ? [p, thumbOf(p)] : [p]))
  const missing = [...new Set(all)].filter((p) => (signed.get(p)?.expires ?? 0) - now < 30 * 60_000)
  if (!missing.length) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL)
  if (error) throw new Error(error.message)
  // Sin enlace (p. ej. una foto antigua sin miniatura) se apunta vacío para no volver a pedirlo en un rato.
  for (const d of data ?? []) if (d.path) signed.set(d.path, { url: d.signedUrl ?? '', expires: now + SIGNED_TTL * 1000 })
  setTimeout(() => void backfillThumbs(paths), 4000)
}

/** Crea en segundo plano las miniaturas que faltan de tus fotos antiguas (unas pocas cada vez). */
const backfilled = new Set<string>()
async function backfillThumbs(paths: string[]) {
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  if (!uid) return
  const todo = [...new Set(paths)]
    .filter((p) => p.startsWith(`${uid}/`) && p.endsWith('.jpg') && !backfilled.has(p) && signed.get(p)?.url && signed.get(thumbOf(p))?.url === '')
    .slice(0, 12)
  for (const p of todo) {
    backfilled.add(p)
    try {
      const blob = await (await fetch(signed.get(p)!.url)).blob()
      const thumb = await prepareImage(new File([blob], 'foto.jpg', { type: 'image/jpeg' }), 640)
      const up = await supabase.storage.from(BUCKET).upload(thumbOf(p), thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
      if (up.error) continue
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(thumbOf(p), SIGNED_TTL)
      if (data?.signedUrl) signed.set(thumbOf(p), { url: data.signedUrl, expires: Date.now() + SIGNED_TTL * 1000 })
    } catch {
      /* se intentará en otra sesión */
    }
  }
}

const TRIP_SELECT = '*, stops(*), photos(*), sights(*), trip_members(count)'
const PUBLIC_PROFILE = 'id, username, display_name, avatar_url, bio, home_country'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TripRow = TripWithStops & { trip_members?: { count: number }[] }

const sortTrip = ({ trip_members, ...t }: TripRow): TripWithStops => ({
  ...t,
  member_count: trip_members?.[0]?.count ?? 0,
  stops: [...(t.stops ?? [])].sort((a, b) => a.position - b.position),
  photos: [...(t.photos ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  sights: [...(t.sights ?? [])].sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || (a.time ?? '99').localeCompare(b.time ?? '99') || a.position - b.position || a.created_at.localeCompare(b.created_at)),
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
    // Los suyos y los compartidos en los que participa (RLS solo deja ver los que puede ver quien consulta).
    const shared = (must(await supabase.from('trip_members').select('trip_id').eq('user_id', userId)) as { trip_id: string }[]).map((m) => m.trip_id)
    const query = supabase.from('trips').select(TRIP_SELECT)
    const rows = must(
      await (shared.length ? query.or(`user_id.eq.${userId},id.in.(${shared.join(',')})`) : query.eq('user_id', userId)).order('start_date', {
        ascending: false,
        nullsFirst: true,
      }),
    ) as TripRow[]
    await signPhotos(rows.flatMap((t) => (t.photos ?? []).map((p) => p.path)))
    return rows.map(sortTrip)
  },
  async getTrip(id) {
    const row = must(await supabase.from('trips').select(TRIP_SELECT).eq('id', id).maybeSingle()) as TripRow | null
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
    if (photos.length) await supabase.storage.from(BUCKET).remove(photos.flatMap((p) => [p.path, thumbOf(p.path)]))
    const docs = must(await supabase.from('trip_documents').select('path').eq('trip_id', id)) as { path: string }[]
    if (docs.length) await supabase.storage.from(DOCS).remove(docs.map((d) => d.path))
    must(await supabase.from('trips').delete().eq('id', id))
  },

  async listTripMembers(tripId) {
    return must(await supabase.rpc('list_trip_members', { t: tripId })) as TripMember[]
  },
  async removeTripMember(tripId, userId) {
    must(await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId))
  },
  async listInvites(tripId) {
    return must(
      await supabase
        .from('trip_invites')
        .select('*')
        .eq('trip_id', tripId)
        .eq('revoked', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    )
  },
  async createInvite(tripId) {
    return must(await supabase.from('trip_invites').insert({ trip_id: tripId }).select().single())
  },
  async revokeInvite(token) {
    must(await supabase.from('trip_invites').update({ revoked: true }).eq('token', token))
  },
  async getInvite(token) {
    if (!UUID.test(token)) return null
    const rows = must(await supabase.rpc('get_trip_invite', { invite: token })) as InvitePreview[]
    return rows[0] ?? null
  },
  async acceptInvite(token) {
    if (!UUID.test(token)) throw new Error('La invitación no existe')
    return must(await supabase.rpc('accept_trip_invite', { invite: token })) as string
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

  async addSight(stopId, sight) {
    // trip_id lo pone la base de datos a partir de la parada.
    return must(await supabase.from('sights').insert({ ...sight, stop_id: stopId }).select().single())
  },
  async updateSight(id, patch) {
    return must(await supabase.from('sights').update(patch).eq('id', id).select().single())
  },
  async deleteSight(id) {
    must(await supabase.from('sights').delete().eq('id', id))
  },

  async getProfileByUsername(username) {
    return must(await supabase.from('profiles').select('*').eq('username', username.toLowerCase()).maybeSingle())
  },
  async setTripShare(tripId, enabled) {
    const token = enabled ? crypto.randomUUID() : null
    must(await supabase.from('trips').update({ share_token: token }).eq('id', tripId))
    return token
  },
  async getSharedTrip(token) {
    if (!UUID.test(token)) return null
    const data = must(await supabase.rpc('get_shared_trip', { tok: token })) as { trip: TripWithStops; stops: Stop[]; sights: TripWithStops['sights']; photos: Photo[]; owner: SharedTrip['owner'] } | null
    if (!data) return null
    await signPhotos(data.photos.map((p) => p.path))
    return { trip: sortTrip({ ...data.trip, stops: data.stops, sights: data.sights, photos: data.photos }), owner: data.owner }
  },
  async searchProfiles(q) {
    const s = q.trim().replace(/[%_,()]/g, ' ')
    if (s.length < 2) return []
    return must(
      await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE)
        .eq('is_public', true)
        .or(`username.ilike.%${s}%,display_name.ilike.%${s}%`)
        .limit(12),
    ) as PublicProfile[]
  },
  async listFollowing() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return []
    return (must(await supabase.from('follows').select('followee').eq('follower', auth.user.id)) as { followee: string }[]).map((r) => r.followee)
  },
  async getProfiles(ids) {
    if (!ids.length) return []
    return must(await supabase.from('profiles').select(PUBLIC_PROFILE).in('id', ids)) as PublicProfile[]
  },
  async follow(userId) {
    must(await supabase.from('follows').insert({ followee: userId }))
  },
  async unfollow(userId) {
    must(await supabase.from('follows').delete().eq('followee', userId))
  },
  async followCounts(userId) {
    const rows = must(await supabase.rpc('follow_counts', { u: userId })) as { followers: number; following: number }[]
    return rows[0] ?? { followers: 0, following: 0 }
  },
  async listFriendsTrips(userIds) {
    if (!userIds.length) return []
    const rows = must(
      await supabase.from('trips').select(TRIP_SELECT).in('user_id', userIds).eq('status', 'done').order('start_date', { ascending: false, nullsFirst: false }).limit(24),
    ) as TripRow[]
    await signPhotos(rows.flatMap((t) => (t.photos ?? []).map((p) => p.path)))
    return rows.map(sortTrip)
  },

  async listPacking(tripId) {
    return must(await supabase.from('packing_items').select('*').eq('trip_id', tripId).order('position').order('created_at'))
  },
  async addPackingItems(tripId, items) {
    if (!items.length) return
    must(await supabase.from('packing_items').upsert(items.map((i) => ({ ...i, trip_id: tripId })), { onConflict: 'trip_id,label', ignoreDuplicates: true }))
  },
  async updatePackingItem(id, patch) {
    return must(await supabase.from('packing_items').update(patch).eq('id', id).select().single())
  },
  async deletePackingItem(id) {
    must(await supabase.from('packing_items').delete().eq('id', id))
  },
  async listDocuments(tripId) {
    return must(await supabase.from('trip_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }))
  },
  async uploadDocument(tripId, file, kind) {
    if (file.size > 10 * 1024 * 1024) throw new Error('El archivo pasa de 10 MB.')
    const ext = (file.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '').toLowerCase()
    const path = `${tripId}/${crypto.randomUUID()}${ext}`
    const up = await supabase.storage.from(DOCS).upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (up.error) throw new Error(up.error.message.includes('mime') ? 'Solo PDF o imágenes (JPG, PNG, WebP).' : up.error.message)
    const row = await supabase.from('trip_documents').insert({ trip_id: tripId, name: file.name.slice(0, 160), kind, path, mime: file.type || null, size: file.size }).select().single()
    if (row.error) await supabase.storage.from(DOCS).remove([path])
    return must(row)
  },
  async deleteDocument(doc) {
    await supabase.storage.from(DOCS).remove([doc.path])
    must(await supabase.from('trip_documents').delete().eq('id', doc.id))
  },
  async documentUrl(doc) {
    const { data, error } = await supabase.storage.from(DOCS).createSignedUrl(doc.path, 300)
    if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir el documento')
    return data.signedUrl
  },

  async getBudget(tripId) {
    return must(await supabase.from('trip_budgets').select('*').eq('trip_id', tripId).maybeSingle())
  },
  async setBudget(tripId, budget) {
    return must(await supabase.from('trip_budgets').upsert({ trip_id: tripId, ...budget, updated_at: new Date().toISOString() }).select().single())
  },
  async listExpenses(tripId) {
    const rows = must(await supabase.from('expenses').select('*').eq('trip_id', tripId).order('spent_on', { ascending: true, nullsFirst: false }).order('created_at')) as Expense[]
    // numeric llega como número o texto según el tamaño: se normaliza.
    return rows.map((e) => ({ ...e, amount: Number(e.amount), rate: Number(e.rate) }))
  },
  async addExpense(tripId, expense) {
    return must(await supabase.from('expenses').insert({ ...expense, trip_id: tripId }).select().single())
  },
  async updateExpense(id, patch) {
    return must(await supabase.from('expenses').update(patch).eq('id', id).select().single())
  },
  async deleteExpense(id) {
    must(await supabase.from('expenses').delete().eq('id', id))
  },

  async uploadPhoto(tripId, file, stopId) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Sin sesión')
    // HEIC → JPEG, máx. 2000 px y sin EXIF/GPS: una foto de móvil de 5-10 MB queda en unos cientos de KB.
    const small = await prepareImage(file)
    const path = `${auth.user.id}/${tripId}/${crypto.randomUUID()}.jpg`
    const up = await supabase.storage.from(BUCKET).upload(path, small, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
    if (up.error) throw new Error(up.error.message)
    // Miniatura para las cuadrículas: si falla, se usa la foto entera.
    try {
      const thumb = await prepareImage(small, 640)
      await supabase.storage.from(BUCKET).upload(thumbOf(path), thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
    } catch {
      /* sin miniatura */
    }
    return must(await supabase.from('photos').insert({ trip_id: tripId, stop_id: stopId ?? null, path }).select().single())
  },
  async deletePhoto(photo) {
    await supabase.storage.from(BUCKET).remove([photo.path, thumbOf(photo.path)])
    signed.delete(photo.path)
    signed.delete(thumbOf(photo.path))
    must(await supabase.from('photos').delete().eq('id', photo.id))
  },
  photoUrl(path) {
    // Las fotos se firman al cargar los viajes (listTrips/getTrip); aquí solo se lee el enlace vigente.
    return signed.get(path)?.url ?? ''
  },
  photoThumbUrl(path) {
    return signed.get(thumbOf(path))?.url || signed.get(path)?.url || ''
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
    const [expenses, budgets] = await Promise.all([supabase.from('expenses').select('*'), supabase.from('trip_budgets').select('*')])
    return {
      profile,
      passports,
      trips,
      expenses: must(expenses),
      budgets: must(budgets),
      marked_countries: must(countries),
      marked_subdivisions: must(subdivisions),
      wishlist,
    }
  },
  async deleteMyAccount(userId) {
    // Primero los archivos (Storage no se vacía con el borrado en cascada de la base de datos).
    // Las suyas y las de los viajes que creó (al borrarse la cuenta, esos viajes desaparecen con sus fotos).
    const owned = (must(await supabase.from('trips').select('id').eq('user_id', userId)) as { id: string }[]).map((t) => t.id)
    const filter = owned.length ? `user_id.eq.${userId},trip_id.in.(${owned.join(',')})` : `user_id.eq.${userId}`
    const photos = must(await supabase.from('photos').select('path').or(filter)) as Pick<Photo, 'path'>[]
    for (let i = 0; i < photos.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 100).map((p) => p.path))
      if (error) throw new Error(error.message)
    }
    if (owned.length) {
      const docs = must(await supabase.from('trip_documents').select('path').in('trip_id', owned)) as { path: string }[]
      for (let i = 0; i < docs.length; i += 100) await supabase.storage.from(DOCS).remove(docs.slice(i, i + 100).map((d) => d.path))
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
