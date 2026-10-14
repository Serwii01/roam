-- Bucket PRIVADO de fotos de viajes: la app pide enlaces firmados temporales. Así las fotos de un
-- perfil privado no se pueden ver con solo conocer el enlace.
-- Estructura de rutas: {user_id}/{trip_id}/{archivo}
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false)
on conflict (id) do update set public = false;

create policy "ver fotos propias o de perfiles públicos" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'trip-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id::text = (storage.foldername(name))[1] and p.is_public)
    )
  );

create policy "subir fotos propias" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "borrar fotos propias" on storage.objects for delete to authenticated
  using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text);
