import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { ErrorNote } from '../components/ui'
import { OAUTH_PROVIDERS, useAuth } from '../lib/auth'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, signUp, signInWithProvider, resetPassword, demo } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const isLogin = mode === 'login'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isLogin) {
        await signIn(email, password)
        navigate(from, { replace: true })
      } else {
        const { needsConfirmation } = await signUp(email, password, username || undefined)
        if (needsConfirmation) setNotice('Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve a entrar.')
        else navigate('/app', { replace: true })
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 md:px-16">
        <Logo />
        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <div className="label-code flex items-center gap-2 text-accent-deep">
            <span className="h-2 w-2 rounded-full bg-accent" /> {isLogin ? 'Acceso al archivo' : 'Nuevo pasaporte digital'}
          </div>
          <h1 className="headline-lg mt-3">{isLogin ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h1>
          <p className="mt-2 text-ink-soft">{isLogin ? 'Tus mapas, rutas y sellos te esperan.' : 'Gratis. Sin tarjeta. Tu mapa del mundo en un minuto.'}</p>

          {demo && (
            <div className="mt-6 rounded-sm bg-accent-soft/60 px-4 py-3 text-sm text-accent-ink">
              <b>Modo demo:</b> Supabase aún no está configurado. Entra con cualquier email y contraseña para explorar con datos de ejemplo.
            </div>
          )}

          {notice ? (
            <div className="mt-6 rounded-sm bg-surface-container px-4 py-3">{notice}</div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <ErrorNote error={error} />
              {!isLogin && (
                <label className="block">
                  <span className="label-code mb-2 block">Nombre de usuario</span>
                  <input
                    className="field"
                    value={username}
                    placeholder="mateo_viaja"
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  />
                </label>
              )}
              <label className="block">
                <span className="label-code mb-2 block">Email</span>
                <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="block">
                <span className="label-code mb-2 flex justify-between">
                  Contraseña
                  {isLogin && !demo && (
                    <button
                      type="button"
                      className="text-accent-deep"
                      onClick={async () => {
                        if (!email) return setError(new Error('Escribe tu email para recuperar la contraseña.'))
                        await resetPassword(email).then(() => setNotice('Revisa tu email para cambiar la contraseña.'), setError)
                      }}
                    >
                      ¿La olvidaste?
                    </button>
                  )}
                </span>
                <input
                  className="field"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="btn btn-accent w-full py-3!" disabled={busy}>
                {busy ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
              </button>
            </form>
          )}

          {!demo && OAUTH_PROVIDERS.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="label-stamp text-center text-ink-soft">o continúa con</div>
              {OAUTH_PROVIDERS.map((p) => (
                <button key={p.id} className="btn btn-ghost w-full" onClick={() => signInWithProvider(p.id).catch(setError)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <p className="mt-8 text-center text-sm text-ink-soft">
            {isLogin ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <Link to={isLogin ? '/registro' : '/entrar'} className="font-semibold text-accent-deep">
              {isLogin ? 'Regístrate gratis' : 'Entra'}
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-night p-16 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.18) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <svg className="absolute -right-24 top-10 h-[560px] w-[560px] opacity-80" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="90" stroke="white" strokeOpacity=".25" />
          <ellipse cx="100" cy="100" rx="40" ry="90" stroke="white" strokeOpacity=".15" />
          <ellipse cx="100" cy="100" rx="90" ry="35" stroke="white" strokeOpacity=".15" />
          <path d="M30 120 Q 90 20 165 80" stroke="#d53e00" strokeWidth="1.5" strokeDasharray="4 3" />
          <circle cx="30" cy="120" r="3" fill="#d53e00" />
          <circle cx="165" cy="80" r="3" fill="white" />
        </svg>
        <div className="relative">
          <div className="label-code text-white/60">N°01 · 35.6762° N · 139.6503° E</div>
          <div className="display-hero mt-4">Tus viajes, cartografiados.</div>
          <ul className="mt-6 space-y-2 text-white/80">
            {['Países, regiones y provincias en tu mapa', 'Rutas en avión, tren o carretera con aeropuertos reales', 'Pasaporte de sellos e insignias automáticas'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Icon name="check" size={18} className="text-accent" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
