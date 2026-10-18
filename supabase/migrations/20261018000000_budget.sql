-- Presupuesto y gastos de un viaje. Son datos privados del viaje: solo los ven sus participantes
-- (no quien mira un perfil público), por eso van en tablas propias y no en «trips».

-- Presupuesto y moneda del viaje (la de los totales). Una fila por viaje.
create table public.trip_budgets (
  trip_id     uuid primary key references public.trips (id) on delete cascade,
  currency    char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  amount      numeric(12, 2) check (amount is null or amount >= 0),
  updated_at  timestamptz not null default now()
);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  stop_id     uuid references public.stops (id) on delete set null,
  -- Quién lo apuntó y quién lo pagó (puede ser otro participante).
  user_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  paid_by     uuid references public.profiles (id) on delete set null,
  category    text not null check (category in ('transport', 'lodging', 'food', 'activities', 'shopping', 'fees', 'other')),
  description text check (description is null or length(description) <= 160),
  amount      numeric(12, 2) not null check (amount > 0),
  currency    char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- Unidades de la moneda del viaje por cada unidad de «currency», fijado al apuntar el gasto.
  rate        numeric(20, 10) not null default 1 check (rate > 0),
  spent_on    date,
  created_at  timestamptz not null default now()
);
create index expenses_trip_idx on public.expenses (trip_id, spent_on);

-- ¿Es `u` el creador o un compañero del viaje `t`? (para «pagado por»)
create function public.is_trip_participant(t uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = t and user_id = u)
      or exists (select 1 from trip_members where trip_id = t and user_id = u)
$$;

-- ¿Pertenece la parada `s` al viaje `t`?
create function public.stop_in_trip(s uuid, t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stops where id = s and trip_id = t)
$$;

alter table public.trip_budgets enable row level security;
create policy "ver presupuesto de mis viajes" on public.trip_budgets for select using (public.is_trip_member(trip_id));
create policy "crear presupuesto de mis viajes" on public.trip_budgets for insert with check (public.is_trip_member(trip_id));
create policy "editar presupuesto de mis viajes" on public.trip_budgets for update
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "borrar presupuesto de mis viajes" on public.trip_budgets for delete using (public.is_trip_member(trip_id));

alter table public.expenses enable row level security;
create policy "ver gastos de mis viajes" on public.expenses for select using (public.is_trip_member(trip_id));
create policy "apuntar gastos en mis viajes" on public.expenses for insert
  with check (
    user_id = auth.uid()
    and public.is_trip_member(trip_id)
    and (paid_by is null or public.is_trip_participant(trip_id, paid_by))
    and (stop_id is null or public.stop_in_trip(stop_id, trip_id))
  );
create policy "editar gastos de mis viajes" on public.expenses for update
  using (public.is_trip_member(trip_id))
  with check (
    public.is_trip_member(trip_id)
    and (paid_by is null or public.is_trip_participant(trip_id, paid_by))
    and (stop_id is null or public.stop_in_trip(stop_id, trip_id))
  );
create policy "borrar gastos de mis viajes" on public.expenses for delete using (public.is_trip_member(trip_id));

revoke execute on function public.is_trip_participant(uuid, uuid) from public, anon;
revoke execute on function public.stop_in_trip(uuid, uuid) from public, anon;
grant execute on function public.is_trip_participant(uuid, uuid) to authenticated;
grant execute on function public.stop_in_trip(uuid, uuid) to authenticated;
