-- 1) Saldar cuentas al estilo Tricount: «Julia te ha pagado 45 €» se guarda como un movimiento 'settlement'
--    (pagó Julia, le toca a quien recibe). Cuenta en los saldos, pero no es un gasto: no suma al total, al
--    presupuesto ni a las categorías.
alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in (
  'transport', 'flights', 'lodging', 'food', 'drinks', 'activities', 'tours', 'shopping', 'gifts',
  'health', 'connectivity', 'tips', 'fees', 'other', 'settlement'
));

-- 2) Ubicación del alojamiento: al elegirlo en el buscador se guardan sus coordenadas (para el mapa, la ruta de
--    Google Maps y calcular mejor a qué hora se llega desde el aeropuerto o la estación).
alter table public.lodgings
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lon double precision check (lon is null or lon between -180 and 180);
