import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Avatar } from '../components/Avatar'
import { Logo } from '../components/AppShell'
import { Icon } from '../components/Icon'
import { ErrorNote, Spinner, formatRange, plural } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useInvalidateTravel } from '../lib/hooks'
import { clearPendingInvite, savePendingInvite } from '../lib/invites'

const PROBLEM: Record<string, string> = {
  expired: 'Esta invitación ha caducado.',
  used_up: 'Esta invitación ya se ha usado todas las veces permitidas.',
  revoked: 'El creador del viaje ha anulado esta invitación.',
}

/** /invitacion/:token — vista previa del viaje y botón para unirse (con o sin sesión). */
export function InvitePage() {
  const { token = '' } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const invalidate = useInvalidateTravel()
  const preview = useQuery({ queryKey: ['invite', token, user?.id], queryFn: () => api.getInvite(token), enabled: !loading, retry: false })
  const join = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: async (tripId) => {
      clearPendingInvite()
      await invalidate()
      navigate(`/app/viajes/${tripId}`, { replace: true })
    },
  })

  const p = preview.data
  const usable = p?.status === 'valid'

  // Sin sesión: se guarda la invitación para volver a ella tras registrarse o entrar.
  useEffect(() => {
    if (!loading && !user && usable) savePendingInvite(token)
  }, [loading, user, usable, token])

  // Ya participa (o es el creador): directo al viaje.
  useEffect(() => {
    if (user && p?.already_member) {
      clearPendingInvite()
      navigate(`/app/viajes/${p.trip_id}`, { replace: true })
    }
  }, [user, p, navigate])

  let body
  if (loading || preview.isLoading) body = <Spinner label="Abriendo invitación" />
  else if (preview.error) body = <ErrorNote error={preview.error} />
  else if (!p)
    body = (
      <Problem text="Esta invitación no existe. Comprueba que has copiado el enlace completo." />
    )
  else
    body = (
      <>
        <div className="flex items-center gap-3">
          <Avatar profile={{ id: p.owner_id, avatar_url: p.owner_avatar, display_name: p.owner_name, username: p.owner_username }} className="h-12 w-12" />
          <p className="text-ink-soft">
            <b className="text-ink">{p.owner_name}</b> te invita a su expedición
          </p>
        </div>
        <h1 className="headline-lg mt-5">{p.title}</h1>
        <p className="label-code mt-2 text-ink-soft">
          {[formatRange(p.start_date, p.end_date), plural(p.stops, 'parada', 'paradas')].filter(Boolean).join(' · ')}
        </p>

        {usable ? (
          <>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                { icon: 'edit_location_alt', text: 'Añade paradas, notas, fotos y música al mismo viaje.' },
                { icon: 'public', text: 'Sus países y regiones contarán en tu pasaporte.' },
                { icon: 'lock', text: 'Solo verá tu nombre y tu avatar; el resto de tu cuenta sigue siendo tuya.' },
              ].map(({ icon, text }) => (
                <li key={icon} className="flex items-start gap-2">
                  <Icon name={icon} size={18} className="mt-0.5 text-accent" /> {text}
                </li>
              ))}
            </ul>
            <ErrorNote error={join.error} />
            {user ? (
              <button className="btn btn-accent mt-6 w-full" disabled={join.isPending} onClick={() => join.mutate()}>
                <Icon name="group_add" size={18} /> {join.isPending ? 'Uniéndote…' : 'Unirme al viaje'}
              </button>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link to="/registro" state={{ from: `/invitacion/${token}` }} className="btn btn-accent">
                  Crear cuenta
                </Link>
                <Link to="/entrar" state={{ from: `/invitacion/${token}` }} className="btn btn-ghost">
                  Ya tengo cuenta
                </Link>
              </div>
            )}
          </>
        ) : (
          <Problem text={`${PROBLEM[p.status]} Pide a ${p.owner_name} un enlace nuevo.`} />
        )}
      </>
    )

  return (
    <div className="flex min-h-screen flex-col px-6 py-8 md:px-16">
      <Logo />
      <div className="mx-auto my-auto w-full max-w-md py-12">
        <div className="label-code mb-4 flex items-center gap-2 text-accent-deep">
          <span className="h-2 w-2 rounded-full bg-accent" /> Invitación a un viaje compartido
        </div>
        {body}
      </div>
    </div>
  )
}

function Problem({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-sm bg-surface-container px-4 py-3">
      <p>{text}</p>
      <Link to="/" className="mt-3 inline-block font-semibold text-accent-deep">
        Ir a ROAM
      </Link>
    </div>
  )
}
