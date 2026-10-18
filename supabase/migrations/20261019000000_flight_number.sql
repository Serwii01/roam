-- Número de vuelo del tramo que llega a una parada (IB6251, VY1234…), para rellenar los aeropuertos.
alter table public.stops add column flight_no text check (flight_no is null or flight_no ~ '^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$');
