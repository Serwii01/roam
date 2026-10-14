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
}
