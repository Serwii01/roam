-- Avisos en el móvil (Web Push). Cada móvil o navegador que los activa guarda aquí su suscripción; la función
-- de Vercel /api/push los envía con la clave de servicio: cada mañana los que toquen ese día
-- (due_notifications) y, al momento, cuando alguien se une a un viaje.

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh      text not null check (length(p256dh) <= 200),
  auth        text not null check (length(auth) <= 100),
  user_agent  text check (user_agent is null or length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "ver mis suscripciones" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "crear mis suscripciones" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "cambiar mis suscripciones" on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "borrar mis suscripciones" on public.push_subscriptions for delete using (user_id = auth.uid());

-- Qué avisos quiere cada usuario (sin fila: todos).
create table public.notification_prefs (
  user_id   uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  travel    boolean not null default true,  -- vuelos, trenes, autobuses y barcos del día siguiente
  lodging   boolean not null default true,  -- entrada en el alojamiento ese día
  passport  boolean not null default true,  -- pasaporte caducado o a punto antes de un viaje
  social    boolean not null default true   -- alguien se une a uno de tus viajes
);

alter table public.notification_prefs enable row level security;
create policy "ver mis avisos" on public.notification_prefs for select using (user_id = auth.uid());
create policy "crear mis avisos" on public.notification_prefs for insert with check (user_id = auth.uid());
create policy "cambiar mis avisos" on public.notification_prefs for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Avisos que tocan el día `today` (hora de España; lo calcula quien llama), solo para usuarios con algún móvil
-- suscrito y que no hayan desactivado ese tipo:
--  · travel: tramos en avión, tren, autobús o barco (o con hora de salida) que salen mañana.
--  · lodging: entradas en un alojamiento hoy.
--  · passport: viajes planificados que empiezan dentro de 60, 30 o 7 días, fuera de la UE/EEE/Suiza, sin pasaporte
--    o con uno que caduca antes de volver o en los 6 meses siguientes (la misma regla que src/lib/passportCheck.ts).
-- Solo la usa la función de Vercel con la clave de servicio: devuelve datos privados de todos los usuarios.
create function public.due_notifications(today date) returns table (user_id uuid, kind text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  with people as (
    select t.id as trip_id, t.user_id from trips t
    union
    select m.trip_id, m.user_id from trip_members m
  ),
  subscribed as (
    select distinct s.user_id, coalesce(p.travel, true) as travel, coalesce(p.lodging, true) as lodging, coalesce(p.passport, true) as passport
    from push_subscriptions s left join notification_prefs p on p.user_id = s.user_id
  ),
  legs as (
    select pe.user_id, s.id as stop_id, t.id as trip_id, s.name, s.transport_in, s.flight_no, s.from_airport, s.to_airport,
      d.depart_time, d.carrier, d.booking_ref,
      (select p.name from stops p where p.trip_id = s.trip_id and p.position < s.position order by p.position desc limit 1) as from_name
    from stops s
    join trips t on t.id = s.trip_id
    left join leg_details d on d.stop_id = s.id
    join people pe on pe.trip_id = t.id
    where coalesce(d.depart_on, s.arrived_on) = today + 1
      and (s.transport_in in ('plane', 'train', 'bus', 'boat') or d.depart_time is not null)
      and exists (select 1 from stops p where p.trip_id = s.trip_id and p.position < s.position)
  ),
  lodging as (
    select pe.user_id, l.id, l.trip_id, l.name, l.address, l.check_in_time, l.booking_ref
    from lodgings l join people pe on pe.trip_id = l.trip_id
    where l.check_in = today
  ),
  soon_trips as (
    select pe.user_id, t.id as trip_id, t.title, t.start_date, coalesce(t.end_date, t.start_date) as end_date, t.start_date - today as days_left,
      coalesce(pr.home_country, 'ES') as home
    from trips t join people pe on pe.trip_id = t.id join profiles pr on pr.id = pe.user_id
    where t.status = 'planned' and t.start_date - today in (60, 30, 7)
  ),
  passport_issues as (
    select st.*, (select max(p.expires_on) from passports p where p.user_id = st.user_id) as expires_on,
      exists (select 1 from passports p where p.user_id = st.user_id) as has_passport
    from soon_trips st
    where exists (
      select 1 from stops s where s.trip_id = st.trip_id and s.country_code <> st.home
        and s.country_code not in ('AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','IS','LI','NO','CH','AD','MC','SM','VA')
    )
  )
  select l.user_id, 'travel',
    'Mañana: ' || case l.transport_in when 'plane' then 'vuelo' when 'train' then 'tren' when 'bus' then 'autobús' when 'boat' then 'barco' else 'trayecto' end
      || ' a ' || l.name,
    concat_ws(' · ',
      case when l.transport_in = 'plane' and l.from_airport is not null and l.to_airport is not null then l.from_airport || ' → ' || l.to_airport
           else coalesce(l.from_name || ' → ', '') || l.name end,
      case when l.depart_time is not null then 'sale a las ' || l.depart_time end,
      nullif(concat_ws(' ', l.flight_no, l.carrier), ''),
      case when l.booking_ref is not null then 'reserva ' || l.booking_ref end),
    '/app/viajes/' || l.trip_id, 'leg-' || l.stop_id
  from legs l join subscribed sb on sb.user_id = l.user_id and sb.travel
  union all
  select l.user_id, 'lodging', 'Hoy: entrada en ' || l.name,
    concat_ws(' · ', case when l.check_in_time is not null then 'a partir de las ' || l.check_in_time end, l.address,
      case when l.booking_ref is not null then 'reserva ' || l.booking_ref end),
    '/app/viajes/' || l.trip_id, 'lod-' || l.id
  from lodging l join subscribed sb on sb.user_id = l.user_id and sb.lodging
  union all
  select pi.user_id, 'passport', 'Tu pasaporte para «' || pi.title || '»',
    case
      when not pi.has_passport then 'Sales en ' || pi.days_left || ' días y no tienes ningún pasaporte guardado. Fuera de la UE suele hacer falta.'
      when pi.expires_on is not null and pi.expires_on < pi.end_date then 'Caduca el ' || to_char(pi.expires_on, 'DD/MM/YYYY') || ', antes de volver. Renuévalo antes de salir (en ' || pi.days_left || ' días).'
      else 'Caduca el ' || to_char(pi.expires_on, 'DD/MM/YYYY') || ': muchos países piden 6 meses de validez. Sales en ' || pi.days_left || ' días.'
    end,
    '/app/pasaporte', 'passport-' || pi.trip_id
  from passport_issues pi join subscribed sb on sb.user_id = pi.user_id and sb.passport
  where not pi.has_passport or (pi.expires_on is not null and pi.expires_on < pi.end_date + interval '6 months')
$$;
revoke execute on function public.due_notifications(date) from public, anon, authenticated;
grant execute on function public.due_notifications(date) to service_role;
