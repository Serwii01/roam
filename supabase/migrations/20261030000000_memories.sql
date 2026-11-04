-- Recuerdos: «Hace 3 años llegabas a Estambul». Un aviso por la mañana el día que se cumplen años de una llegada,
-- como mucho uno al día por usuario. Se puede desactivar como el resto de los avisos.
alter table public.notification_prefs
  add column memories boolean not null default true;  -- aniversarios de llegadas de viajes realizados

-- Igual que en 20261026000000_push_notifications.sql, con los recuerdos: llegadas de viajes realizados tal día como
-- hoy en años anteriores, sin la ciudad de salida ni la vuelta a casa; primero con fotos y las más antiguas.
create or replace function public.due_notifications(today date) returns table (user_id uuid, kind text, title text, body text, url text, tag text)
language sql stable security definer set search_path = public as $$
  with people as (
    select t.id as trip_id, t.user_id from trips t
    union
    select m.trip_id, m.user_id from trip_members m
  ),
  subscribed as (
    select distinct s.user_id, coalesce(p.travel, true) as travel, coalesce(p.lodging, true) as lodging, coalesce(p.passport, true) as passport, coalesce(p.memories, true) as memories
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
  memory as (
    select distinct on (pe.user_id) pe.user_id, s.id as stop_id, t.id as trip_id, t.title, s.name,
      extract(year from today)::int - extract(year from s.arrived_on)::int as years
    from stops s
    join trips t on t.id = s.trip_id and t.status = 'done'
    join people pe on pe.trip_id = t.id
    join stops o on o.trip_id = t.id and o.position = (select min(x.position) from stops x where x.trip_id = t.id)
    where to_char(s.arrived_on, 'MM-DD') = to_char(today, 'MM-DD') and s.arrived_on < today
      and s.position > o.position
      and not (abs(s.lat - o.lat) < 0.3 and abs(s.lon - o.lon) < 0.3)
    order by pe.user_id, exists (select 1 from photos p where p.stop_id = s.id) desc, s.arrived_on, s.position
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
  union all
  select m.user_id, 'memory',
    case when m.years = 1 then 'Hace un año' else 'Hace ' || m.years || ' años' end || ' llegabas a ' || m.name,
    'Tal día como hoy, en «' || m.title || '». Toca para revivir el viaje.',
    '/app/viajes/' || m.trip_id || '?revive=1', 'memory-' || m.stop_id
  from memory m join subscribed sb on sb.user_id = m.user_id and sb.memories
$$;
