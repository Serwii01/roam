-- Día a día (estilo Wanderlog): los sitios de cada parada pasan a tener día, hora y nota, y sustituyen
-- al itinerario aparte (itinerary_items), para no tener dos listas de «qué hacer cada día».

alter table public.sights
  add column day date,
  add column time text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column notes text check (notes is null or length(notes) <= 1000);
create index sights_day_idx on public.sights (trip_id, day, time);

-- Lo que hubiera en el itinerario (con parada) pasa a sitios del día; luego se quita la tabla.
insert into public.sights (trip_id, stop_id, user_id, name, day, time, notes, done, position, created_at)
select trip_id, stop_id, user_id, left(title, 160), day, time, notes, done, position, created_at
from public.itinerary_items
where stop_id is not null;

drop table public.itinerary_items;
