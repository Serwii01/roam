-- Notas en el día a día («descanso + cerveza», «comer en el mercado»): van en la lista de cada día junto a
-- los sitios, con su hora y su orden, pero no son un lugar: no cuentan como sitios vistos ni van a la ruta.
alter table public.sights
  add column kind text not null default 'place' check (kind in ('place', 'note'));
