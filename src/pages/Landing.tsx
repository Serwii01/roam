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
  { icon: 'local_airport', title: 'Aeropuertos reales', text: 'Más de 5.000 aeropuertos con código IATA. Te proponemos el más cercano y buscas tu vuelo por su número.' },
  { icon: 'calendar_month', title: 'Planificador día a día', text: 'Itinerario por días, el tiempo previsto, lista de equipaje, documentos y aviso si tu pasaporte caduca.' },
  { icon: 'payments', title: 'Gastos compartidos', text: 'Presupuesto por viaje y gastos al estilo Tricount, con categorías, cambio de moneda y quién debe a quién.' },
  { icon: 'group', title: 'Viajes con amigos', text: 'Invita a tus compañeros a un viaje, sigue a otros viajeros y compara los países que lleváis.' },
  { icon: 'photo_library', title: 'Importa lo que ya tienes', text: 'Crea viajes a partir de las fotos del móvil o de tu historial de Google Maps, sin teclear nada.' },
  { icon: 'edit_note', title: 'Bitácora por días', text: 'Notas, valoraciones, etiquetas, fotos y la canción de cada parada. Tu diario de viaje, ordenado en el tiempo.' },
  { icon: 'approval', title: 'Pasaporte de sellos', text: 'Un sello de inmigración por cada país al que llegas, con su aeropuerto y su fecha.' },
  { icon: 'military_tech', title: 'Insignias y resumen del año', text: 'De Turista a Leyenda: 44 hitos por continentes, kilómetros, trenes e islas, y tu año viajero en una imagen.' },
  { icon: 'bookmark_heart', title: 'Bucket list y compartir', text: 'Guarda los destinos pendientes y comparte un viaje o tu perfil con un enlace que se ve bien en WhatsApp.' },
]

/** Lo que cambia al usar ROAM instalada en el móvil. */
const APP_PERKS = [
  { icon: 'touch_app', title: 'Un toque desde tu pantalla de inicio', text: 'Con su propio icono y a pantalla completa, sin barras del navegador.' },
  { icon: 'cloud_off', title: 'Funciona sin conexión', text: 'Abre tus viajes, tu pasaporte y los mapas que ya has visto aunque estés en modo avión.' },
  { icon: 'system_update', title: 'Siempre al día', text: 'Te avisa cuando hay una versión nueva y se actualiza con un toque. Sin tiendas de apps y casi sin ocupar espacio.' },
]

const INSTALL = [
  { icon: 'android', title: 'Android', steps: ['Abre ROAM en Chrome.', 'Pulsa «Instalar app» en el aviso, o en el menú ⋮ → Instalar aplicación.'] },
  { icon: 'phone_iphone', title: 'iPhone y iPad', steps: ['Abre ROAM en Safari.', 'Pulsa Compartir y elige «Añadir a pantalla de inicio».'] },
]

const FAQ = [
  { q: '¿Cuánto cuesta?', a: 'Nada. ROAM es gratis y no necesita tarjeta.' },
  { q: '¿Quién ve mis viajes?', a: 'Solo tú, salvo que hagas público tu perfil o compartas un viaje con un enlace. Tus pasaportes siempre son privados.' },
  { q: '¿Dónde se guardan mis datos?', a: 'En servidores de la Unión Europea. Puedes descargar una copia de todo o borrar tu cuenta cuando quieras desde los ajustes.' },
  { q: '¿Tengo que bajarla de la App Store o Google Play?', a: 'No. Se instala desde el navegador en un par de toques y ocupa mucho menos que una app normal. También puedes usarla en el ordenador.' },
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
            <a href="#app" className="hover:text-ink">
              App móvil
            </a>
            <a href="#preguntas" className="hover:text-ink">
              Preguntas
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
            Marca los países, regiones y provincias que has pisado, planifica el próximo viaje, traza cada ruta en avión, tren o carretera y colecciona un pasaporte de sellos. Gratis.
          </p>
          <a href="#app" className="label-code mt-5 inline-flex items-center gap-2 rounded-full bg-surface-low px-3 py-1.5 text-ink-soft hover:text-ink">
            <Icon name="install_mobile" size={16} className="text-accent" /> También como app para Android e iPhone
          </a>
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
        <h2 className="headline-lg mt-2 max-w-2xl">Todo lo que has viajado, y lo que vas a viajar, en un solo mapa</h2>
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

      <section id="app" className="mx-auto max-w-[1400px] px-4 pb-16 md:px-12">
        <div className="card grid gap-10 p-6 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="label-stamp text-accent-deep">App para el móvil</div>
            <h2 className="headline-lg mt-2">Llévate ROAM en el bolsillo</h2>
            <p className="mt-3 max-w-lg text-ink-soft">
              ROAM se instala en tu móvil como una app más, directamente desde el navegador. Ideal para apuntar cada parada sobre la marcha, incluso sin cobertura.
            </p>
            <div className="mt-8 space-y-5">
              {APP_PERKS.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <Icon name={p.icon} size={26} className="mt-0.5 text-accent" />
                  <div>
                    <h3 className="font-display font-semibold">{p.title}</h3>
                    <p className="text-sm text-ink-soft">{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {INSTALL.map((d) => (
              <div key={d.title} className="rounded-md bg-surface-low p-5">
                <div className="flex items-center gap-2">
                  <Icon name={d.icon} size={22} />
                  <h3 className="font-display font-semibold">{d.title}</h3>
                </div>
                <ol className="mt-3 space-y-2 text-sm text-ink-soft">
                  {d.steps.map((step, i) => (
                    <li key={step} className="flex gap-2">
                      <span className="label-code shrink-0 pt-0.5 text-accent-deep">{String(i + 1).padStart(2, '0')}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <p className="text-xs text-ink-soft sm:col-span-2 lg:col-span-1 xl:col-span-2">
              Funciona con tu misma cuenta en el móvil, la tableta y el ordenador: lo que apuntas en uno aparece en los demás.
            </p>
          </div>
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

      <section id="preguntas" className="mx-auto max-w-[1400px] px-4 pt-20 md:px-12">
        <div className="label-stamp text-accent-deep">Preguntas frecuentes</div>
        <h2 className="headline-lg mt-2">Lo que suele preguntarse</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q} className="card p-6">
              <h3 className="font-display font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm text-ink-soft">{f.a}</p>
            </div>
          ))}
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
