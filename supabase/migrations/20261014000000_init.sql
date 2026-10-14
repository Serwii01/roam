-- Rumbo: esquema inicial.
-- Datos de referencia (países, regiones/provincias ISO 3166-2, aeropuertos) de lectura pública,
-- y datos de cada usuario (perfil, pasaportes, viajes, paradas, lugares marcados) protegidos con RLS.

-- En Supabase las extensiones van en el esquema `extensions` (no en `public`).
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────────── Referencia ─────────────────────────────

create table public.countries (
  code        char(2) primary key,
  name        text not null,           -- español
  name_en     text not null,
  continent   text not null check (continent in ('AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'))
);

-- Subdivisiones ISO 3166-2: regiones, estados, comunidades, provincias, departamentos…
create table public.subdivisions (
  code          text primary key,       -- p. ej. 'ES-MD' (comunidad) o 'ES-M' (provincia)
  country_code  char(2) not null references public.countries (code),
  name          text not null,
  type          text not null,          -- 'Province', 'State', 'Autonomous community'…
  parent_code   text references public.subdivisions (code) deferrable initially deferred,
  level         smallint not null default 1 check (level between 1 and 3)
);
create index subdivisions_country_idx on public.subdivisions (country_code);
create index subdivisions_parent_idx on public.subdivisions (parent_code);

create table public.airports (
  iata               char(3) primary key,
  icao               text,
  name               text not null,
  city               text,
  country_code       char(2) not null references public.countries (code),
  subdivision_code   text,              -- región según OurAirports (normalmente ISO 3166-2 nivel 1)
  lat                double precision not null,
  lon                double precision not null,
  size               text not null check (size in ('large', 'medium', 'small'))
);
create index airports_country_idx on public.airports (country_code);
create index airports_search_idx on public.airports using gin ((iata || ' ' || name || ' ' || coalesce(city, '')) extensions.gin_trgm_ops);

-- ───────────────────────────── Usuarios ─────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name  text,
  avatar_url    text,
  bio           text,
  home_country  char(2) references public.countries (code),
  home_city     text,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.passports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  country_code  char(2) not null references public.countries (code),
  issued_on     date,
  expires_on    date,
  created_at    timestamptz not null default now()
);
create index passports_user_idx on public.passports (user_id);

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null check (length(title) between 1 and 120),
  description   text,
  start_date    date,
  end_date      date,
  cover_url     text,
  status        text not null default 'done' check (status in ('done', 'planned')),
  style         text check (style in ('backpacker', 'roadtrip', 'relax', 'cultural', 'adventure', 'business')),
  solo          boolean not null default false,
  companions    text[] not null default '{}',
  -- Banda sonora: enlace de Spotify (playlist, álbum, canción, artista o podcast) mostrado con su reproductor embebido.
  soundtrack_url text check (soundtrack_url ~ '^https://open.spotify.com/'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index trips_user_idx on public.trips (user_id, start_date desc);

-- Cada parada guarda cómo se llegó a ella desde la anterior (transport_in).
create table public.stops (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  position          integer not null,
  name              text not null,
  country_code      char(2) not null references public.countries (code),
  region_code       text references public.subdivisions (code),   -- nivel 1 (comunidad, estado…)
  province_code     text references public.subdivisions (code),   -- nivel 2 si existe (provincia…)
  lat               double precision not null,
  lon               double precision not null,
  arrived_on        date,
  notes             text,
  rating            smallint check (rating between 1 and 5),
  tags              text[] not null default '{}',
  song_url          text check (song_url ~ '^https://open.spotify.com/'),   -- canción de ese día/parada
  transport_in      text check (transport_in in ('plane', 'train', 'car', 'bus', 'boat', 'bike', 'walk')),
  from_airport      char(3) references public.airports (iata),
  to_airport        char(3) references public.airports (iata),
  created_at        timestamptz not null default now()
);
create index stops_trip_idx on public.stops (trip_id, position);
create index stops_user_idx on public.stops (user_id);

-- Lugares marcados a mano (estilo Been), además de los que salen de los viajes.
create table public.user_countries (
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  country_code  char(2) not null references public.countries (code),
  primary key (user_id, country_code)
);

create table public.user_subdivisions (
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subdivision_code  text not null references public.subdivisions (code),
  primary key (user_id, subdivision_code)
);

-- Fotos de un viaje (o de una parada). El archivo vive en Storage: trip-photos/{user_id}/…
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  stop_id     uuid references public.stops (id) on delete set null,
  path        text not null,
  caption     text,
  created_at  timestamptz not null default now()
);
create index photos_trip_idx on public.photos (trip_id);

-- Bucket list: países que se quieren visitar.
create table public.wishlist (
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  country_code  char(2) not null references public.countries (code),
  note          text,
  created_at    timestamptz not null default now(),
  primary key (user_id, country_code)
);

-- ───────────────────────────── Disparadores ─────────────────────────────

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

-- Al registrarse se crea el perfil con un nombre de usuario único derivado del email o de los metadatos (OAuth).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'viajero'),
    '[^a-zA-Z0-9_]', '', 'g'));
  if length(base) < 3 then base := base || 'viajero'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── Seguridad (RLS) ─────────────────────────────

alter table public.countries enable row level security;
alter table public.subdivisions enable row level security;
alter table public.airports enable row level security;
create policy "referencia pública" on public.countries for select using (true);
create policy "referencia pública" on public.subdivisions for select using (true);
create policy "referencia pública" on public.airports for select using (true);

alter table public.profiles enable row level security;
create policy "perfil propio o público" on public.profiles for select
  using (id = auth.uid() or is_public);
create policy "editar perfil propio" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ¿Puede el usuario actual leer los datos de `owner`? (suyos, o de un perfil público)
create function public.can_read(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or exists (select 1 from public.profiles p where p.id = owner and p.is_public)
$$;

alter table public.passports enable row level security;
create policy "gestionar pasaportes propios" on public.passports for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.trips enable row level security;
create policy "leer viajes" on public.trips for select using (public.can_read(user_id));
create policy "gestionar viajes propios" on public.trips for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.stops enable row level security;
create policy "leer paradas" on public.stops for select using (public.can_read(user_id));
create policy "gestionar paradas propias" on public.stops for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

alter table public.user_countries enable row level security;
create policy "leer países marcados" on public.user_countries for select using (public.can_read(user_id));
create policy "gestionar países propios" on public.user_countries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.user_subdivisions enable row level security;
create policy "leer regiones marcadas" on public.user_subdivisions for select using (public.can_read(user_id));
create policy "gestionar regiones propias" on public.user_subdivisions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.photos enable row level security;
create policy "leer fotos" on public.photos for select using (public.can_read(user_id));
create policy "gestionar fotos propias" on public.photos for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

alter table public.wishlist enable row level security;
create policy "leer deseos" on public.wishlist for select using (public.can_read(user_id));
create policy "gestionar deseos propios" on public.wishlist for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────────── Funciones ─────────────────────────────

-- Aeropuertos más cercanos a un punto (para proponer origen/destino de un vuelo).
create function public.nearest_airports(lat double precision, lon double precision, max_km double precision default 150, n int default 3)
returns table (iata char(3), name text, city text, country_code char(2), km double precision)
language sql stable set search_path = public as $$
  select a.iata, a.name, a.city, a.country_code, d.km
  from airports a
  cross join lateral (
    select 12742 * asin(sqrt(
      power(sin(radians(a.lat - nearest_airports.lat) / 2), 2) +
      cos(radians(nearest_airports.lat)) * cos(radians(a.lat)) * power(sin(radians(a.lon - nearest_airports.lon) / 2), 2)
    )) as km
  ) d
  where a.lat between nearest_airports.lat - max_km / 111.0 and nearest_airports.lat + max_km / 111.0
    and d.km <= max_km
  -- Prefiere el aeropuerto principal aunque haya uno pequeño algo más cerca.
  order by d.km + case a.size when 'large' then 0 when 'medium' then 40 else 80 end
  limit n
$$;

-- Derecho de supresión (RGPD): el usuario borra su propia cuenta. El borrado en cascada desde auth.users
-- elimina perfil, pasaportes, viajes, paradas, fotos (filas), marcas y deseos. Los archivos de Storage
-- los borra antes la app (la API de Storage es la única forma segura de eliminarlos).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ───────────────────────────── Vistas ─────────────────────────────

-- Países visitados por usuario: los de las paradas de viajes hechos más los marcados a mano.
create view public.visited_countries with (security_invoker = true) as
  select s.user_id, s.country_code, 'trip'::text as source
  from public.stops s join public.trips t on t.id = s.trip_id and t.status = 'done'
  union
  select user_id, country_code, 'manual' from public.user_countries;

-- Regiones y provincias visitadas por usuario.
create view public.visited_subdivisions with (security_invoker = true) as
  select s.user_id, x.code as subdivision_code, 'trip'::text as source
  from public.stops s
  join public.trips t on t.id = s.trip_id and t.status = 'done'
  cross join lateral (values (s.region_code), (s.province_code)) as x (code)
  where x.code is not null
  union
  select user_id, subdivision_code, 'manual' from public.user_subdivisions;
