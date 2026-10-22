// Prueba la migración y el seed en un Postgres embebido (PGlite), simulando el esquema `auth`
// de Supabase, y comprueba que las políticas RLS aíslan los datos de cada usuario.
// Uso: npm run test:db
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const root = path.resolve(import.meta.dirname, '..')
const db = new PGlite({ extensions: { pg_trgm } })

// Lo mínimo de Supabase: esquema auth, auth.uid() y los roles anon/authenticated.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  create role anon nologin;
  create role authenticated nologin;
`)

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).sort()
for (const m of migrations) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', m), 'utf8'))
await db.exec(fs.readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8'))
await db.exec(`
  grant usage on schema public, auth to anon, authenticated;
  grant select on all tables in schema public to anon, authenticated;
  grant insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`)

const one = async (q, p) => (await db.query(q, p)).rows[0]
const count = async (q, p) => Number((await one(q, p)).n)

console.log('Datos:', await one(`select (select count(*) from countries) países, (select count(*) from subdivisions) subdivisiones, (select count(*) from airports) aeropuertos`))
assert.equal((await one(`select name, parent_code, level from subdivisions where code = 'ES-M'`)).parent_code, 'ES-MD')
assert.equal((await one(`select name from countries where code = 'JP'`)).name, 'Japón')
const search = await db.query(`select iata, name from airports where (iata || ' ' || name || ' ' || coalesce(city, '')) ilike '%barajas%'`)
assert.ok(search.rows.some((r) => r.iata === 'MAD'), 'MAD encontrable por nombre')

const near = (await db.query(`select iata from nearest_airports(40.4168, -3.7038)`)).rows.map((r) => r.iata)
assert.equal(near[0], 'MAD', 'aeropuerto principal de Madrid')
const kyoto = (await db.query(`select iata from nearest_airports(35.0116, 135.7681)`)).rows.map((r) => r.iata)
console.log('Cerca de Madrid:', near, '· de Kioto:', kyoto)

// Registro: el disparador crea perfiles con usernames únicos.
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
await db.query(`insert into auth.users (id, email) values ($1, 'ana.lopez@example.com'), ($2, 'ana-lopez@example.com')`, [A, B])
const users = (await db.query(`select id, username from profiles order by username`)).rows
console.log('Perfiles:', users.map((u) => u.username))
assert.deepEqual(users.map((u) => u.username), ['analopez', 'analopez1'])

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

// Ana crea un viaje con dos paradas.
const tripId = await as(A, async () => {
  const t = await one(`insert into trips (title, start_date) values ('Madrid y Tokio', '2025-04-02') returning id`)
  await db.query(
    `insert into stops (trip_id, position, name, country_code, region_code, province_code, lat, lon)
     values ($1, 0, 'Madrid', 'ES', 'ES-MD', 'ES-M', 40.4, -3.7),
            ($1, 1, 'Tokio', 'JP', 'JP-13', null, 35.7, 139.7)`,
    [t.id],
  )
  await db.query(`update stops set transport_in = 'plane', from_airport = 'MAD', to_airport = 'HND' where trip_id = $1 and position = 1`, [t.id])
  await db.query(`update trips set soundtrack_url = 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' where id = $1`, [t.id])
  await db.query(`update stops set flight_no = 'IB6251' where trip_id = $1 and position = 1`, [t.id])
  await assert.rejects(db.query(`update stops set flight_no = 'vuelo raro' where trip_id = $1 and position = 1`, [t.id]), /check constraint/, 'número de vuelo válido')
  await assert.rejects(db.query(`update trips set soundtrack_url = 'https://evil.example/x' where id = $1`, [t.id]), /check constraint/, 'solo enlaces de Spotify')
  await db.query(`insert into user_countries (country_code) values ('FR')`)
  await db.query(`insert into user_subdivisions (subdivision_code) values ('ES-B')`)
  await db.query(`insert into photos (trip_id, path) values ($1, $2)`, [t.id, `${A}/foto.jpg`])
  await db.query(`insert into wishlist (country_code) values ('PE')`)
  await db.query(`insert into passports (country_code, expires_on) values ('ES', '2031-03-10')`)
  return t.id
})

await as(A, async () => {
  // Un viaje planificado no cuenta como visitado.
  const plan = await one(`insert into trips (title, status) values ('Patagonia', 'planned') returning id`)
  await db.query(`insert into stops (trip_id, position, name, country_code, region_code, lat, lon) values ($1, 0, 'El Chaltén', 'AR', 'AR-Z', -49.3, -72.9)`, [plan.id])
  assert.equal(await count(`select count(*) n from visited_countries`), 3, 'ES + JP + FR')
  assert.equal(await count(`select count(distinct subdivision_code) n from visited_subdivisions`), 4, 'ES-MD, ES-M, JP-13, ES-B')
})

// Berto no ve nada de Ana (perfil privado) ni puede escribir en su viaje.
await as(B, async () => {
  assert.equal(await count(`select count(*) n from trips`), 0)
  assert.equal(await count(`select count(*) n from stops`), 0)
  assert.equal(await count(`select count(*) n from passports`), 0)
  assert.equal(await count(`select count(*) n from photos`), 0)
  assert.equal(await count(`select count(*) n from wishlist`), 0)
  assert.equal(await count(`select count(*) n from visited_countries`), 0)
  assert.equal(await count(`select count(*) n from profiles`), 1, 'solo su propio perfil')
  await assert.rejects(
    db.query(`insert into stops (trip_id, position, name, country_code, lat, lon) values ($1, 2, 'Intruso', 'ES', 0, 0)`, [tripId]),
    /row-level security/,
  )
  const upd = await db.query(`update trips set title = 'hackeado' where id = $1`, [tripId])
  assert.equal(upd.affectedRows, 0)
})

// Si Ana hace público su perfil, Berto ve sus viajes pero no sus pasaportes.
await as(A, () => db.query(`update profiles set is_public = true where id = $1`, [A]))
await as(B, async () => {
  assert.equal(await count(`select count(*) n from trips`), 2, 'hecho + planificado')
  assert.equal(await count(`select count(*) n from stops`), 3)
  assert.equal(await count(`select count(*) n from visited_countries`), 3, 'el planificado no cuenta')
  assert.equal(await count(`select count(*) n from passports`), 0)
})

// Fotos (bucket privado): cada uno sube solo a su carpeta; un perfil privado no deja ver sus fotos.
await db.exec(`grant select, insert, delete on storage.objects to anon, authenticated; grant usage on schema storage to anon, authenticated;`)
await as(A, () => db.query(`update profiles set is_public = false where id = $1`, [A]))
await as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${A}/${tripId}/foto.jpg`]))
await as(B, async () => {
  await assert.rejects(db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${A}/${tripId}/intruso.jpg`]), /row-level security/)
  assert.equal(await count(`select count(*) n from storage.objects`), 0, 'Berto no ve fotos de un perfil privado')
})
await as(A, async () => assert.equal(await count(`select count(*) n from storage.objects`), 1, 'Ana ve las suyas'))
await as(A, () => db.query(`update profiles set is_public = true where id = $1`, [A]))
await as(B, async () => assert.equal(await count(`select count(*) n from storage.objects`), 1, 'con perfil público sí se ven'))

// ── Viajes compartidos ──
// Ana (perfil privado) invita a Berto por enlace; Carla no participa.
const C = '00000000-0000-0000-0000-00000000000c'
await db.query(`insert into auth.users (id, email) values ($1, 'carla@example.com')`, [C])
await as(A, () => db.query(`update profiles set is_public = false where id = $1`, [A]))
const token = await as(A, async () => (await one(`insert into trip_invites (trip_id) values ($1) returning token`, [tripId])).token)

// Vista previa sin sesión; aceptar exige sesión.
await db.exec('set role anon')
const preview = await one('select * from get_trip_invite($1)', [token])
assert.equal(preview.title, 'Madrid y Tokio')
assert.equal(preview.status, 'valid')
assert.equal(preview.stops, 2)
await assert.rejects(db.query('select accept_trip_invite($1)', [token]), /permission denied/)
await db.exec('reset role')

await as(B, async () => {
  assert.equal((await one('select * from get_trip_invite($1)', [token])).already_member, false)
  await assert.rejects(db.query(`insert into trip_invites (trip_id) values ($1)`, [tripId]), /row-level security/, 'solo el creador invita')
  assert.equal((await one('select accept_trip_invite($1) id', [token])).id, tripId)
  assert.equal((await one('select accept_trip_invite($1) id', [token])).id, tripId, 'aceptar dos veces no falla')
  assert.equal((await one('select * from get_trip_invite($1)', [token])).already_member, true)
  // Ve y edita el viaje compartido.
  assert.equal(await count('select count(*) n from trips'), 1, 've el compartido, no el planificado de Ana')
  assert.equal(await count('select count(*) n from stops'), 2)
  await db.query(`insert into stops (trip_id, position, name, country_code, region_code, lat, lon) values ($1, 2, 'Kioto', 'JP', 'JP-26', 35.0, 135.8)`, [tripId])
  assert.equal((await db.query(`update trips set title = 'Madrid, Tokio y Kioto' where id = $1`, [tripId])).affectedRows, 1)
  await assert.rejects(db.query('update trips set user_id = $1 where id = $2', [B, tripId]), /propietario/)
  assert.equal((await db.query('delete from trips where id = $1', [tripId])).affectedRows, 0, 'solo el creador borra el viaje')
  assert.equal((await db.query('delete from trip_invites')).affectedRows, 0, 'no gestiona invitaciones')
  // El viaje cuenta en su pasaporte.
  const mine = (await db.query('select country_code from visited_countries where user_id = $1 order by 1', [B])).rows.map((r) => r.country_code)
  assert.deepEqual(mine, ['ES', 'JP'])
  // Compañeros: nombre y avatar, sin abrir el resto del perfil privado de Ana.
  assert.equal((await db.query('select * from list_trip_members($1)', [tripId])).rows.length, 2)
  assert.equal(await count('select count(*) n from profiles'), 1, 'el perfil de Ana sigue privado')
  // Fotos: a su carpeta, y solo en viajes en los que participa.
  await db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${B}/${tripId}/berto.jpg`])
  await db.query('insert into photos (trip_id, path) values ($1, $2)', [tripId, `${B}/${tripId}/berto.jpg`])
  await assert.rejects(db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${B}/${A}/x.jpg`]), /row-level security/)
  assert.equal(await count('select count(*) n from storage.objects'), 2, 've las fotos del viaje (de Ana y suyas)')
  assert.equal(await count('select count(*) n from photos'), 2)
})

await as(A, async () => {
  assert.equal(await count('select count(*) n from stops where trip_id = $1', [tripId]), 3, 'Ana ve la parada de Berto')
  assert.equal(await count('select count(*) n from storage.objects'), 2, 'y su foto')
  assert.equal(await count('select count(*) n from trip_members'), 1)
})

await as(C, async () => {
  assert.equal(await count('select count(*) n from trips'), 0)
  assert.equal((await db.query('select * from list_trip_members($1)', [tripId])).rows.length, 0)
  assert.equal(await count('select count(*) n from trip_members'), 0)
  assert.equal(await count('select count(*) n from storage.objects'), 0)
  assert.equal((await db.query(`update stops set name = 'x' where trip_id = $1`, [tripId])).affectedRows, 0)
})

// Invitaciones caducadas, agotadas o revocadas.
const [expired, usedUp, revoked] = await as(A, async () => [
  (await one(`insert into trip_invites (trip_id, expires_at) values ($1, now() - interval '1 day') returning token`, [tripId])).token,
  (await one(`insert into trip_invites (trip_id, max_uses, uses) values ($1, 1, 1) returning token`, [tripId])).token,
  (await one(`insert into trip_invites (trip_id, revoked) values ($1, true) returning token`, [tripId])).token,
])
await as(C, async () => {
  await assert.rejects(db.query('select accept_trip_invite($1)', [expired]), /caducado/)
  await assert.rejects(db.query('select accept_trip_invite($1)', [usedUp]), /demasiadas/)
  await assert.rejects(db.query('select accept_trip_invite($1)', [revoked]), /no es válida/)
  await assert.rejects(db.query('select accept_trip_invite($1)', ['00000000-0000-0000-0000-000000000000']), /no existe/)
  assert.equal((await one('select * from get_trip_invite($1)', [expired])).status, 'expired')
  // Se une con el enlace bueno y luego se sale por su cuenta.
  await db.query('select accept_trip_invite($1)', [token])
  assert.equal(await count('select count(*) n from trips'), 1)
  assert.equal((await db.query('delete from trip_members where user_id = $1', [C])).affectedRows, 1)
  assert.equal(await count('select count(*) n from trips'), 0, 'al salir deja de verlo')
})
assert.equal((await one('select uses from trip_invites where token = $1', [token])).uses, 2)

// Berto borra su cuenta: su parada se queda en el viaje (sin autor) y su fila de foto desaparece.
await as(B, () => db.query('select public.delete_my_account()'))
assert.equal(await count('select count(*) n from stops where trip_id = $1', [tripId]), 3)
assert.equal(await count('select count(*) n from stops where trip_id = $1 and user_id is null', [tripId]), 1)
assert.equal(await count('select count(*) n from photos where trip_id = $1', [tripId]), 1)
assert.equal(await count('select count(*) n from trip_members'), 0)
await db.query(`insert into auth.users (id, email) values ($1, 'berto@example.com')`, [B])

// ── Sitios de las paradas ──
const stopId = (await one('select id from stops where trip_id = $1 order by position limit 1', [tripId])).id
await as(A, async () => {
  const s = await one(`insert into sights (stop_id, name, wiki_url, done) values ($1, 'Coliseo', 'https://es.wikipedia.org/wiki/Coliseo', true) returning trip_id`, [stopId])
  assert.equal(s.trip_id, tripId, 'el viaje sale de la parada')
  await assert.rejects(db.query(`insert into sights (stop_id, name, wiki_url) values ($1, 'x', 'https://evil.example/x')`, [stopId]), /check constraint/, 'solo enlaces de Wikipedia')
  // Aunque se intente colgar de otro viaje, se corrige al de la parada.
  const other = await one(`insert into trips (title) values ('Otro') returning id`)
  const fixed = await one(`insert into sights (stop_id, trip_id, name) values ($1, $2, 'Fontana di Trevi') returning trip_id`, [stopId, other.id])
  assert.equal(fixed.trip_id, tripId)
})
await as(C, async () => {
  await assert.rejects(db.query(`insert into sights (stop_id, name) values ($1, 'Intruso')`, [stopId]), /row-level security/)
  assert.equal(await count('select count(*) n from sights'), 0, 'no ve sitios de viajes ajenos privados')
})
await as(A, async () => assert.equal(await count('select count(*) n from sights'), 2))

// ── Presupuesto y gastos (privados del viaje) ──
const otherTripStop = await as(A, async () => {
  const o = await one(`insert into trips (title) values ('Ajeno al gasto') returning id`)
  return (await one(`insert into stops (trip_id, position, name, country_code, lat, lon) values ($1, 0, 'Oporto', 'PT', 41.1, -8.6) returning id`, [o.id])).id
})
await as(A, async () => {
  await db.query(`insert into trip_budgets (trip_id, currency, amount) values ($1, 'EUR', 2000)`, [tripId])
  await db.query(`insert into expenses (trip_id, stop_id, category, amount, currency, rate, paid_by) values ($1, $2, 'lodging', 60000, 'JPY', 0.0061, $3)`, [tripId, stopId, A])
  await db.query(`insert into expenses (trip_id, category, amount, currency) values ($1, 'transport', 850, 'EUR')`, [tripId])
  await assert.rejects(db.query(`insert into expenses (trip_id, category, amount, currency) values ($1, 'casino', 5, 'EUR')`, [tripId]), /check constraint/, 'solo categorías conocidas')
  await assert.rejects(db.query(`insert into expenses (trip_id, category, amount, currency) values ($1, 'food', -5, 'EUR')`, [tripId]), /check constraint/, 'importe positivo')
  await assert.rejects(db.query(`insert into expenses (trip_id, category, amount, currency, paid_by) values ($1, 'food', 5, 'EUR', $2)`, [tripId, C]), /row-level security/, 'solo paga un participante')
  await assert.rejects(db.query(`insert into expenses (trip_id, stop_id, category, amount, currency) values ($1, $2, 'food', 5, 'EUR')`, [tripId, otherTripStop]), /row-level security/, 'la parada es del viaje')
  assert.equal(Number((await one('select sum(amount * rate) n from expenses where trip_id = $1', [tripId])).n), 60000 * 0.0061 + 850)
})
// Reparto: pagado por un compañero sin cuenta y repartido por porcentajes.
await as(A, async () => {
  await db.query(`insert into expenses (trip_id, category, amount, currency, payer_key, split_mode, split) values ($1, 'drinks', 40, 'EUR', 'g:Lucía', 'percent', $2)`, [tripId, JSON.stringify([{ k: `u:${A}`, v: 70 }, { k: 'g:Lucía', v: 30 }])])
  await db.query(`update trips set style = 'gastro' where id = $1`, [tripId])
  await assert.rejects(db.query(`update trips set style = 'crucero espacial' where id = $1`, [tripId]), /check constraint/)
  await assert.rejects(db.query(`insert into expenses (trip_id, category, amount, currency, payer_key) values ($1, 'food', 5, 'EUR', 'x:raro')`, [tripId]), /check constraint/, 'persona válida')
  await assert.rejects(db.query(`insert into expenses (trip_id, category, amount, currency, payer_key, paid_by) values ($1, 'food', 5, 'EUR', $2, $3)`, [tripId, `u:${B}`, A]), /check constraint/, 'paid_by y payer_key coinciden')
  await db.query(`delete from expenses where category = 'drinks' and trip_id = $1`, [tripId])
})

// Carla entra en el viaje: puede pagar y ver los gastos.
await db.query('insert into trip_members (trip_id, user_id) values ($1, $2)', [tripId, C])
await as(C, async () => {
  await db.query(`insert into expenses (trip_id, category, amount, currency, paid_by) values ($1, 'food', 30, 'EUR', $2)`, [tripId, C])
  assert.equal(await count('select count(*) n from expenses'), 3)
  assert.equal(await count('select count(*) n from trip_budgets'), 1)
})
// Con el perfil de Ana público, Berto (que no participa) ve el viaje pero no el dinero.
await as(A, () => db.query('update profiles set is_public = true where id = $1', [A]))
await as(B, async () => {
  assert.ok((await count('select count(*) n from trips where id = $1', [tripId])) === 1)
  assert.equal(await count('select count(*) n from expenses'), 0, 'gastos privados')
  assert.equal(await count('select count(*) n from trip_budgets'), 0, 'presupuesto privado')
})
await db.exec('set role anon')
await assert.rejects(db.query('select public.is_trip_participant($1, $2)', [tripId, A]), /permission denied/)
await db.exec('reset role')

// ── Enlace público de un viaje y seguir a viajeros ──
await as(A, () => db.query('update profiles set is_public = false where id = $1', [A]))
const shareToken = await as(A, async () => (await one(`update trips set share_token = gen_random_uuid() where id = $1 returning share_token`, [tripId])).share_token)
await db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${A}/${tripId}/compartida.jpg`])
const tripFiles = await count(`select count(*) n from storage.objects where name like $1`, [`%/${tripId}/%`])
await db.exec('set role anon')
{
  const shared = (await one('select public.get_shared_trip($1) j', [shareToken])).j
  assert.equal(shared.trip.id, tripId)
  assert.ok(shared.stops.length >= 2 && shared.sights.length >= 1)
  assert.equal(shared.trip.share_token, undefined, 'el shareToken no se devuelve')
  assert.equal(shared.owner.username, null, 'perfil privado: sin usuario')
  assert.equal(shared.expenses, undefined, 'sin gastos')
  assert.equal((await one('select public.get_shared_trip($1) j', ['00000000-0000-0000-0000-000000000000'])).j, null)
  assert.equal(await count(`select count(*) n from storage.objects where name like $1`, [`%/${tripId}/%`]), tripFiles, 'las fotos del viaje compartido se pueden firmar')
  assert.equal(await count('select count(*) n from trips'), 0, 'sin sesión no se listan viajes')
}
await db.exec('reset role')
// Al quitar el enlace deja de funcionar.
await as(A, () => db.query('update trips set share_token = null where id = $1', [tripId]))
await db.exec('set role anon')
assert.equal((await one('select public.get_shared_trip($1) j', [shareToken])).j, null)
assert.equal(await count(`select count(*) n from storage.objects where name like $1`, [`%/${tripId}/%`]), 0)
await db.exec('reset role')

// Seguir: solo perfiles públicos; cada uno ve sus seguimientos.
await as(B, async () => {
  await assert.rejects(db.query('insert into follows (followee) values ($1)', [A]), /row-level security/, 'Ana es privada')
})
await as(A, () => db.query('update profiles set is_public = true where id = $1', [A]))
await as(B, async () => {
  await db.query('insert into follows (followee) values ($1)', [A])
  await assert.rejects(db.query('insert into follows (followee) values ($1)', [B]), /check constraint|row-level security/, 'no a sí mismo')
  assert.equal(await count('select count(*) n from follows'), 1)
})
await as(C, async () => {
  assert.equal(await count('select count(*) n from follows'), 0, 'Carla no ve a quién sigue Berto')
  const c = await one('select * from public.follow_counts($1)', [A])
  assert.equal(c.followers, 1)
})
await as(B, async () => assert.equal((await db.query('delete from follows where followee = $1', [A])).affectedRows, 1))

// ── Planificador: itinerario, equipaje y documentos (privados del viaje) ──
await as(A, async () => {
  await db.query(`insert into sights (stop_id, name, day, time) values ($1, 'Templo Senso-ji', '2025-04-03', '10:00')`, [stopId])
  await assert.rejects(db.query(`insert into sights (stop_id, name, day, time) values ($1, 'x', '2025-04-03', '25:00')`, [stopId]), /check constraint/, 'hora válida')
  await db.query(`insert into packing_items (trip_id, category, label) values ($1, 'docs', 'Pasaporte'), ($1, 'electronics', 'Cargador')`, [tripId])
  await assert.rejects(db.query(`insert into packing_items (trip_id, label) values ($1, 'Pasaporte')`, [tripId]), /unique|duplicate/, 'sin repetidos')
  await db.query(`insert into trip_documents (trip_id, name, kind, path) values ($1, 'Billete MAD-HND.pdf', 'flight', $2)`, [tripId, `${tripId}/billete.pdf`])
  await assert.rejects(db.query(`insert into trip_documents (trip_id, name, path) values ($1, 'x', 'otro-viaje/x.pdf')`, [tripId]), /row-level security/, 'la ruta es del viaje')
  await db.query(`insert into storage.objects (bucket_id, name) values ('trip-docs', $1)`, [`${tripId}/billete.pdf`])
  assert.equal(await count(`select count(*) n from storage.objects where bucket_id = 'trip-docs'`), 1)
})
await as(B, async () => {
  // Berto no participa (aunque el perfil de Ana sea público).
  assert.equal(await count('select count(*) n from packing_items'), 0)
  assert.equal(await count('select count(*) n from trip_documents'), 0)
  assert.equal(await count(`select count(*) n from storage.objects where bucket_id = 'trip-docs'`), 0, 'no ve los archivos')
  await assert.rejects(db.query(`insert into storage.objects (bucket_id, name) values ('trip-docs', $1)`, [`${tripId}/intruso.pdf`]), /row-level security/)
})
await as(C, async () => {
  // Carla es compañera: ve y marca el equipaje.
  assert.equal((await db.query(`update packing_items set packed = true where trip_id = $1`, [tripId])).affectedRows, 2)
  assert.equal(await count(`select count(*) n from storage.objects where bucket_id = 'trip-docs'`), 1)
})

// ── Alojamiento y transporte (privados del viaje) ──
await as(A, async () => {
  await db.query(`insert into lodgings (trip_id, name, check_in, check_in_time, check_out, check_out_time) values ($1, 'Apartamento todo el viaje', '2025-04-01', '15:00', '2025-04-08', '11:00')`, [tripId])
  await db.query(`insert into lodgings (trip_id, stop_id, name, booking_ref) values ($1, $2, 'Ryokan', 'ABC123')`, [tripId, stopId])
  await assert.rejects(db.query(`insert into lodgings (trip_id, stop_id, name) values ($1, $2, 'Ajeno')`, [tripId, otherTripStop]), /row-level security/, 'la parada es del viaje')
  await assert.rejects(db.query(`insert into lodgings (trip_id, name, check_in, check_out) values ($1, 'Al revés', '2025-04-08', '2025-04-01')`, [tripId]), /check constraint/, 'la salida no es antes de la entrada')
  await assert.rejects(db.query(`insert into lodgings (trip_id, name, check_in_time) values ($1, 'x', '24:30')`, [tripId]), /check constraint/, 'hora válida')
  await assert.rejects(db.query(`insert into lodgings (trip_id, name, url) values ($1, 'x', 'javascript:alert(1)')`, [tripId]), /check constraint/, 'solo enlaces web')
  await db.query(`insert into leg_details (stop_id, trip_id, depart_on, depart_time, arrive_time, carrier, booking_ref) values ($1, $2, '2025-04-01', '09:10', '13:45', 'Iberia', 'XYZ789')`, [stopId, tripId])
  await assert.rejects(db.query(`insert into leg_details (stop_id, trip_id) values ($1, $2)`, [otherTripStop, tripId]), /row-level security/, 'el tramo es del viaje')
})
await as(C, async () => {
  assert.equal(await count('select count(*) n from lodgings where trip_id = $1', [tripId]), 2, 'Carla los ve')
  assert.equal((await db.query(`update leg_details set arrive_time = '14:00' where trip_id = $1`, [tripId])).affectedRows, 1, 'y los edita')
})
await as(B, async () => {
  assert.equal(await count('select count(*) n from lodgings'), 0, 'alojamientos privados')
  assert.equal(await count('select count(*) n from leg_details'), 0, 'horarios privados')
})
await db.exec('set role anon')
assert.equal(await count('select count(*) n from lodgings'), 0)
await db.exec('reset role')

// Suscripción al calendario: el enlace secreto da los viajes (y su alojamiento) solo a quien lo tiene.
const oldTrip = await as(A, async () => {
  // El viaje de prueba pasa a ser de este mes; uno de 2019 se queda fuera (más de un año).
  await db.query(`update trips set start_date = current_date, end_date = current_date + 6 where id = $1`, [tripId])
  return (await one(`insert into trips (title, start_date, end_date) values ('Lisboa 2019', '2019-05-01', '2019-05-04') returning id`)).id
})
const feedToken = await as(A, async () => (await one('insert into calendar_feeds (user_id) values ($1) returning token', [A])).token)
await as(B, async () => {
  assert.equal(await count('select count(*) n from calendar_feeds'), 0, 'el token de otro no se ve')
  await assert.rejects(db.query('insert into calendar_feeds (user_id) values ($1)', [A]), /row-level security|duplicate key/, 'ni se crea por otro')
})
await db.exec('set role anon')
assert.equal(await count('select count(*) n from calendar_feeds'), 0, 'sin sesión no se ven los tokens')
const feed = (await one('select public.calendar_feed($1) f', [feedToken])).f
assert.ok(feed.trips.some((t) => t.id === tripId), 'el viaje compartido está en el calendario')
const fed = feed.trips.find((t) => t.id === tripId)
assert.ok(fed.lodgings.length > 0 && Array.isArray(fed.legs) && Array.isArray(fed.stops), 'con alojamientos, tramos y paradas')
assert.ok(!('share_token' in fed), 'sin el token del enlace público')
assert.ok(!feed.trips.some((t) => t.id === oldTrip), 'sin los viajes de hace más de un año')
assert.equal((await one('select public.calendar_feed($1) f', ['00000000-0000-4000-8000-000000000000'])).f, null, 'token inventado: nada')
await db.exec('reset role')
await as(C, async () => {
  const t = (await one('insert into calendar_feeds (user_id) values ($1) returning token', [C])).token
  await db.exec('set role anon')
  assert.ok((await one('select public.calendar_feed($1) f', [t])).f.trips.some((x) => x.id === tripId), 'también para los compañeros del viaje')
})

// Derecho de supresión: Ana borra su cuenta y desaparece todo lo suyo; Berto sigue intacto.
await as(A, () => db.query('select public.delete_my_account()'))
assert.equal(await count('select count(*) n from auth.users where id = $1', [A]), 0)
for (const t of ['profiles', 'trips', 'stops', 'photos', 'passports', 'user_countries', 'user_subdivisions', 'wishlist', 'sights'])
  assert.equal(await count(`select count(*) n from ${t} where ${t === 'profiles' ? 'id' : 'user_id'} = $1`, [A]), 0, `${t} borrado`)
assert.equal(await count('select count(*) n from profiles where id = $1', [B]), 1, 'el otro usuario sigue')
await db.exec('set role anon')
await assert.rejects(db.query('select public.delete_my_account()'), /permission denied/, 'sin sesión no se puede')
await db.exec('reset role')

// Los visitantes sin sesión leen la referencia pero no los perfiles privados.
await db.exec(`set role anon`)
assert.ok((await count(`select count(*) n from airports`)) > 5000)
await db.exec(`reset role`)

console.log('✓ Migración, seed y RLS correctos')
