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
  create table storage.buckets (id text primary key, name text, public boolean);
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
await as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${A}/viaje/foto.jpg`]))
await as(B, async () => {
  await assert.rejects(db.query(`insert into storage.objects (bucket_id, name) values ('trip-photos', $1)`, [`${A}/viaje/intruso.jpg`]), /row-level security/)
  assert.equal(await count(`select count(*) n from storage.objects`), 0, 'Berto no ve fotos de un perfil privado')
})
await as(A, async () => assert.equal(await count(`select count(*) n from storage.objects`), 1, 'Ana ve las suyas'))
await as(A, () => db.query(`update profiles set is_public = true where id = $1`, [A]))
await as(B, async () => assert.equal(await count(`select count(*) n from storage.objects`), 1, 'con perfil público sí se ven'))

// Derecho de supresión: Ana borra su cuenta y desaparece todo lo suyo; Berto sigue intacto.
await as(A, () => db.query('select public.delete_my_account()'))
assert.equal(await count('select count(*) n from auth.users where id = $1', [A]), 0)
for (const t of ['profiles', 'trips', 'stops', 'photos', 'passports', 'user_countries', 'user_subdivisions', 'wishlist'])
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
