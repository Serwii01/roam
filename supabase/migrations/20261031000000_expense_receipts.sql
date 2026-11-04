-- Foto del ticket de un gasto. El archivo va en el bucket privado trip-docs, en la carpeta del viaje: las políticas
-- de ese bucket ya dejan verlo solo a los participantes. La comprobación impide apuntar a un archivo de otro viaje.
alter table public.expenses add column receipt_path text;

alter table public.expenses add constraint expenses_receipt_in_trip
  check (receipt_path is null or receipt_path like trip_id::text || '/%');
