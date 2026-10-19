import type { TransportMode, TripStyle } from './db'

/** `icon` es el nombre del símbolo de Material Symbols. */
export const TRANSPORT: Record<TransportMode, { label: string; icon: string }> = {
  plane: { label: 'Avión', icon: 'flight' },
  train: { label: 'Tren', icon: 'train' },
  car: { label: 'Coche', icon: 'directions_car' },
  bus: { label: 'Autobús', icon: 'directions_bus' },
  boat: { label: 'Barco', icon: 'directions_boat' },
  bike: { label: 'Bici', icon: 'pedal_bike' },
  walk: { label: 'A pie', icon: 'hiking' },
}

export const TRANSPORT_MODES = Object.keys(TRANSPORT) as TransportMode[]

export const TRIP_STYLES: Record<TripStyle, { label: string; icon: string }> = {
  backpacker: { label: 'Mochilero', icon: 'backpack' },
  roadtrip: { label: 'Roadtrip', icon: 'directions_car' },
  relax: { label: 'Descanso', icon: 'spa' },
  cultural: { label: 'Cultural', icon: 'account_balance' },
  adventure: { label: 'Aventura', icon: 'landscape' },
  business: { label: 'Trabajo', icon: 'work' },
  family: { label: 'En familia', icon: 'family_restroom' },
  romantic: { label: 'Romántico', icon: 'favorite' },
  gastro: { label: 'Gastronómico', icon: 'restaurant_menu' },
  nature: { label: 'Naturaleza', icon: 'forest' },
  beach: { label: 'Playa', icon: 'beach_access' },
  snow: { label: 'Nieve', icon: 'downhill_skiing' },
  city: { label: 'Escapada urbana', icon: 'location_city' },
  festival: { label: 'Festival o evento', icon: 'festival' },
  friends: { label: 'Con amigos', icon: 'groups' },
  study: { label: 'Estudios', icon: 'school' },
}
