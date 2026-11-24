-- Gastos en grupo sin descuadres: pagos que confirma quien los recibe, cambios de efectivo, historial de cada gasto,
-- cierre de cuentas y avisos al momento. Todo es compatible con la versión anterior de la app: las columnas nuevas
-- tienen valor por defecto y las rellenan los disparadores.

-- ── Columnas ──
alter table public.expenses
  -- Solo en los pagos ('settlement'): los rechazados no cuentan en los saldos.
  add column payment_status text check (payment_status is null or payment_status in ('pending', 'confirmed', 'rejected')),
  -- 'payment': pago de una deuda. 'cash': cambio de efectivo entre dos personas. No es una categoría nueva para que las
  -- versiones anteriores de la app lo sigan tratando como un pago.
  add column transfer_kind text check (transfer_kind is null or transfer_kind in ('payment', 'cash'));
update public.expenses set payment_status = 'confirmed', transfer_kind = 'payment' where category = 'settlement';

-- Cuentas cerradas: los gastos del viaje no se pueden cambiar hasta reabrirlas.
alter table public.trip_budgets
  add column closed_at timestamptz,
  add column closed_by uuid references public.profiles (id) on delete set null;

-- Los dos interruptores que faltaban y los recordatorios: activados por defecto, como el resto.
alter table public.notification_prefs
  add column expenses boolean not null default true,  -- gastos que apunta, cambia o borra un compañero
  add column payments boolean not null default true,  -- pagos, confirmaciones y cierre de cuentas
  add column reminders boolean not null default true; -- deudas pendientes al acabar, pagos sin confirmar y gastos del día

-- ── Historial de cada gasto ──
create table public.expense_history (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  expense_id  uuid not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index expense_history_trip_idx on public.expense_history (trip_id, created_at desc);
alter table public.expense_history enable row level security;
-- Solo lectura: lo escribe el disparador.
create policy "ver el historial de mis viajes" on public.expense_history for select using (public.is_trip_member(trip_id));

-- ── Bandeja de avisos (la de la app y la cola de los que van al móvil) ──
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  trip_id     uuid references public.trips (id) on delete cascade,
  kind        text not null check (kind in ('expenses', 'payments', 'reminders', 'travel', 'lodging', 'passport', 'social', 'memories')),
  title       text not null,
  body        text not null default '',
  url         text not null default '/app',
  tag         text,
  -- Para no repetir el mismo aviso si el cron se ejecuta dos veces.
  dedupe      text unique,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  read_at     timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unsent_idx on public.notifications (created_at) where sent_at is null;
alter table public.notifications enable row level security;
create policy "ver mis notificaciones" on public.notifications for select using (user_id = auth.uid());
create policy "borrar mis notificaciones" on public.notifications for delete using (user_id = auth.uid());

create function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- Avisos por enviar: los marca como enviados y los devuelve (así dos envíos a la vez no los repiten), sin los que cada
-- uno haya desactivado. Con `actor`, solo los que provocó esa persona; sin él (cron), todos.
create function public.claim_notifications(actor uuid default null)
returns table (user_id uuid, trip_id uuid, kind text, title text, body text, url text, tag text)
language sql security definer set search_path = public as $$
  with claimed as (
    update notifications n set sent_at = now()
    where n.sent_at is null and n.created_at > now() - interval '1 day' and (actor is null or n.actor_id = actor)
    returning n.*
  )
  select c.user_id, c.trip_id, c.kind, c.title, c.body, c.url, c.tag
  from claimed c left join notification_prefs p on p.user_id = c.user_id
  where case c.kind
    when 'expenses' then coalesce(p.expenses, true) when 'payments' then coalesce(p.payments, true) when 'reminders' then coalesce(p.reminders, true)
    when 'travel' then coalesce(p.travel, true) when 'lodging' then coalesce(p.lodging, true) when 'passport' then coalesce(p.passport, true)
    when 'social' then coalesce(p.social, true) else coalesce(p.memories, true) end
  order by c.created_at
$$;
revoke execute on function public.claim_notifications(uuid) from public, anon, authenticated;
grant execute on function public.claim_notifications(uuid) to service_role;

-- ── Ayudas ──
create function public.person_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(display_name, ''), username) from profiles where id = u), 'Alguien')
$$;
create function public.money_label(amount numeric, currency text) returns text
language sql immutable as $$
  select replace(to_char(amount, 'FM9999999990.00'), '.', ',') || ' ' || case currency when 'EUR' then '€' when 'USD' then '$' when 'GBP' then '£' else currency end
$$;
-- Lo que le toca a una persona de un gasto, en la moneda del gasto (null si no hay reparto guardado).
create function public.expense_share(e public.expenses, person text) returns numeric
language sql stable as $$
  select case
    when e.split is null then null
    when e.split_mode = 'percent' then e.amount * mine / 100
    when e.split_mode = 'amount' then mine
    when total = 0 then 0
    else e.amount * mine / total end
  from (
    select
      coalesce(sum(v) filter (where k = person), 0) as mine,
      coalesce(sum(v), 0) as total
    from (
      select x ->> 'k' as k, case when e.split_mode = 'equal' then (case when (x ->> 'v')::numeric > 0 then 1 else 0 end) else greatest((x ->> 'v')::numeric, 0) end as v
      from jsonb_array_elements(coalesce(e.split, '[]'::jsonb)) x
    ) parts
  ) s
$$;
revoke execute on function public.person_name(uuid) from public, anon, authenticated;

-- ── Antes de guardar un gasto: cuentas cerradas y estado de los pagos ──
create function public.expenses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me text := 'u:' || auth.uid()::text;
  trip uuid := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  receiver text;
  changed boolean;
begin
  -- Se está borrando el viaje entero: nada que comprobar.
  if not exists (select 1 from trips where id = trip) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Un gasto no cambia de viaje: se saltaría el cierre y el historial del otro.
  if tg_op = 'UPDATE' and new.trip_id <> old.trip_id then raise exception 'Un gasto no se puede pasar a otro viaje'; end if;

  -- Lo que cambia sola la base de datos (parada o cuenta borradas) y la confirmación no son cambios del gasto.
  changed := tg_op <> 'UPDATE'
    or (to_jsonb(new) - array['payment_status', 'stop_id', 'user_id', 'paid_by']) is distinct from (to_jsonb(old) - array['payment_status', 'stop_id', 'user_id', 'paid_by'])
    or (new.paid_by is not null and new.paid_by is distinct from old.paid_by);

  if changed and auth.uid() is not null and exists (select 1 from trip_budgets where trip_id = trip and closed_at is not null) then
    raise exception 'Las cuentas de este viaje están cerradas. Reábrelas para cambiar los gastos.';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.category <> 'settlement' then
    new.payment_status := null;
    new.transfer_kind := null;
    return new;
  end if;
  new.transfer_kind := coalesce(new.transfer_kind, 'payment');
  receiver := new.split -> 0 ->> 'k';
  if tg_op = 'INSERT' or changed then
    -- Lo confirma quien lo recibe; si lo apunta esa misma persona o no tiene cuenta, ya está confirmado.
    new.payment_status := case when auth.uid() is null or receiver is null or receiver = me or receiver not like 'u:%' then 'confirmed' else 'pending' end;
  elsif new.payment_status is distinct from old.payment_status and auth.uid() is not null and receiver is distinct from me then
    raise exception 'Solo quien recibe el pago puede confirmarlo o rechazarlo.';
  end if;
  return new;
end $$;
create trigger expenses_guard before insert or update or delete on public.expenses for each row execute function public.expenses_guard();

-- ── Después de guardar: historial y avisos ──
create function public.expenses_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  row_ public.expenses := case when tg_op = 'DELETE' then old else new end;
  noise text[] := array['stop_id', 'user_id', 'paid_by', 'receipt_path'];
  who text;
  what text;
  trip_title text;
  link text;
  payer uuid;
  receiver uuid;
  p record;
  share numeric;
begin
  select title into trip_title from trips where id = row_.trip_id;
  if trip_title is null then return null; end if; -- el viaje se está borrando
  if tg_op = 'UPDATE' and (to_jsonb(new) - noise) = (to_jsonb(old) - noise) then return null; end if;

  insert into expense_history (trip_id, expense_id, actor_id, action, before, after)
  values (row_.trip_id, row_.id, me, lower(tg_op), case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if me is null then return null; end if; -- cambios del servidor: sin avisos

  who := person_name(me);
  link := '/app/viajes/' || row_.trip_id || '?tab=gastos';

  if row_.category = 'settlement' then
    payer := nullif(substring(coalesce(row_.payer_key, 'u:' || row_.paid_by::text) from '^u:(.*)$'), '')::uuid;
    receiver := nullif(substring(row_.split -> 0 ->> 'k' from '^u:(.*)$'), '')::uuid;
    what := money_label(row_.amount, row_.currency);
    for p in
      select distinct x.id from unnest(array[payer, receiver]) as x(id)
      where x.id is not null and x.id <> me and public.is_trip_participant(row_.trip_id, x.id)
    loop
      insert into notifications (user_id, actor_id, trip_id, kind, title, body, url, tag) values (
        p.id, me, row_.trip_id, 'payments',
        case
          when tg_op = 'DELETE' then who || ' ha deshecho un pago de ' || what
          when tg_op = 'UPDATE' and new.payment_status is distinct from old.payment_status and new.payment_status = 'confirmed' then who || ' ha confirmado tu pago de ' || what
          when tg_op = 'UPDATE' and new.payment_status is distinct from old.payment_status and new.payment_status = 'rejected' then who || ' dice que no ha recibido los ' || what
          when tg_op = 'UPDATE' then who || ' ha cambiado un pago: ' || what
          when p.id = receiver and row_.transfer_kind = 'cash' then who || ' ha apuntado que te dieron ' || what || ' en efectivo'
          when p.id = receiver and payer = me then who || ' dice que te ha pagado ' || what
          when p.id = receiver then who || ' ha apuntado que ' || coalesce(person_name(payer), 'alguien') || ' te ha pagado ' || what
          else who || ' ha apuntado que le has pagado ' || what end,
        case when tg_op <> 'DELETE' and row_.payment_status = 'pending' and p.id = receiver then 'Confírmalo si lo has recibido · ' else '' end || trip_title,
        link || '&ver=saldos', 'pay-' || row_.id);
    end loop;
    return null;
  end if;

  what := coalesce(nullif(row_.description, ''), 'un gasto') || ' · ' || money_label(row_.amount, row_.currency);
  for p in select distinct x.id from (select user_id as id from trips where id = row_.trip_id union select user_id from trip_members where trip_id = row_.trip_id) x where x.id <> me
  loop
    share := public.expense_share(row_, 'u:' || p.id::text);
    -- Solo a quien le toca algo, a quien lo pagó o a quien le tocaba antes del cambio.
    if share is null or share > 0 or row_.payer_key = 'u:' || p.id::text
      or (tg_op = 'UPDATE' and (coalesce(public.expense_share(old, 'u:' || p.id::text), 0) > 0 or old.payer_key = 'u:' || p.id::text)) then
      insert into notifications (user_id, actor_id, trip_id, kind, title, body, url, tag) values (
        p.id, me, row_.trip_id, 'expenses',
        who || case tg_op when 'INSERT' then ' ha apuntado ' when 'UPDATE' then ' ha cambiado ' else ' ha borrado ' end || what,
        case when tg_op <> 'DELETE' and share > 0 then 'Tu parte: ' || money_label(round(share, 2), row_.currency) || ' · ' else '' end || trip_title,
        link, 'exp-' || row_.id);
    end if;
  end loop;
  return null;
end $$;
create trigger expenses_activity after insert or update or delete on public.expenses for each row execute function public.expenses_activity();

-- ── Cierre de cuentas ──
create function public.budget_close_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.closed_at is null) is distinct from (old.closed_at is null) then
    new.closed_at := case when new.closed_at is not null then now() end;
    new.closed_by := case when new.closed_at is not null then auth.uid() end;
  else
    new.closed_at := old.closed_at;
    -- Si se borra la cuenta de quien lo cerró, se queda sin nombre.
    if new.closed_by is not null then new.closed_by := old.closed_by; end if;
  end if;
  return new;
end $$;
create trigger budget_close_guard before insert or update on public.trip_budgets for each row execute function public.budget_close_guard();

create function public.budget_close_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or (new.closed_at is null) = (old.closed_at is null) then return null; end if;
  insert into notifications (user_id, actor_id, trip_id, kind, title, body, url, tag)
  select distinct x.id, auth.uid(), new.trip_id, 'payments',
    person_name(auth.uid()) || case when new.closed_at is null then ' ha reabierto las cuentas' else ' ha cerrado las cuentas' end,
    (select title from trips where id = new.trip_id), '/app/viajes/' || new.trip_id || '?tab=gastos&ver=saldos', 'close-' || new.trip_id
  from (select user_id as id from trips where id = new.trip_id union select user_id from trip_members where trip_id = new.trip_id) x
  where x.id <> auth.uid();
  return null;
end $$;
create trigger budget_close_activity after update on public.trip_budgets for each row execute function public.budget_close_activity();

-- Las funciones de disparador no se llaman a mano.
revoke execute on function public.expenses_guard() from public, anon, authenticated;
revoke execute on function public.expenses_activity() from public, anon, authenticated;
revoke execute on function public.budget_close_guard() from public, anon, authenticated;
revoke execute on function public.budget_close_activity() from public, anon, authenticated;

-- ── Tiempo real ── Se escucha el historial (y no los gastos): así también llegan los borrados. RLS decide qué ve cada uno.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.expense_history, public.trip_budgets, public.notifications;
  end if;
end $$;
