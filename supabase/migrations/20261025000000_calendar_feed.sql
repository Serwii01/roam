-- Suscripción al calendario: cada usuario puede tener un enlace secreto (token) que Calendario de iPhone,
-- Google Calendar u Outlook consultan solos cada pocas horas. La función de Vercel /cal/<token>.ics lo lee
-- con la clave pública a través de calendar_feed(): sin el token no se ve nada, y cambiarlo invalida el anterior.

create table public.calendar_feeds (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  token       uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
create policy "ver mi calendario" on public.calendar_feeds for select using (user_id = auth.uid());
create policy "crear mi calendario" on public.calendar_feeds for insert with check (user_id = auth.uid());
create policy "cambiar mi calendario" on public.calendar_feeds for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "borrar mi calendario" on public.calendar_feeds for delete using (user_id = auth.uid());

-- Viajes (propios y compartidos) del dueño del token que no acabaron hace más de un año, con lo que va al
-- calendario: paradas, sitios del día a día, alojamientos y horarios de los tramos. null si el token no existe.
create function public.calendar_feed(tok uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when f.user_id is null then null else jsonb_build_object(
    'trips', coalesce((
      select jsonb_agg(
        to_jsonb(t) - 'share_token' || jsonb_build_object(
          'stops', coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from stops s where s.trip_id = t.id), '[]'::jsonb),
          'sights', coalesce((select jsonb_agg(to_jsonb(x) order by x.day, x.time, x.position) from sights x where x.trip_id = t.id), '[]'::jsonb),
          'lodgings', coalesce((select jsonb_agg(to_jsonb(l) order by l.check_in) from lodgings l where l.trip_id = t.id), '[]'::jsonb),
          'legs', coalesce((select jsonb_agg(to_jsonb(d)) from leg_details d where d.trip_id = t.id), '[]'::jsonb)
        ) order by t.start_date)
      from trips t
      where (t.user_id = f.user_id or exists (select 1 from trip_members m where m.trip_id = t.id and m.user_id = f.user_id))
        and coalesce(t.end_date, t.start_date, (select max(s.arrived_on) from stops s where s.trip_id = t.id)) >= current_date - 365
    ), '[]'::jsonb)
  ) end
  from (select (select user_id from calendar_feeds where token = tok) as user_id) f
$$;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
