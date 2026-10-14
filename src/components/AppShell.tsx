import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { UN_COUNTRY_COUNT, loadWorldShapes } from '../lib/countries'
import { useProfile, useTravelData } from '../lib/hooks'
import { Avatar } from './Avatar'
import { ErrorBoundary } from './ErrorBoundary'
import { Icon } from './Icon'
import { Spinner } from './ui'

const NAV = [
  { to: '/app', label: 'Explorador & Mapa', end: true },
  { to: '/app/bitacora', label: 'Bitácora & Rutas' },
  { to: '/app/pasaporte', label: 'Pasaporte & Badges' },
  { to: '/app/paises', label: 'Países & Regiones' },
  { to: '/app/deseos', label: 'Bucket List' },
]

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-semibold uppercase tracking-tight">ROAM</span>
        <span className="label-stamp mt-0.5 hidden text-ink-soft sm:block">Kinetic Travel Tracker</span>
      </span>
    </Link>
  )
}

export function AppShell() {
  const { stats } = useTravelData()
  const { demo } = useAuth()
  const location = useLocation()
  // El mapa del mundo empieza a descargarse ya, en paralelo con el motor de mapas.
  useEffect(() => {
    loadWorldShapes().catch(() => {})
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  const pct = ((stats.countries.length / UN_COUNTRY_COUNT) * 100).toFixed(0)

  return (
    <div className="flex min-h-screen flex-col">
      {demo && (
        <div className="label-stamp bg-ink px-4 py-1.5 text-center text-white/80">
          Modo demo · los datos se guardan en este navegador · configura Supabase en <code>.env.local</code> para usar cuentas reales
        </div>
      )}
      <header className="sticky top-0 z-40 bg-surface/85 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 md:px-12">
          <div className="flex items-center gap-6">
            <Logo to="/app" />
            <div className="hidden h-6 w-px bg-surface-highest lg:block" />
            <nav className="hidden items-center gap-0.5 xl:flex">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-sm px-2.5 py-1 text-[13px] transition ${isActive ? 'bg-surface-high font-semibold text-ink' : 'text-ink-soft hover:bg-surface-low hover:text-ink'}`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="label-code hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-low px-3 py-1.5 2xl:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {pct}% mundo descubierto · {stats.countries.length} países
            </div>
            <Link to="/app/viajes/nuevo" className="btn btn-accent rounded-full! px-4!">
              <Icon name="add_location_alt" size={18} />
              <span className="hidden sm:inline">Registrar viaje</span>
            </Link>
            <UserMenu />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 text-sm [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] xl:hidden">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-sm px-2.5 py-1 ${isActive ? 'bg-ink font-semibold text-white' : 'text-ink-soft'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 md:px-12 md:pt-8">
        {/* La cabecera se queda mientras se descarga la pantalla; un fallo en ella no tumba la app. */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="bg-surface-low">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-12">
          <span className="label-stamp text-ink-soft">ROAM archive v1.0 · expedition telemetry</span>
          <nav className="label-code flex gap-6 text-ink-soft">
            <Link to="/app">Explorador</Link>
            <Link to="/app/bitacora">Bitácora</Link>
            <Link to="/app/pasaporte">Pasaporte</Link>
            <Link to="/app/deseos">Deseos</Link>
          </nav>
          <span className="text-xs text-ink-soft">
            Datos ©{' '}
            <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              colaboradores de OpenStreetMap
            </a>{' '}
            · <Link to="/creditos" className="underline">Créditos</Link> · <Link to="/privacidad" className="underline">Privacidad</Link> ·{' '}
            <Link to="/aviso-legal" className="underline">Aviso legal</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  const profile = useProfile()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const name = profile.data?.display_name || profile.data?.username || user?.email || '?'
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-transparent transition hover:ring-accent-soft"
        aria-label="Menú de usuario"
      >
        <Avatar profile={profile.data} className="h-full w-full" />
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 w-60 overflow-hidden p-1">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar profile={profile.data} className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="truncate font-display font-semibold">{name}</div>
              <div className="truncate text-xs text-ink-soft">@{profile.data?.username}</div>
            </div>
          </div>
          <MenuLink icon="badge" to="/app/pasaporte" onClick={() => setOpen(false)}>
            Mi pasaporte
          </MenuLink>
          <MenuLink icon="settings" to="/app/ajustes" onClick={() => setOpen(false)}>
            Perfil y ajustes
          </MenuLink>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-low"
            onClick={async () => {
              await signOut()
              navigate('/')
            }}
          >
            <Icon name="logout" size={18} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({ to, icon, children, onClick }: { to: string; icon: string; children: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-surface-low">
      <Icon name={icon} size={18} /> {children}
    </Link>
  )
}
