-- Planificador de un viaje: itinerario por días, lista de equipaje y documentos (billetes, reservas…).
-- Todo es privado del viaje: solo lo ven y editan sus participantes (ni el perfil público ni el enlace).

create table public.itinerary_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  stop_id     uuid references public.stops (id) on delete set null,
  day         date not null,
  time        text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title       text not null check (length(title) between 1 and 160),
  notes       text check (notes is null or length(notes) <= 1000),
  done        boolean not null default false,
  position    integer not null default 0,
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index itinerary_trip_idx on public.itinerary_items (trip_id, day, time);

create table public.packing_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  category    text not null default 'other' check (category in ('docs', 'clothes', 'toiletries', 'electronics', 'health', 'other')),
  label       text not null check (length(label) between 1 and 80),
  packed      boolean not null default false,
  position    integer not null default 0,
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (trip_id, label)
);
create index packing_trip_idx on public.packing_items (trip_id);

-- Documentos: el archivo vive en el bucket privado trip-docs, en {trip_id}/{archivo}.
create table public.trip_documents (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  name        text not null check (length(name) between 1 and 160),
  kind        text not null default 'other' check (kind in ('flight', 'lodging', 'insurance', 'ticket', 'other')),
  path        text not null unique,
  mime        text,
  size        integer check (size is null or size between 0 and 10485760),
  created_at  timestamptz not null default now()
);
create index documents_trip_idx on public.trip_documents (trip_id);

alter table public.itinerary_items enable row level security;
create policy "ver itinerario de mis viajes" on public.itinerary_items for select using (public.is_trip_member(trip_id));
create policy "añadir al itinerario de mis viajes" on public.itinerary_items for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id) and (stop_id is null or public.stop_in_trip(stop_id, trip_id)));
create policy "editar itinerario de mis viajes" on public.itinerary_items for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id) and (stop_id is null or public.stop_in_trip(stop_id, trip_id)));
create policy "borrar del itinerario de mis viajes" on public.itinerary_items for delete using (public.is_trip_member(trip_id));

alter table public.packing_items enable row level security;
create policy "ver equipaje de mis viajes" on public.packing_items for select using (public.is_trip_member(trip_id));
create policy "añadir equipaje a mis viajes" on public.packing_items for insert with check (user_id = auth.uid() and public.is_trip_member(trip_id));
create policy "editar equipaje de mis viajes" on public.packing_items for update using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "borrar equipaje de mis viajes" on public.packing_items for delete using (public.is_trip_member(trip_id));

alter table public.trip_documents enable row level security;
create policy "ver documentos de mis viajes" on public.trip_documents for select using (public.is_trip_member(trip_id));
create policy "subir documentos a mis viajes" on public.trip_documents for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id) and path like trip_id::text || '/%');
create policy "borrar documentos de mis viajes" on public.trip_documents for delete using (public.is_trip_member(trip_id));

-- ───────────────────────────── Archivos (bucket privado) ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-docs', 'trip-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Id del viaje a partir de la ruta {viaje}/{archivo}; null si no es válida.
create function public.doc_trip_id(name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid end
$$;

create policy "ver documentos de viajes en los que participo" on storage.objects for select to authenticated
  using (bucket_id = 'trip-docs' and public.is_trip_member(public.doc_trip_id(name)));
create policy "subir documentos a viajes en los que participo" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-docs' and public.is_trip_member(public.doc_trip_id(name)));
create policy "borrar documentos de viajes en los que participo" on storage.objects for delete to authenticated
  using (bucket_id = 'trip-docs' and public.is_trip_member(public.doc_trip_id(name)));
