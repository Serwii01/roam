-- Sitios de cada parada: lo que se visitó (Coliseo, Fontana di Trevi…) o, en un plan, lo que se quiere ver.
-- Las sugerencias vienen de Wikipedia; también se pueden escribir a mano.

create table public.sights (
  id          uuid primary key default gen_random_uuid(),
  -- Lo rellena el disparador a partir de la parada: el cliente solo envía stop_id.
  trip_id     uuid not null references public.trips (id) on delete cascade,
  stop_id     uuid not null references public.stops (id) on delete cascade,
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  name        text not null check (length(name) between 1 and 160),
  lat         double precision check (lat between -90 and 90),
  lon         double precision check (lon between -180 and 180),
  -- Artículo de Wikipedia del sitio, si viene de una sugerencia o de la búsqueda.
  wiki_url    text check (wiki_url ~ '^https://[a-z-]+\.wikipedia\.org/wiki/'),
  -- En un plan: ya visto. En un viaje hecho se marcan como vistos al añadirlos.
  done        boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index sights_trip_idx on public.sights (trip_id);
create index sights_stop_idx on public.sights (stop_id, position);

-- El viaje es siempre el de la parada (nadie puede colgar un sitio de una parada de otro viaje).
create function public.sights_set_trip() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select trip_id into new.trip_id from stops where id = new.stop_id;
  if new.trip_id is null then raise exception 'La parada no existe'; end if;
  return new;
end $$;
create trigger sights_set_trip before insert or update of stop_id on public.sights
  for each row execute function public.sights_set_trip();

alter table public.sights enable row level security;
create policy "leer sitios" on public.sights for select using (public.can_view_trip(trip_id));
create policy "añadir sitios a mis viajes" on public.sights for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));
create policy "editar sitios de mis viajes" on public.sights for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "borrar sitios de mis viajes" on public.sights for delete using (public.is_trip_member(trip_id));
