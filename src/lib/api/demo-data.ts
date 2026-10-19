// Datos de ejemplo del modo demo (sin Supabase).
import type { PackingItem, TripDocument } from '../db'
import type { Expense, Passport, Photo, Profile, Sight, Stop, TransportMode, Trip, TripBudget, TripInvite, TripMember, TripStyle, Wish } from '../db'

export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000demo'

export interface DemoState {
  profile: Profile
  passports: Passport[]
  trips: Trip[]
  stops: Stop[]
  photos: Photo[]
  userCountries: string[]
  userSubdivisions: string[]
  wishlist: Wish[]
  /** Compañeros de viajes compartidos (el creador de todos los viajes de la demo es el usuario demo). */
  members: (TripMember & { trip_id: string })[]
  invites: TripInvite[]
  sights: Sight[]
  budgets: TripBudget[]
  expenses: Expense[]
  /** Ids de los viajeros de ejemplo que sigue el usuario demo. */
  follows: string[]
  packing: PackingItem[]
  /** En la demo el archivo va como data URL (pequeño) dentro del propio registro. */
  documents: (TripDocument & { dataUrl: string })[]
}

/** Compañera de ejemplo con la que se comparte el viaje a Japón. */
export const DEMO_FRIEND: TripMember = {
  user_id: '00000000-0000-4000-8000-0000000julia',
  username: 'julia_dz',
  display_name: 'Julia Domínguez',
  avatar_url: null,
  role: 'editor',
  joined_at: '2024-09-20T10:00:00Z',
}

type S = [name: string, cc: string, region: string | null, province: string | null, lat: number, lon: number, date: string, via?: TransportMode, from?: string, to?: string, notes?: string, rating?: number, tags?: string[]]

// Fotos de relleno para la demo (Picsum, gratuito). En la app real son las del usuario.
const img = (q: string, n: number) => `https://picsum.photos/seed/${q.replace(/,/g, "-")}${n}/960/640`

let seq = 0
function trip(
  id: string,
  title: string,
  style: TripStyle,
  description: string,
  stops: S[],
  photos: string[],
  extra: Partial<Trip> = {},
): { trip: Trip; stops: Stop[]; photos: Photo[] } {
  const now = new Date().toISOString()
  const t: Trip = {
    id,
    user_id: DEMO_USER_ID,
    title,
    description,
    start_date: stops[0][6],
    end_date: stops.at(-1)![6],
    cover_url: photos[0] ?? null,
    status: 'done',
    style,
    solo: false,
    companions: [],
    soundtrack_url: null,
    created_at: now,
    updated_at: now,
    ...extra,
  }
  return {
    trip: t,
    stops: stops.map(([name, cc, region, province, lat, lon, date, via, from, to, notes, rating, tags], i) => ({
      id: `${id}-s${i}`,
      trip_id: id,
      user_id: DEMO_USER_ID,
      position: i,
      name,
      country_code: cc,
      region_code: region,
      province_code: province,
      lat,
      lon,
      arrived_on: date,
      notes: notes ?? null,
      rating: rating ?? null,
      tags: tags ?? [],
      song_url: null,
      transport_in: i === 0 ? null : (via ?? 'car'),
      from_airport: from ?? null,
      to_airport: to ?? null,
    })),
    photos: photos.map((path) => ({
      id: `p${++seq}`,
      user_id: DEMO_USER_ID,
      trip_id: id,
      stop_id: null,
      path,
      caption: null,
      created_at: now,
    })),
  }
}

const SPOTIFY = 'https://open.spotify.com'

const MAD: S = ['Madrid', 'ES', 'ES-MD', 'ES-M', 40.4168, -3.7038, '']
const from = (s: S, date: string): S => [s[0], s[1], s[2], s[3], s[4], s[5], date]
/** Vuelta a casa en avión. */
const flyHome = (s: S, date: string, fromIata: string, toIata: string): S => [s[0], s[1], s[2], s[3], s[4], s[5], date, 'plane', fromIata, toIata]

let expSeq = 0
const expense = (tripId: string, stopId: string | null, category: Expense['category'], description: string, amount: number, currency: string, rate: number, date: string, paidBy: string): Expense => ({
  id: `exp${++expSeq}`,
  trip_id: tripId,
  stop_id: stopId,
  user_id: DEMO_USER_ID,
  paid_by: paidBy,
  payer_key: `u:${paidBy}`,
  split_mode: 'equal',
  split: null,
  category,
  description,
  amount,
  currency,
  rate,
  spent_on: date,
  created_at: `${date}T12:00:00Z`,
})

let sightSeq = 0
const sight = (stopId: string, tripId: string, name: string, lat: number, lon: number, wiki: string | null): Sight => ({
  id: `sight${++sightSeq}`,
  trip_id: tripId,
  stop_id: stopId,
  user_id: DEMO_USER_ID,
  name,
  lat,
  lon,
  wiki_url: wiki,
  done: true,
  position: sightSeq,
  created_at: '2024-10-20T10:00:00Z',
})

export function demoState(): DemoState {
  const trips = [
    trip(
      'kioto',
      'Kioto: Templos, Niebla y Bambú',
      'cultural',
      'Recorrido nocturno por Gion, senderismo en Fushimi Inari a primera hora y exploración en tren hacia Uji.',
      [
        from(MAD, '2024-10-12'),
        ['Tokio', 'JP', 'JP-13', null, 35.6762, 139.6503, '2024-10-13', 'plane', 'MAD', 'HND', 'Aterrizaje en Haneda al amanecer. Shibuya y Shinjuku de noche, ramen en Omoide Yokocho.', 5, ['Shibuya', 'Omoide Yokocho']],
        ['Kioto', 'JP', 'JP-26', null, 35.0116, 135.7681, '2024-10-16', 'train', undefined, undefined, 'Shinkansen Nozomi. Fushimi Inari antes de las 7 y bosque de bambú de Arashiyama entre niebla.', 5, ['Fushimi Inari', 'Arashiyama']],
        ['Osaka', 'JP', 'JP-27', null, 34.6937, 135.5023, '2024-10-20', 'train', undefined, undefined, 'Dotonbori, takoyaki y el castillo al atardecer.', 4, ['Dotonbori']],
        flyHome(MAD, '2024-10-24', 'KIX', 'MAD'),
      ],
      [img('kyoto,temple', 1), img('tokyo,night', 2), img('arashiyama,bamboo', 3), img('osaka,street', 4)],
      { companions: ['Julia Domínguez'], soundtrack_url: `${SPOTIFY}/playlist/37i9dQZF1DWWQRwui0ExPn` },
    ),
    trip(
      'islandia',
      'Circuito Ruta 1: Tierras Volcánicas',
      'roadtrip',
      'Glaciares en Jökulsárlón, campamentos bajo el cielo polar y navegación por cañones de basalto en Vík.',
      [
        from(MAD, '2024-08-03'),
        ['Reikiavik', 'IS', 'IS-1', null, 64.1466, -21.9426, '2024-08-03', 'plane', 'MAD', 'KEF', 'Recogida de la campervan 4x4 y café en Grandi antes de la Ring Road.', 4, ['Campervan']],
        ['Vík', 'IS', 'IS-8', null, 63.4186, -19.006, '2024-08-05', 'car', undefined, undefined, 'Skógafoss y la playa negra de Reynisfjara. Viento de 45 km/h.', 5, ['Skógafoss', 'Reynisfjara']],
        ['Jökulsárlón', 'IS', 'IS-8', null, 64.0784, -16.2306, '2024-08-07', 'car', undefined, undefined, 'Caminata con crampones sobre el glaciar y témpanos azules en la laguna.', 5, ['Glaciar']],
        ['Mývatn', 'IS', 'IS-6', null, 65.6039, -16.9961, '2024-08-09', 'car', undefined, undefined, 'Fumarolas de Hverir y baños geotérmicos a 39 °C.', 4, ['Hverir']],
        ['Reikiavik', 'IS', 'IS-1', null, 64.1466, -21.9426, '2024-08-11', 'car'],
        flyHome(MAD, '2024-08-12', 'KEF', 'MAD'),
      ],
      [img('iceland,volcano', 5), img('iceland,glacier', 6), img('iceland,waterfall', 7)],
      { solo: true, soundtrack_url: `${SPOTIFY}/artist/6UUrUCIZtQeOf8tC0WuzRy` },
    ),
    trip(
      'cerdena',
      'Costa Esmeralda: Rocas y Mar',
      'relax',
      'Exploración de calas escondidas en Cerdeña, gastronomía marítima y travesía costera en moto Vespa.',
      [
        from(MAD, '2024-06-14'),
        ['Olbia', 'IT', 'IT-88', 'IT-SS', 40.9234, 9.4964, '2024-06-14', 'plane', 'MAD', 'OLB', 'Base en Porto Cervo. Calas de aguas turquesa.', 5, ['Porto Cervo']],
        ['Cagliari', 'IT', 'IT-88', 'IT-CA', 39.2238, 9.1217, '2024-06-18', 'car', undefined, undefined, 'Bajada por la costa oriental en Vespa.', 4],
        flyHome(MAD, '2024-06-20', 'CAG', 'MAD'),
      ],
      [img('sardinia,sea', 8), img('sardinia,beach', 9)],
    ),
    trip(
      'peru',
      'Camino Inca a Machu Picchu',
      'adventure',
      'Cuatro días por el Camino Inca, de Cusco a Machu Picchu pasando por Warmiwañusca a 4.215 m.',
      [
        from(MAD, '2023-09-08'),
        ['Lima', 'PE', 'PE-LIM', null, -12.0464, -77.0428, '2023-09-08', 'plane', 'MAD', 'LIM', 'Ceviche en Barranco.', 4],
        ['Cusco', 'PE', 'PE-CUS', null, -13.5319, -71.9675, '2023-09-10', 'plane', 'LIM', 'CUZ', 'Aclimatación y Valle Sagrado.', 5, ['Valle Sagrado']],
        ['Machu Picchu', 'PE', 'PE-CUS', null, -13.1631, -72.545, '2023-09-14', 'walk', undefined, undefined, 'Llegada por la Puerta del Sol al amanecer.', 5, ['Camino Inca', '4.215 m']],
        ['Cusco', 'PE', 'PE-CUS', null, -13.5319, -71.9675, '2023-09-15', 'train'],
        flyHome(MAD, '2023-09-17', 'CUZ', 'MAD'),
      ],
      [img('machupicchu', 10), img('peru,andes', 11)],
    ),
    trip(
      'nyc',
      'Nueva York y Boston en invierno',
      'cultural',
      'Museos, nieve en Central Park y autobús hasta Boston.',
      [
        from(MAD, '2023-12-01'),
        ['Nueva York', 'US', 'US-NY', null, 40.7128, -74.006, '2023-12-01', 'plane', 'MAD', 'JFK', 'MoMA, High Line y Brooklyn Bridge.', 5],
        ['Boston', 'US', 'US-MA', null, 42.3601, -71.0589, '2023-12-06', 'bus', undefined, undefined, 'Freedom Trail con nieve.', 4],
        flyHome(MAD, '2023-12-09', 'BOS', 'MAD'),
      ],
      [img('newyork,winter', 12)],
    ),
    trip(
      'marrakech',
      'Marrakech y el Atlas',
      'cultural',
      'Zocos de la medina, riad y excursión al Atlas.',
      [
        ['Sevilla', 'ES', 'ES-AN', 'ES-SE', 37.3891, -5.9845, '2023-11-20'],
        ['Marrakech', 'MA', 'MA-07', 'MA-MAR', 31.6295, -7.9811, '2023-11-21', 'plane', 'SVQ', 'RAK', 'Jemaa el-Fna al anochecer.', 4],
        ['Sevilla', 'ES', 'ES-AN', 'ES-SE', 37.3891, -5.9845, '2023-11-25', 'plane', 'RAK', 'SVQ'],
      ],
      [img('marrakech', 13)],
    ),
    trip(
      'patagonia',
      'Patagonia: Fitz Roy y Glaciares',
      'adventure',
      'Viaje planificado: El Chaltén, Perito Moreno y Torres del Paine.',
      [
        ['Buenos Aires', 'AR', 'AR-C', null, -34.6037, -58.3816, '2026-11-10', 'plane', 'MAD', 'EZE'],
        ['El Calafate', 'AR', 'AR-Z', null, -50.3379, -72.2648, '2026-11-13', 'plane', 'AEP', 'FTE'],
        ['El Chaltén', 'AR', 'AR-Z', null, -49.3315, -72.8863, '2026-11-15', 'bus'],
      ],
      [],
      { status: 'planned' },
    ),
  ]

  return {
    profile: {
      id: DEMO_USER_ID,
      username: 'viajero',
      display_name: 'Mateo Valverde',
      avatar_url: null,
      bio: 'Coleccionando sellos desde 2018.',
      home_country: 'ES',
      home_city: 'Madrid',
      is_public: false,
      created_at: '2018-10-01T00:00:00Z',
    },
    passports: [{ id: 'pp1', user_id: DEMO_USER_ID, country_code: 'ES', issued_on: '2021-03-10', expires_on: '2031-03-10' }],
    trips: trips.map((t) => t.trip),
    stops: trips.flatMap((t) => t.stops),
    photos: trips.flatMap((t) => t.photos),
    userCountries: ['FR', 'PT', 'GB'],
    userSubdivisions: ['FR-IDF', 'PT-11', 'GB-LND'],
    wishlist: [
      { user_id: DEMO_USER_ID, country_code: 'NZ', note: 'Milford Sound', created_at: '2025-01-01' },
      { user_id: DEMO_USER_ID, country_code: 'VN', note: 'Bahía de Ha Long', created_at: '2025-01-02' },
      { user_id: DEMO_USER_ID, country_code: 'NO', note: 'Auroras en Tromsø', created_at: '2025-01-03' },
    ],
    members: [{ ...DEMO_FRIEND, trip_id: 'kioto' }],
    invites: [],
    follows: [],
    packing: [],
    documents: [],
    budgets: [{ trip_id: 'kioto', currency: 'EUR', amount: 3000, updated_at: '2024-10-01T00:00:00Z' }],
    expenses: [
      expense('kioto', null, 'flights', 'Vuelos Madrid – Tokio (ida y vuelta)', 912, 'EUR', 1, '2024-09-02', DEMO_USER_ID),
      expense('kioto', 'kioto-s1', 'lodging', 'Hotel en Shinjuku, 3 noches', 54000, 'JPY', 0.0062, '2024-10-13', DEMO_USER_ID),
      expense('kioto', 'kioto-s2', 'transport', 'Shinkansen Tokio – Kioto', 14170, 'JPY', 0.0062, '2024-10-16', DEMO_FRIEND.user_id),
      expense('kioto', 'kioto-s2', 'lodging', 'Ryokan en Gion, 4 noches', 96000, 'JPY', 0.0062, '2024-10-16', DEMO_FRIEND.user_id),
      expense('kioto', 'kioto-s2', 'activities', 'Entradas templos', 4800, 'JPY', 0.0062, '2024-10-17', DEMO_USER_ID),
      expense('kioto', 'kioto-s3', 'food', 'Takoyaki y cena en Dotonbori', 7600, 'JPY', 0.0062, '2024-10-20', DEMO_USER_ID),
      expense('kioto', 'kioto-s3', 'gifts', 'Regalos', 9500, 'JPY', 0.0062, '2024-10-21', DEMO_FRIEND.user_id),
    ],
    sights: [
      sight('kioto-s2', 'kioto', 'Fushimi Inari-taisha', 34.9671, 135.7727, 'https://es.wikipedia.org/wiki/Fushimi_Inari-taisha'),
      sight('kioto-s2', 'kioto', 'Kinkaku-ji', 35.0394, 135.7292, 'https://es.wikipedia.org/wiki/Kinkaku-ji'),
      sight('kioto-s1', 'kioto', 'Cruce de Shibuya', 35.6595, 139.7005, null),
    ],
  }
}
