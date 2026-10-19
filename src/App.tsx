import { lazy, Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'

// Cada pantalla se descarga al visitarla: la portada no carga el editor ni el pasaporte.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const AppShell = page(() => import('./components/AppShell'), 'AppShell')
const AuthPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.AuthPage })))
const BitacoraPage = page(() => import('./pages/Bitacora'), 'BitacoraPage')
const BucketPage = page(() => import('./pages/Bucket'), 'BucketPage')
const CountriesPage = page(() => import('./pages/Countries'), 'CountriesPage')
const CountryPage = page(() => import('./pages/Country'), 'CountryPage')
const ExplorerPage = page(() => import('./pages/Explorer'), 'ExplorerPage')
const LandingPage = page(() => import('./pages/Landing'), 'LandingPage')
const PassportPage = page(() => import('./pages/Passport'), 'PassportPage')
const SettingsPage = page(() => import('./pages/Settings'), 'SettingsPage')
const TripEditorPage = page(() => import('./pages/TripEditor'), 'TripEditorPage')
const TripLogPage = page(() => import('./pages/TripLog'), 'TripLogPage')
const PrivacyPage = page(() => import('./pages/Legal'), 'PrivacyPage')
const LegalNoticePage = page(() => import('./pages/Legal'), 'LegalNoticePage')
const TermsPage = page(() => import('./pages/Legal'), 'TermsPage')
const CreditsPage = page(() => import('./pages/Legal'), 'CreditsPage')
const InvitePage = page(() => import('./pages/Invite'), 'InvitePage')
const ImportPage = page(() => import('./pages/Import'), 'ImportPage')
const FriendsPage = page(() => import('./pages/Friends'), 'FriendsPage')
const PlannerPage = page(() => import('./pages/Planner'), 'PlannerPage')
const SharedTripPage = page(() => import('./pages/Public'), 'SharedTripPage')
const PublicProfilePage = page(() => import('./pages/Public'), 'PublicProfilePage')
const PublicTripPage = page(() => import('./pages/Public'), 'PublicTripPage')

/** Cada página nueva empieza arriba (o en su #ancla), también al venir del pie de página. */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
  useEffect(() => {
    if (!hash) return
    // La página puede tardar en cargar: se reintenta hasta que aparece el ancla.
    let tries = 0
    const id = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (el || ++tries > 20) {
        clearInterval(id)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
    return () => clearInterval(id)
  }, [pathname, hash])
  return null
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner label="Verificando sesión" />
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  return children
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const from = (useLocation().state as { from?: string } | null)?.from
  if (loading) return <Spinner label="Verificando sesión" />
  return user ? <Navigate to={from ?? '/app'} replace /> : children
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacidad" element={<PrivacyPage />} />
        <Route path="/aviso-legal" element={<LegalNoticePage />} />
        <Route path="/terminos" element={<TermsPage />} />
        <Route path="/creditos" element={<CreditsPage />} />
        <Route path="/invitacion/:token" element={<InvitePage />} />
        <Route path="/v/:token" element={<SharedTripPage />} />
        <Route path="/u/:username" element={<PublicProfilePage />} />
        <Route path="/u/:username/:tripId" element={<PublicTripPage />} />
        <Route path="/entrar" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
        <Route path="/registro" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
        <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<ExplorerPage />} />
          <Route path="bitacora" element={<BitacoraPage />} />
          <Route path="viajes/nuevo" element={<TripEditorPage />} />
          <Route path="importar" element={<ImportPage />} />
          <Route path="amigos" element={<FriendsPage />} />
          <Route path="viajes/:id" element={<TripLogPage />} />
          <Route path="viajes/:id/editar" element={<TripEditorPage />} />
          <Route path="viajes/:id/plan" element={<PlannerPage />} />
          <Route path="pasaporte" element={<PassportPage />} />
          <Route path="paises" element={<CountriesPage />} />
          <Route path="paises/:code" element={<CountryPage />} />
          <Route path="deseos" element={<BucketPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
