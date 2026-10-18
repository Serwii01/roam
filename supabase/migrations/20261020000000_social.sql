-- Social: enlace público de un viaje (para quien no tiene cuenta) y seguir a otros viajeros.

-- ───────────────────────────── Enlace público de un viaje ─────────────────────────────
-- Quien tenga el enlace ve la ruta, las paradas, los sitios y las fotos. Nunca los gastos, el presupuesto
-- ni los compañeros. El creador lo crea o lo quita (cambiar el token invalida los enlaces anteriores).
alter table public.trips add column share_token uuid unique;

create function public.trip_is_shared(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = t and share_token is not null)
$$;

create function public.get_shared_trip(tok uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trip', to_jsonb(t) - 'share_token',
    'stops', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.position) from stops s where s.trip_id = t.id), '[]'::jsonb),
    'sights', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' order by x.position, x.created_at) from sights x where x.trip_id = t.id), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'trip_id', p.trip_id, 'stop_id', p.stop_id, 'path', p.path, 'caption', p.caption, 'created_at', p.created_at, 'user_id', null) order by p.created_at)
      from photos p where p.trip_id = t.id
    ), '[]'::jsonb),
    -- Del creador solo el nombre y el avatar (y su usuario si su perfil es público, para enlazarlo).
    'owner', jsonb_build_object('id', o.id, 'display_name', coalesce(o.display_name, o.username), 'avatar_url', o.avatar_url, 'username', case when o.is_public then o.username end)
  )
  from trips t join profiles o on o.id = t.user_id
  where t.share_token = tok
$$;
grant execute on function public.get_shared_trip(uuid) to anon, authenticated;

-- Fotos: también las de los viajes compartidos por enlace (las rutas solo se conocen con el enlace).
drop policy "ver fotos de viajes visibles" on storage.objects;
create policy "ver fotos de viajes visibles" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'trip-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_trip(public.trip_id_from_path(name))
      or public.trip_is_shared(public.trip_id_from_path(name))
    )
  );

-- ───────────────────────────── Seguir a viajeros ─────────────────────────────
-- Solo se sigue a perfiles públicos. Lo que se ve de ellos es lo de siempre: su perfil público.
create table public.follows (
  follower    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index follows_followee_idx on public.follows (followee);

alter table public.follows enable row level security;
create policy "ver mis seguimientos" on public.follows for select using (follower = auth.uid() or followee = auth.uid());
create policy "seguir perfiles públicos" on public.follows for insert
  with check (follower = auth.uid() and exists (select 1 from public.profiles p where p.id = followee and p.is_public));
create policy "dejar de seguir" on public.follows for delete using (follower = auth.uid());

-- Contadores de un perfil (sin decir quién): del propio o de uno público.
create function public.follow_counts(u uuid) returns table (followers int, following int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from follows where followee = u), (select count(*)::int from follows where follower = u)
  where u = auth.uid() or exists (select 1 from profiles where id = u and is_public)
$$;
grant execute on function public.follow_counts(uuid) to anon, authenticated;
