import { useState } from 'react'
import { avatarFor, defaultAvatar } from '../lib/avatars'

/** Foto de perfil; si no hay, o la URL falla, el monigote por defecto del usuario. */
export function Avatar({
  profile,
  className = '',
}: {
  profile: { id: string; avatar_url: string | null; display_name?: string | null; username?: string } | undefined | null
  className?: string
}) {
  const [broken, setBroken] = useState<string | null>(null)
  if (!profile) return <span className={`block rounded-full bg-surface-container ${className}`} />
  const url = avatarFor(profile)!
  const src = broken === url ? defaultAvatar(profile.id) : url
  return (
    <img
      src={src}
      alt={profile.display_name || profile.username || 'Avatar'}
      onError={() => setBroken(url)}
      className={`block rounded-full bg-surface-container object-cover ${className}`}
    />
  )
}
