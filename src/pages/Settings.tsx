import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { ErrorNote, Eyebrow, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { resetDemo } from '../lib/api/demo'
import { useAuth, useUser } from '../lib/auth'
import { AVATARS, defaultAvatar } from '../lib/avatars'
import type { Profile } from '../lib/db'
import { useCountries, useProfile } from '../lib/hooks'

export function SettingsPage() {
  const user = useUser()
  const { demo, signOut } = useAuth()
  const profile = useProfile()
  const { list } = useCountries()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<Partial<Profile>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (profile.data) setForm(profile.data)
  }, [profile.data])

  if (profile.isLoading) return <Spinner />

  const save = async () => {
    setError(null)
    try {
      const { display_name, username, bio, home_country, home_city, is_public, avatar_url } = form
      await api.updateProfile(user.id, {
        display_name: display_name || null,
        username: (username ?? '').toLowerCase(),
        bio: bio || null,
        home_country: home_country || null,
        home_city: home_city || null,
        avatar_url: avatar_url || null,
        is_public: !!is_public,
      })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(/duplicate|unique/i.test(String(e)) ? new Error('Ese nombre de usuario ya está cogido.') : e)
    }
  }

  return (
    <div className="max-w-3xl">
      <Eyebrow>Configuración del explorador</Eyebrow>
      <h1 className="display-hero mt-3">Perfil & ajustes</h1>

      <div className="card mt-8 space-y-6 p-6 md:p-8">
        <ErrorNote error={error} />
        <div className="grid gap-6 sm:grid-cols-2">
          <L label="Nombre visible">
            <input className="field" value={form.display_name ?? ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </L>
          <L label="Nombre de usuario">
            <input
              className="field"
              value={form.username ?? ''}
              pattern="[a-z0-9_]{3,30}"
              title="3-30 caracteres: minúsculas, números o _"
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
            />
          </L>
          <L label="País de origen">
            <select className="field" value={form.home_country ?? ''} onChange={(e) => setForm({ ...form, home_country: e.target.value })}>
              <option value="">—</option>
              {list.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </L>
          <L label="Ciudad">
            <input className="field" value={form.home_city ?? ''} onChange={(e) => setForm({ ...form, home_city: e.target.value })} />
          </L>
        </div>
        <AvatarPicker userId={user.id} value={form.avatar_url ?? null} onChange={(avatar_url) => setForm({ ...form, avatar_url })} />
        <L label="Bio">
          <textarea className="field min-h-20" value={form.bio ?? ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </L>
        <label className="flex items-start gap-3 rounded-sm bg-surface-low p-4">
          <input type="checkbox" className="mt-1" checked={!!form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} />
          <span>
            <span className="font-display font-semibold">Perfil público</span>
            <span className="block text-sm text-ink-soft">Otros podrán ver tus viajes, rutas y países. Tus pasaportes siempre son privados.</span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button className="btn btn-dark" onClick={save}>
            Guardar cambios
          </button>
          {saved && <span className="label-code text-accent-deep">Guardado</span>}
        </div>
      </div>

      <div className="card mt-6 flex flex-wrap items-center gap-3 p-6">
        <div className="mr-auto">
          <div className="font-display font-semibold">Sesión</div>
          <div className="text-sm text-ink-soft">{user.email}</div>
        </div>
        {demo && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('¿Restaurar los datos de ejemplo? Se perderán los cambios del modo demo.')) {
                resetDemo()
                qc.invalidateQueries()
              }
            }}
          >
            <Icon name="restart_alt" size={18} /> Restaurar datos demo
          </button>
        )}
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <Icon name="logout" size={18} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}

/** Elige un monigote (o una imagen propia por URL). `null` = el monigote por defecto de la cuenta. */
function AvatarPicker({ userId, value, onChange }: { userId: string; value: string | null; onChange: (url: string | null) => void }) {
  const fallback = defaultAvatar(userId)
  const current = value || fallback
  const custom = !!value && !AVATARS.includes(value)
  const [showUrl, setShowUrl] = useState(custom)
  return (
    <div>
      <span className="label-code mb-3 block">Foto de perfil</span>
      <div className="flex flex-wrap items-center gap-5 rounded-sm bg-surface-low p-4">
        <Avatar profile={{ id: userId, avatar_url: value }} className="h-20 w-20 shrink-0 ring-2 ring-accent ring-offset-2" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold">{custom ? 'Imagen propia' : 'Tu monigote'}</div>
          <p className="text-sm text-ink-soft">Elige uno de los garabatos o usa una imagen tuya.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost py-1.5!"
              onClick={() => onChange(AVATARS.filter((a) => a !== current)[Math.floor(Math.random() * (AVATARS.length - 1))])}
            >
              <Icon name="casino" size={18} /> Sorpréndeme
            </button>
            {value && (
              <button type="button" className="btn py-1.5! text-ink-soft" onClick={() => onChange(null)}>
                Volver al de por defecto
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange(a === fallback ? null : a)}
            aria-label="Elegir este monigote"
            aria-pressed={current === a}
            className={`rounded-full p-0.5 transition hover:scale-110 ${current === a ? 'ring-2 ring-accent' : ''}`}
          >
            <img src={a} alt="" loading="lazy" className="aspect-square w-full rounded-full" />
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <button type="button" className="underline" onClick={() => setShowUrl(!showUrl)}>
          {showUrl ? 'Ocultar' : 'Usar una imagen propia (URL)'}
        </button>
        <span>
          Monigotes:{' '}
          <a className="underline" href="https://www.dicebear.com/styles/croodles/" target="_blank" rel="noreferrer">
            Croodles
          </a>{' '}
          de Vijay Verma (CC BY 4.0), vía DiceBear
        </span>
      </div>
      {showUrl && (
        <input
          className="field mt-2"
          placeholder="https://…/mi-foto.jpg"
          value={custom ? value! : ''}
          onChange={(e) => onChange(e.target.value.trim() || null)}
        />
      )}
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-code mb-2 block">{label}</span>
      {children}
    </label>
  )
}
