import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { ErrorNote } from '../components/ui'
import { OAUTH_PROVIDERS, useAuth } from '../lib/auth'
import { oauthError } from '../lib/supabase'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, signUp, signInWithProvider, resetPassword, demo } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  // Al volver de Google con un error (cancelado, cuenta no enlazada…), se enseña aquí.
  const [error, setError] = useState<unknown>(oauthError ? new Error(oauthError) : null)
  const [notice, setNotice] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
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
        else navigate(from, { replace: true })
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

          {!demo && !notice && OAUTH_PROVIDERS.length > 0 && (
            <div className="mt-6 space-y-2">
              {OAUTH_PROVIDERS.map((p) => (
                <OAuthButton key={p.id} provider={p.id} label={p.label} disabled={busy} onClick={() => signInWithProvider(p.id).catch(setError)} />
              ))}
              {!isLogin && (
                <p className="text-xs text-ink-soft">
                  Si te registras con {OAUTH_PROVIDERS.map((p) => p.label).join(' o ')}, aceptas los{' '}
                  <Link to="/terminos" target="_blank" className="text-accent-deep underline">
                    términos de uso
                  </Link>{' '}
                  y la{' '}
                  <Link to="/privacidad" target="_blank" className="text-accent-deep underline">
                    política de privacidad
                  </Link>
                  .
                </p>
              )}
              <div className="label-stamp flex items-center gap-3 pt-2 text-ink-soft before:h-px before:flex-1 before:bg-surface-highest after:h-px after:flex-1 after:bg-surface-highest">
                o con tu email
              </div>
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
              {!isLogin && (
                <label className="flex items-start gap-2 text-sm text-ink-soft">
                  <input type="checkbox" className="mt-1" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  <span>
                    Tengo 14 años o más y acepto los{' '}
                    <Link to="/terminos" target="_blank" className="text-accent-deep underline">
                      términos de uso
                    </Link>{' '}
                    y la{' '}
                    <Link to="/privacidad" target="_blank" className="text-accent-deep underline">
                      política de privacidad
                    </Link>
                    .
                  </span>
                </label>
              )}
              <button className="btn btn-accent w-full py-3!" disabled={busy || (!isLogin && !accepted)}>
                {busy ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-ink-soft">
            {isLogin ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <Link to={isLogin ? '/registro' : '/entrar'} state={{ from }} className="font-semibold text-accent-deep">
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

/** Botón «Continuar con…»: el de Google en blanco con su «G» de colores, como pide su guía de marca. */
function OAuthButton({ provider, label, disabled, onClick }: { provider: string; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-outline-soft bg-white px-4 text-[15px] font-semibold text-[#1f1f1f] transition hover:bg-surface-low disabled:opacity-60"
    >
      {provider === 'google' && (
        <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      )}
      Continuar con {label}
    </button>
  )
}
