-- Viajes compartidos: el creador invita por enlace y los compañeros pueden editar el viaje.
-- El viaje cuenta como visitado para todos los participantes.

-- ───────────────────────────── Tablas ─────────────────────────────

create table public.trip_members (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'editor' check (role in ('editor')),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

-- Enlace de invitación: el token es el secreto. Caduca y tiene un máximo de usos.
create table public.trip_invites (
  token       uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role        text not null default 'editor' check (role in ('editor')),
  expires_at  timestamptz not null default now() + interval '14 days',
  max_uses    int default 10 check (max_uses is null or max_uses > 0),
  uses        int not null default 0,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index trip_invites_trip_idx on public.trip_invites (trip_id);

-- Las paradas pertenecen al viaje: su autor puede faltar (si borra su cuenta, la parada se queda).
alter table public.stops alter column user_id drop not null;
alter table public.stops drop constraint stops_user_id_fkey;
alter table public.stops add constraint stops_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;

-- Nadie puede quedarse con un viaje cambiando su propietario.
create function public.trips_keep_owner() returns trigger
language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el propietario de un viaje';
  end if;
  return new;
end $$;
create trigger trips_keep_owner before update on public.trips
  for each row execute function public.trips_keep_owner();

-- ───────────────────────────── Funciones de permisos ─────────────────────────────
-- security definer: consultan sin RLS para que las políticas no se llamen a sí mismas.

create function public.is_trip_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = t and user_id = auth.uid())
$$;

create function public.is_trip_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = t and user_id = auth.uid())
      or exists (select 1 from trip_members where trip_id = t and user_id = auth.uid())
$$;

-- Ver un viaje: participantes, o cualquiera si el creador tiene el perfil público.
create function public.can_view_trip(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_trip_member(t)
      or exists (select 1 from trips tr join profiles p on p.id = tr.user_id where tr.id = t and p.is_public)
$$;

-- Participantes de un viaje con lo mínimo para mostrarlos (nombre y avatar), aunque su perfil sea privado.
create function public.list_trip_members(t uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, 'owner', tr.created_at
  from trips tr join profiles p on p.id = tr.user_id
  where tr.id = t and public.can_view_trip(t)
  union all
  select p.id, p.username, p.display_name, p.avatar_url, m.role, m.created_at
  from trip_members m join profiles p on p.id = m.user_id
  where m.trip_id = t and public.can_view_trip(t)
  order by 6
$$;

-- Id del viaje a partir de la ruta de una foto ({usuario}/{viaje}/{archivo}); null si no es válida.
create function public.trip_id_from_path(name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[2])::uuid end
$$;

-- ───────────────────────────── Invitaciones ─────────────────────────────

-- Vista previa de una invitación (también sin sesión, para enseñar a qué viaje te invitan).
create function public.get_trip_invite(invite uuid)
returns table (trip_id uuid, title text, start_date date, end_date date, stops int,
               owner_name text, owner_username text, owner_avatar text, owner_id uuid,
               status text, already_member boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.start_date, t.end_date,
         (select count(*)::int from stops s where s.trip_id = t.id),
         coalesce(p.display_name, p.username), p.username, p.avatar_url, p.id,
         case when i.revoked then 'revoked'
              when i.expires_at < now() then 'expired'
              when i.max_uses is not null and i.uses >= i.max_uses then 'used_up'
              else 'valid' end,
         auth.uid() is not null and public.is_trip_member(t.id)
  from trip_invites i
  join trips t on t.id = i.trip_id
  join profiles p on p.id = t.user_id
  where i.token = invite
$$;

-- Aceptar una invitación: valida el enlace y añade al usuario como compañero. Devuelve el viaje.
create function public.accept_trip_invite(invite uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i trip_invites;
  added int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para unirte al viaje'; end if;
  select * into i from trip_invites where token = invite for update;
  if not found then raise exception 'La invitación no existe'; end if;
  if public.is_trip_member(i.trip_id) then return i.trip_id; end if;
  if i.revoked then raise exception 'La invitación ya no es válida'; end if;
  if i.expires_at < now() then raise exception 'La invitación ha caducado'; end if;
  if i.max_uses is not null and i.uses >= i.max_uses then raise exception 'La invitación ya se ha usado demasiadas veces'; end if;
  insert into trip_members (trip_id, user_id, role, invited_by)
  values (i.trip_id, auth.uid(), i.role, i.created_by)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then update trip_invites set uses = uses + 1 where token = invite; end if;
  return i.trip_id;
end $$;

revoke execute on function public.accept_trip_invite(uuid) from public, anon;
grant execute on function public.accept_trip_invite(uuid) to authenticated;
grant execute on function public.get_trip_invite(uuid) to anon, authenticated;

-- ───────────────────────────── Seguridad (RLS) ─────────────────────────────

alter table public.trip_members enable row level security;
create policy "ver compañeros del viaje" on public.trip_members for select using (public.is_trip_member(trip_id));
-- Se entra solo con accept_trip_invite. Sale uno mismo o le quita el creador.
create policy "salir o expulsar" on public.trip_members for delete using (user_id = auth.uid() or public.is_trip_owner(trip_id));

alter table public.trip_invites enable row level security;
create policy "el creador gestiona las invitaciones" on public.trip_invites for all
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id) and created_by = auth.uid());

-- Viajes: los ven los participantes; los editan; solo el creador los crea a su nombre y los borra.
drop policy "leer viajes" on public.trips;
drop policy "gestionar viajes propios" on public.trips;
create policy "leer viajes" on public.trips for select using (public.can_read(user_id) or public.is_trip_member(id));
create policy "crear viajes propios" on public.trips for insert with check (user_id = auth.uid());
create policy "editar viajes propios o compartidos" on public.trips for update
  using (public.is_trip_member(id)) with check (public.is_trip_member(id));
create policy "borrar viajes propios" on public.trips for delete using (user_id = auth.uid());

-- Paradas: las editan todos los participantes; al crear, el autor es uno mismo.
drop policy "leer paradas" on public.stops;
drop policy "gestionar paradas propias" on public.stops;
create policy "leer paradas" on public.stops for select using (public.can_view_trip(trip_id));
create policy "crear paradas en mis viajes" on public.stops for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));
create policy "editar paradas de mis viajes" on public.stops for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "borrar paradas de mis viajes" on public.stops for delete using (public.is_trip_member(trip_id));

-- Fotos: las suben los participantes; las borra quien las subió o el creador del viaje.
drop policy "leer fotos" on public.photos;
drop policy "gestionar fotos propias" on public.photos;
create policy "leer fotos" on public.photos for select using (public.can_view_trip(trip_id));
create policy "subir fotos a mis viajes" on public.photos for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));
create policy "editar fotos de mis viajes" on public.photos for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "borrar fotos propias o de mis viajes" on public.photos for delete
  using (user_id = auth.uid() or public.is_trip_owner(trip_id));

-- Archivos de fotos: los ve quien puede ver el viaje; los borra su autor o el creador del viaje.
drop policy "ver fotos propias o de perfiles públicos" on storage.objects;
drop policy "borrar fotos propias" on storage.objects;
create policy "ver fotos de viajes visibles" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'trip-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.can_view_trip(public.trip_id_from_path(name)))
  );
create policy "borrar fotos propias o de mis viajes" on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_trip_owner(public.trip_id_from_path(name)))
  );
-- Subir: cada uno a su carpeta y solo a viajes en los que participa.
drop policy "subir fotos propias" on storage.objects;
create policy "subir fotos a mis viajes" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_trip_member(public.trip_id_from_path(name))
  );

-- ───────────────────────────── Lugares visitados ─────────────────────────────
-- Un viaje compartido cuenta para su creador y para cada compañero.

create view public.trip_participants with (security_invoker = true) as
  select id as trip_id, user_id, 'owner'::text as role from public.trips
  union all
  select trip_id, user_id, role from public.trip_members;

drop view public.visited_countries;
create view public.visited_countries with (security_invoker = true) as
  select p.user_id, s.country_code, 'trip'::text as source
  from public.stops s
  join public.trips t on t.id = s.trip_id and t.status = 'done'
  join public.trip_participants p on p.trip_id = t.id
  union
  select user_id, country_code, 'manual' from public.user_countries;

drop view public.visited_subdivisions;
create view public.visited_subdivisions with (security_invoker = true) as
  select p.user_id, x.code as subdivision_code, 'trip'::text as source
  from public.stops s
  join public.trips t on t.id = s.trip_id and t.status = 'done'
  join public.trip_participants p on p.trip_id = t.id
  cross join lateral (values (s.region_code), (s.province_code)) as x (code)
  where x.code is not null
  union
  select user_id, subdivision_code, 'manual' from public.user_subdivisions;
