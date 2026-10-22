-- Viajes compartidos: solo el creador decide si el viaje está realizado o planificado. Cuando lo marca como
-- realizado, el viaje sale también en el perfil de cada compañero (su mapa, sus cifras y su lista de viajes,
-- también en su perfil público si lo tiene). Cada compañero puede quitarlo de su cuenta saliendo del viaje.

-- Los compañeros siguen pudiendo editar el viaje, pero no su estado.
create function public.trips_status_owner_only() returns trigger
language plpgsql as $$
begin
  -- Sin sesión (clave de servicio, migraciones) no se comprueba.
  if new.status is distinct from old.status and auth.uid() is not null and auth.uid() <> old.user_id then
    raise exception 'Solo quien creó el viaje puede marcarlo como realizado o planificado';
  end if;
  return new;
end $$;
create trigger trips_status_owner_only before update on public.trips
  for each row execute function public.trips_status_owner_only();

-- ¿Sale el viaje en el perfil público de alguno de sus compañeros? (realizado y con un compañero de perfil público)
create function public.on_public_profile(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trips tr
    join trip_members m on m.trip_id = tr.id
    join profiles p on p.id = m.user_id and p.is_public
    where tr.id = t and tr.status = 'done'
  )
$$;

create function public.trip_is_done(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = t and status = 'done')
$$;

-- Ver un viaje: participantes, perfil público del creador o perfil público de un compañero (si está realizado).
-- Lo usan paradas, sitios, fotos y la lista de compañeros; los gastos, el equipaje y los documentos siguen
-- siendo solo de los participantes.
create or replace function public.can_view_trip(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_trip_member(t)
      or exists (select 1 from trips tr join profiles p on p.id = tr.user_id where tr.id = t and p.is_public)
      or public.on_public_profile(t)
$$;

drop policy "leer viajes" on public.trips;
create policy "leer viajes" on public.trips for select
  using (public.can_read(user_id) or public.is_trip_member(id) or public.on_public_profile(id));

-- Quién va en un viaje realizado se ve desde el perfil (público) de cada compañero: así su mapa y sus cifras
-- cuentan el viaje (vistas visited_countries y visited_subdivisions).
drop policy "ver compañeros del viaje" on public.trip_members;
create policy "ver compañeros del viaje" on public.trip_members for select
  using (public.is_trip_member(trip_id) or (public.can_read(user_id) and public.trip_is_done(trip_id)));
