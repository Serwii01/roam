import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { WorldMap } from '../components/LazyWorldMap'
import { demoState } from '../lib/api/demo-data'
import type { TripWithStops } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useAirportMap } from '../lib/hooks'

const FEATURES = [
  { icon: 'public', title: 'Mapa del mundo interactivo', text: 'Vista plana o globo 3D. Los países que has pisado se colorean solos y los pines se agrupan al alejar.' },
  { icon: 'map', title: 'Regiones y provincias', text: 'Cada lugar guarda su región y provincia ISO 3166-2. Marca las que te falten tocando el mapa de cada país.' },
  { icon: 'route', title: 'Rutas con arcos', text: 'Vuelos en arco ortodrómico, trenes, ferris y carretera entre destinos, con la distancia real de cada tramo.' },
  { icon: 'local_airport', title: 'Aeropuertos reales', text: 'Más de 5.000 aeropuertos con código IATA. Te proponemos el más cercano a cada ciudad.' },
  { icon: 'edit_note', title: 'Bitácora por días', text: 'Notas, valoraciones, etiquetas y fotos en cada parada. Tu diario de viaje, ordenado en el tiempo.' },
  { icon: 'approval', title: 'Pasaporte de sellos', text: 'Un sello de inmigración por cada país al que llegas, con su aeropuerto y su fecha.' },
  { icon: 'military_tech', title: 'Insignias y rangos', text: 'De Turista a Leyenda: hitos por continentes, kilómetros, trenes, islas y latitudes extremas.' },
  { icon: 'insights', title: 'Estadísticas', text: 'Países, % del mundo, kilómetros, medio de transporte favorito y meses con más movilidad.' },
]

const STEPS = [
  { n: '01', title: 'Crea tu cuenta', text: 'Gratis y sin tarjeta. Tus datos son privados salvo que hagas público tu perfil.' },
  { n: '02', title: 'Añade tus viajes', text: 'Busca las ciudades, elige cómo te moviste y añade fotos y notas.' },
  { n: '03', title: 'Mira tu mapa cobrar vida', text: 'Países, regiones, rutas, sellos e insignias se calculan solos.' },
]

export function LandingPage() {
  const { user } = useAuth()
  const demo = useMemo(() => {
    const s = demoState()
    const trips: TripWithStops[] = s.trips
      .filter((t) => t.status === 'done')
      .map((t) => ({ ...t, stops: s.stops.filter((x) => x.trip_id === t.id).sort((a, b) => a.position - b.position), photos: [], sights: [] }))
    return { trips, countries: [...new Set([...trips.flatMap((t) => t.stops.map((x) => x.country_code)), ...s.userCountries])] }
  }, [])
  const airports = useAirportMap(demo.trips.flatMap((t) => t.stops.flatMap((s) => [s.from_airport, s.to_airport])))
  const cta = user ? { to: '/app', label: 'Ir a mi mapa' } : { to: '/registro', label: 'Empieza gratis' }

  return (
    <div className="bg-surface">
      <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 md:px-12">
          <Logo />
          <nav className="hidden items-center gap-6 text-ink-soft md:flex">
            <a href="#funciones" className="hover:text-ink">
              Funciones
            </a>
            <a href="#como-funciona" className="hover:text-ink">
              Cómo funciona
            </a>
            <a href="#mapa" className="hover:text-ink">
              Mapa
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && (
              <Link to="/entrar" className="btn">
                Entrar
              </Link>
            )}
            <Link to={cta.to} className="btn btn-accent rounded-full! px-5!">
              {cta.label}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-10 px-4 pb-16 pt-10 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:pt-16">
        <div>
          <div className="label-code flex flex-wrap items-center gap-2 text-accent-deep">
            <span className="h-2 w-2 rounded-full bg-accent" /> N°01 · 35.6762° N · 139.6503° E
          </div>
          <h1 className="mt-5 font-display text-[clamp(36px,10.5vw,88px)] font-bold uppercase leading-[0.95] tracking-[-0.045em] lg:text-[clamp(48px,5.6vw,88px)]">
            Tus viajes,
            <br />
            <span className="text-accent">cartografiados.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-ink-soft">
            Marca los países, regiones y provincias que has pisado, traza cada ruta en avión, tren o carretera y colecciona un pasaporte de sellos. Gratis.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={cta.to} className="btn btn-accent px-6! py-3! text-base!">
              <Icon name="add_location_alt" size={20} /> {cta.label}
            </Link>
            <a href="#funciones" className="btn btn-ghost px-6! py-3! text-base!">
              Ver funciones
            </a>
          </div>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-surface-highest pt-6">
            {[
              ['249', 'países'],
              ['5.046', 'regiones'],
              ['5.332', 'aeropuertos'],
            ].map(([n, l]) => (
              <div key={l}>
                <div className="font-display text-3xl font-bold tracking-tight">{n}</div>
                <div className="label-stamp text-ink-soft">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div id="mapa" className="relative">
          <WorldMap
            className="h-[520px] md:h-[600px]"
            trips={demo.trips}
            airports={airports}
            countries={demo.countries}
            activeTripId="kioto"
            initialMode="3d"
            telemetry={false}
            legend={false}
            routeLink={false}
          />
          <div className="card absolute -bottom-6 left-6 w-60 max-w-[calc(100%-3rem)] p-4">
            <div className="label-stamp flex justify-between text-accent-deep">
              Fushimi Inari <span>★ 5.0</span>
            </div>
            <div className="mt-1 font-display font-semibold">Kioto, Japón</div>
            <div className="label-stamp mt-2 text-ink-soft">Día 05 · Tren desde Tokio · 360 km</div>
          </div>
        </div>
      </section>

      <div className="label-code mx-auto max-w-[1400px] px-4 py-6 text-center text-outline md:px-12">N°02 · 64.1466° N · 21.9426° W — Reikiavik</div>

      <section id="funciones" className="mx-auto max-w-[1400px] px-4 py-16 md:px-12">
        <div className="label-stamp text-accent-deep">Funciones</div>
        <h2 className="headline-lg mt-2 max-w-2xl">Todo lo que has viajado, en un solo mapa</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card p-6">
              <div className="flex items-start justify-between">
                <Icon name={f.icon} size={28} className="text-accent" />
                <span className="label-code text-outline">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="headline-sm mt-6">{f.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="bg-night text-white">
        <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
          <div className="label-stamp text-accent">Cómo funciona</div>
          <h2 className="headline-lg mt-2">Tres pasos y tu mapa está listo</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-white/15 pt-6">
                <div className="font-display text-5xl font-bold text-accent">{s.n}</div>
                <h3 className="headline-sm mt-4">{s.title}</h3>
                <p className="mt-2 text-white/70">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-20 text-center md:px-12">
        <div className="label-code text-outline">N°03 · 13.1631° S · 72.5450° W — Machu Picchu</div>
        <h2 className="display-hero mx-auto mt-4 max-w-3xl">¿Cuánto mundo has descubierto?</h2>
        <Link to={cta.to} className="btn btn-accent mt-8 px-8! py-3.5! text-base!">
          {cta.label}
        </Link>
      </section>

      <footer className="bg-surface-low">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-12">
          <span className="label-stamp text-ink-soft">ROAM · Kinetic travel tracker</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © colaboradores de OpenStreetMap
            </a>
            <Link to="/creditos" className="underline">Créditos y licencias</Link>
            <Link to="/privacidad" className="underline">Privacidad</Link>
            <Link to="/aviso-legal" className="underline">Aviso legal</Link>
            <Link to="/terminos" className="underline">Términos</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
