-- Más tipos de viaje y de gasto, y reparto de gastos al estilo Tricount: quién pagó (con cuenta o un
-- compañero añadido a mano) y cómo se reparte (a partes iguales, por porcentajes, importes o partes).

alter table public.trips drop constraint trips_style_check;
alter table public.trips add constraint trips_style_check check (style in (
  'backpacker', 'roadtrip', 'relax', 'cultural', 'adventure', 'business',
  'family', 'romantic', 'gastro', 'nature', 'beach', 'snow', 'city', 'festival', 'friends', 'study'
));

alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in (
  'transport', 'flights', 'lodging', 'food', 'drinks', 'activities', 'tours', 'shopping', 'gifts',
  'health', 'connectivity', 'tips', 'fees', 'other'
));

-- Personas del reparto: 'u:<id>' (con cuenta) o 'g:<nombre>' (compañero sin cuenta del viaje).
alter table public.expenses
  add column payer_key text check (payer_key is null or payer_key ~ '^(u:[0-9a-f-]{36}|g:.{1,80})$'),
  add column split_mode text not null default 'equal' check (split_mode in ('equal', 'percent', 'amount', 'shares')),
  -- [{ "k": persona, "v": número }]: % (percent), importe en la moneda del gasto (amount), partes (shares)
  -- o 1 por persona incluida (equal). null (gastos anteriores) = a partes iguales entre quienes tienen cuenta.
  add column split jsonb check (split is null or jsonb_typeof(split) = 'array');

-- Si paga alguien con cuenta, paid_by y payer_key coinciden (paid_by ya se valida contra los participantes).
alter table public.expenses add constraint expenses_payer_consistent
  check (payer_key is null or payer_key not like 'u:%' or paid_by::text = substring(payer_key from 3));

update public.expenses set payer_key = 'u:' || paid_by::text where paid_by is not null and payer_key is null;
