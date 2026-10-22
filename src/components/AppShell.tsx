import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { UN_COUNTRY_COUNT, loadWorldShapes } from '../lib/countries'
import { useProfile, useTravelData } from '../lib/hooks'
import { takePendingInvite } from '../lib/invites'
import { Avatar } from './Avatar'
import { ErrorBoundary } from './ErrorBoundary'
import { Icon } from './Icon'
import { InstallBanner } from './Pwa'
import { Spinner } from './ui'

const NAV = [
  { to: '/app', label: 'Explorador & Mapa', short: 'Mapa', icon: 'public', end: true },
  { to: '/app/bitacora', label: 'Bitácora & Rutas', short: 'Viajes', icon: 'menu_book' },
  { to: '/app/pasaporte', label: 'Pasaporte & Badges', short: 'Pasaporte', icon: 'badge' },
  { to: '/app/paises', label: 'Países & Regiones', short: 'Países', icon: 'flag' },
  { to: '/app/deseos', label: 'Bucket List', short: 'Deseos', icon: 'bookmark_heart' },
  { to: '/app/amigos', label: 'Amigos', short: 'Amigos', icon: 'group' },
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
  const navigate = useNavigate()
  // Vuelve a la invitación que se abrió antes de entrar (registro con confirmación por email, OAuth…).
  useEffect(() => {
    const token = takePendingInvite()
    if (token) navigate(`/invitacion/${token}`, { replace: true })
  }, [navigate])
  // El mapa del mundo (siluetas de países) se descarga cuando la página ya se ha pintado.
  useEffect(() => {
    const id = setTimeout(() => loadWorldShapes().catch(() => {}), 1500)
    return () => clearTimeout(id)
  }, [])
  const pct = ((stats.countries.length / UN_COUNTRY_COUNT) * 100).toFixed(0)

  return (
    <div className="flex min-h-screen flex-col">
      {demo && (
        <div className="label-stamp bg-ink px-4 py-1.5 text-center text-white/80">
          Modo demo · los datos se guardan en este navegador · configura Supabase en <code>.env.local</code> para usar cuentas reales
        </div>
      )}
      <header className="sticky top-0 z-40 bg-surface/85 pt-[env(safe-area-inset-top)] shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
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
            <Link to="/app/viajes/nuevo" className="btn btn-accent hidden rounded-full! px-4! xl:inline-flex">
              <Icon name="add_location_alt" size={18} />
              Registrar viaje
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 md:px-12 md:pt-8 xl:pb-16">
        {/* La cabecera se queda mientras se descarga la pantalla; un fallo en ella no tumba la app. */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <BottomNav />
      <InstallBanner />

      <footer className="bg-surface-low pb-20 xl:pb-0">
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
  const { pathname } = useLocation()

  // Se cierra al tocar fuera (ratón o dedo), con Escape y al cambiar de página.
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  useEffect(() => setOpen(false), [pathname])

  const name = profile.data?.display_name || profile.data?.username || user?.email || '?'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-10 w-10 touch-manipulation overflow-hidden rounded-full ring-2 ring-transparent transition hover:ring-accent-soft"
        aria-label="Menú de usuario"
        aria-expanded={open}
      >
        <Avatar profile={profile.data} className="h-full w-full" />
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-[min(16rem,calc(100vw-2rem))] overflow-hidden p-1 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar profile={profile.data} className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="truncate font-display font-semibold">{name}</div>
              <div className="truncate text-xs text-ink-soft">@{profile.data?.username}</div>
            </div>
          </div>
          {profile.data?.username && (
            <MenuLink icon="account_circle" to={`/u/${profile.data.username}`} onClick={() => setOpen(false)}>
              Mi perfil público
            </MenuLink>
          )}
          <MenuLink icon="badge" to="/app/pasaporte" onClick={() => setOpen(false)}>
            Mi pasaporte
          </MenuLink>
          <MenuLink icon="group" to="/app/amigos" onClick={() => setOpen(false)}>
            Amigos
          </MenuLink>
          <MenuLink icon="settings" to="/app/ajustes" onClick={() => setOpen(false)}>
            Perfil y ajustes
          </MenuLink>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-surface-low"
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
    <Link to={to} onClick={onClick} className="flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm hover:bg-surface-low">
      <Icon name={icon} size={18} /> {children}
    </Link>
  )
}

/** Navegación del móvil y la tableta: abajo, al alcance del pulgar. El resto de secciones, en «Más». */
function BottomNav() {
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMore(false), [pathname])
  const main = NAV.slice(0, 3)
  const rest = NAV.slice(3)
  const inRest = rest.some((n) => pathname.startsWith(n.to))
  // En el editor y el importador manda su propia barra de acciones de abajo.
  if (/\/(viajes\/nuevo|editar|importar)$/.test(pathname)) return null
  const item = (active: boolean) => `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold transition ${active ? 'text-accent-deep' : 'text-ink-soft'}`
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-md bg-card p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {rest.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex items-center gap-3 rounded-sm px-3 py-3 text-sm ${isActive ? 'bg-surface-high font-semibold' : 'hover:bg-surface-low'}`}>
                <Icon name={n.icon} size={20} className="text-accent" /> {n.label}
              </NavLink>
            ))}
            <NavLink to="/app/importar" className="flex items-center gap-3 rounded-sm px-3 py-3 text-sm hover:bg-surface-low">
              <Icon name="photo_library" size={20} className="text-accent" /> Importar desde fotos o Google
            </NavLink>
            <NavLink to="/app/ajustes" className="flex items-center gap-3 rounded-sm px-3 py-3 text-sm hover:bg-surface-low">
              <Icon name="settings" size={20} className="text-accent" /> Perfil y ajustes
            </NavLink>
          </div>
        </div>
      )}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-surface-highest bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl xl:hidden"
      >
        {main.slice(0, 2).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => item(isActive)}>
            {({ isActive }) => (
              <>
                <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-accent-soft' : ''}`}>
                  <Icon name={n.icon} size={22} />
                </span>
                {n.short}
              </>
            )}
          </NavLink>
        ))}
        <Link to="/app/viajes/nuevo" aria-label="Registrar viaje" className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-semibold text-ink">
          <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow-lg ring-4 ring-surface">
            <Icon name="add" size={26} />
          </span>
          Nuevo
        </Link>
        <NavLink to={main[2].to} className={({ isActive }) => item(isActive)}>
          {({ isActive }) => (
            <>
              <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-accent-soft' : ''}`}>
                <Icon name={main[2].icon} size={22} />
              </span>
              {main[2].short}
            </>
          )}
        </NavLink>
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className={item(more || inRest)}>
          <span className={`grid h-7 w-12 place-items-center rounded-full ${more || inRest ? 'bg-accent-soft' : ''}`}>
            <Icon name={more ? 'close' : 'menu'} size={22} />
          </span>
          Más
        </button>
      </nav>
    </>
  )
}
