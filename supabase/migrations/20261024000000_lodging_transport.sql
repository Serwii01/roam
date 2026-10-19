-- Alojamiento y transporte de un viaje, con fechas y horarios. Privado del viaje (como los gastos): las
-- paradas se ven en el perfil público y en el enlace compartido, pero los localizadores y horarios no.

-- Alojamientos: uno para toda la estancia (stop_id null) o uno o varios por parada.
create table public.lodgings (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips (id) on delete cascade,
  stop_id         uuid references public.stops (id) on delete set null,
  name            text not null check (length(name) between 1 and 160),
  address         text check (address is null or length(address) <= 300),
  check_in        date,
  check_in_time   text check (check_in_time is null or check_in_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check_out       date,
  check_out_time  text check (check_out_time is null or check_out_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  booking_ref     text check (booking_ref is null or length(booking_ref) <= 80),
  url             text check (url is null or (length(url) <= 500 and url ~ '^https?://')),
  notes           text check (notes is null or length(notes) <= 1000),
  user_id         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index lodgings_trip_idx on public.lodgings (trip_id, check_in);

-- Detalles del tramo que llega a cada parada: salida, horarios, compañía y localizador.
create table public.leg_details (
  stop_id      uuid primary key references public.stops (id) on delete cascade,
  trip_id      uuid not null references public.trips (id) on delete cascade,
  depart_on    date,
  depart_time  text check (depart_time is null or depart_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  arrive_time  text check (arrive_time is null or arrive_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  carrier      text check (carrier is null or length(carrier) <= 80),
  booking_ref  text check (booking_ref is null or length(booking_ref) <= 80),
  notes        text check (notes is null or length(notes) <= 500),
  updated_at   timestamptz not null default now()
);
create index leg_details_trip_idx on public.leg_details (trip_id);

alter table public.lodgings enable row level security;
create policy "ver alojamientos de mis viajes" on public.lodgings for select using (public.is_trip_member(trip_id));
create policy "añadir alojamientos a mis viajes" on public.lodgings for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id) and (stop_id is null or public.stop_in_trip(stop_id, trip_id)));
create policy "editar alojamientos de mis viajes" on public.lodgings for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id) and (stop_id is null or public.stop_in_trip(stop_id, trip_id)));
create policy "borrar alojamientos de mis viajes" on public.lodgings for delete using (public.is_trip_member(trip_id));

alter table public.leg_details enable row level security;
create policy "ver tramos de mis viajes" on public.leg_details for select using (public.is_trip_member(trip_id));
create policy "añadir tramos a mis viajes" on public.leg_details for insert
  with check (public.is_trip_member(trip_id) and public.stop_in_trip(stop_id, trip_id));
create policy "editar tramos de mis viajes" on public.leg_details for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id) and public.stop_in_trip(stop_id, trip_id));
create policy "borrar tramos de mis viajes" on public.leg_details for delete using (public.is_trip_member(trip_id));
