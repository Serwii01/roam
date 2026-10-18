// Otros viajeros de la demo (perfiles públicos) para probar seguir, el perfil público y comparar mapas.
import type { Profile, Stop, Trip, TripWithStops } from '../db'
import { DEMO_FRIEND } from './demo-data'

export interface DemoPerson {
  profile: Profile
  trips: TripWithStops[]
}

type S = [name: string, cc: string, lat: number, lon: number, date: string, via?: Stop['transport_in'], from?: string, to?: string]

function trip(owner: string, id: string, title: string, stops: S[], extra: Partial<Trip> = {}): TripWithStops {
  return {
    id,
    user_id: owner,
    title,
    description: null,
    start_date: stops[0][4],
    end_date: stops.at(-1)![4],
    cover_url: null,
    status: 'done',
    style: null,
    solo: false,
    companions: [],
    soundtrack_url: null,
    created_at: `${stops[0][4]}T10:00:00Z`,
    updated_at: `${stops[0][4]}T10:00:00Z`,
    ...extra,
    photos: [],
    sights: [],
    stops: stops.map(([name, cc, lat, lon, date, via, from, to], i) => ({
      id: `${id}-s${i}`,
      trip_id: id,
      user_id: owner,
      position: i,
      name,
      country_code: cc,
      region_code: null,
      province_code: null,
      lat,
      lon,
      arrived_on: date,
      notes: null,
      rating: null,
      tags: [],
      song_url: null,
      transport_in: i ? (via ?? 'car') : null,
      from_airport: from ?? null,
      to_airport: to ?? null,
    })),
  }
}

const J = DEMO_FRIEND.user_id
const MAD: S = ['Madrid', 'ES', 40.4168, -3.7038, '']

export const DEMO_PEOPLE: DemoPerson[] = [
  {
    profile: {
      id: J,
      username: DEMO_FRIEND.username,
      display_name: DEMO_FRIEND.display_name,
      avatar_url: null,
      bio: 'Fotógrafa. Siempre con la mochila a medio hacer.',
      home_country: 'ES',
      home_city: 'Madrid',
      is_public: true,
      created_at: '2019-02-01T00:00:00Z',
    },
    trips: [
      trip(J, 'julia-lisboa', 'Lisboa y la costa de Sintra', [
        [MAD[0], 'ES', MAD[2], MAD[3], '2025-04-17'],
        ['Lisboa', 'PT', 38.7223, -9.1393, '2025-04-17', 'plane', 'MAD', 'LIS'],
        ['Sintra', 'PT', 38.8029, -9.3817, '2025-04-19', 'train'],
        [MAD[0], 'ES', MAD[2], MAD[3], '2025-04-21', 'plane', 'LIS', 'MAD'],
      ]),
      trip(J, 'julia-marruecos', 'Marrakech y el desierto', [
        [MAD[0], 'ES', MAD[2], MAD[3], '2024-11-02'],
        ['Marrakech', 'MA', 31.6295, -7.9811, '2024-11-02', 'plane', 'MAD', 'RAK'],
        ['Merzouga', 'MA', 31.0802, -4.0133, '2024-11-05', 'car'],
        [MAD[0], 'ES', MAD[2], MAD[3], '2024-11-08', 'plane', 'RAK', 'MAD'],
      ]),
      trip(J, 'julia-japon', 'Japón con Mateo', [
        [MAD[0], 'ES', MAD[2], MAD[3], '2024-10-12'],
        ['Tokio', 'JP', 35.6762, 139.6503, '2024-10-13', 'plane', 'MAD', 'HND'],
        ['Kioto', 'JP', 35.0116, 135.7681, '2024-10-16', 'train'],
        [MAD[0], 'ES', MAD[2], MAD[3], '2024-10-24', 'plane', 'KIX', 'MAD'],
      ]),
    ],
  },
]

export const demoPerson = (idOrUsername: string) => DEMO_PEOPLE.find((p) => p.profile.id === idOrUsername || p.profile.username === idOrUsername)
